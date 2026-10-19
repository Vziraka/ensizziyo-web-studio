import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readJson, privateStateDirectory, saveJson as saveJsonControl } from './engine.mjs';
import { readPrivateJson } from './prospects.mjs';
import { controllerStatus, runController, validateControllerConfig } from './controller.mjs';
import { GoogleQueue } from './google.mjs';
import { check } from './lifecycle.mjs';
import { syncResearchImports } from './production.mjs';
import { publishLifecycle } from './lifecycle-sync.mjs';
import { callSupply } from './call-desk.mjs';
import { runtimeVersion } from './runtime-version.mjs';
const runningVersion=runtimeVersion();
const technicalFailures=result=>(result.jobs??[]).filter(j=>j.status==='Held'&&/^(WORKER_|PROVIDER_|SOURCE_|FETCH_)/.test(j.reason??''));
export function updateFailureGuard(previous, result, version) {
  const failures=technicalFailures(result);
  if(!previous||previous.version!==version)return {version,seen:failures.map(j=>j.job_id),counts:{}};
  const guard=structuredClone(previous);
  for(const job of failures)if(!guard.seen.includes(job.job_id)){guard.seen.push(job.job_id);guard.counts[job.reason]=(guard.counts[job.reason]??0)+1;}
  guard.blocked=Object.entries(guard.counts).find(([,count])=>count>=2)?.[0]??null;
  return guard;
}

const compact = result => {
  const held = result.jobs?.filter(j => j.status === 'Held') ?? [];
  return { status: result.status, campaign: result.campaign, counts: result.counts, calls_reserved: result.calls_reserved,
    ...(held.length ? { reason: `${held.length} research job(s) held. ${held.map(j => `${j.job_id}: ${j.reason ?? 'Reconciliation required'}. ${j.next_action ?? 'Inspect the retained job before retrying.'}`).join(' ')}`.slice(0, 500) } : {}) };
};

export async function researchTick(app, { signal, run = runController, queueFactory = config => new GoogleQueue(config), monitorMs = 1000 } = {}) {
  check(Number.isInteger(monitorMs) && monitorMs >= 1 && monitorMs <= 5000, 'Bounded research control monitor required');
  const path = join(app.directory, 'lifecycle-config.json'), bound = await readJson(path);
  if (bound.mode !== 'production' || bound.research?.supervised !== true) return { status: 'Disabled' };
  const directory = await privateStateDirectory(bound.research.source_directory);
  const config = validateControllerConfig(await readPrivateJson(join(directory, 'controller-config.json')));
  const progress = await controllerStatus(directory, config, undefined, app.now);
  if (progress.status !== 'Ready') return compact(progress);
  if (callSupply(await app.snapshot(), app.now()).full) return { ...compact(progress), status: 'Buffer full', reason: 'Two days of eligible call cards are ready; research will resume as they are used.' };
  const version=(await runningVersion).source_sha256;
  const guard=await app.change(state=>state.research_failure_guard=updateFailureGuard(state.research_failure_guard,progress,version));
  if(guard.blocked)return {...compact(progress),status:'Needs attention',reason:`Repeated technical failure (${guard.blocked}). Review the retained failures and install a verified correction before more research attempts.`};
  if (!config.job_ids.length) return { ...compact(progress), status: 'Waiting' };
  if (progress.jobs.every(j => ['Complete', 'Held'].includes(j.status)))
    return { ...compact(progress), status: progress.counts.Held ? 'Needs attention' : 'Complete' };
  if (!Object.values(progress.usage_policy).some(p => p.enabled && p.calls_today < p.daily_calls)) return { ...compact(progress), status: 'Deferred' };
  for (const file of [join(directory, '.controller', '.runner.lock'), join(directory, '.runner.lock')]) {
    try { await readJson(file); return { ...compact(progress), status: 'Held', reason: 'A research lock is retained. Confirm its owner/process and reconcile; the service never clears locks.' }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  signal?.throwIfAborted();
  const active = new AbortController(), monitoring = new AbortController();
  const workerSignal = AbortSignal.any([active.signal, signal].filter(Boolean));
  const monitor = (async () => {
    try {
      while (!monitoring.signal.aborted) {
        await delay(monitorMs, undefined, { signal: monitoring.signal });
        const current = await readJson(path);
        if (current.mode !== 'production' || current.research?.supervised !== true || current.research.source_directory !== bound.research.source_directory)
          active.abort(Object.assign(Error('Research supervision or source binding changed; owned work is stopping'), { code: 'CONTROLLER_PAUSED' }));
      }
    } catch (error) { if (!monitoring.signal.aborted) active.abort(error); }
  })();
  try {
    const google = await readPrivateJson(join(directory, 'google-config.json'));
    await app.change(s => { s.research_runtime = { ...s.research_runtime, status: 'Running', checked_at: app.now().toISOString(), campaign: config.campaign }; });
    const result = await run({ directory, config, queue: queueFactory({ ...google, minRequestIntervalMs: 1250 }), signal: workerSignal, once: true });
    await app.change(state=>{state.research_failure_guard=updateFailureGuard(state.research_failure_guard,result,version);});
    return { ...compact(result), ...(active.signal.aborted ? { status: 'Paused' } : {}) };
  } catch (error) {
    if (active.signal.aborted && !signal?.aborted) return { ...compact(progress), status: 'Paused' };
    throw error;
  } finally { monitoring.abort(); await monitor; }
}

export async function setResearchPriority(app, priority) {
  check(['research', 'website', 'client'].includes(priority), 'Choose research, website or client priority');
  return app.change(async () => {
    const path = join(app.directory, 'lifecycle-config.json'), config = await readJson(path);
    check(config.mode === 'production' && config.research?.supervised === true && config.research.approval_ref?.length > 5, 'Connect the owner-approved research controller first');
    const directory = await privateStateDirectory(config.research.source_directory), controlPath = join(directory, 'research-control.json');
    const controller = validateControllerConfig(await readPrivateJson(join(directory, 'controller-config.json')));
    const progress = await controllerStatus(directory, controller, undefined, app.now);
    check(progress.priority !== 'unknown', 'Research control is unavailable; preserve the hold');
    if (priority === 'research') check(controller.job_ids.length && Object.values(controller.providers).some(p => p.enabled && p.included_usage_only_confirmed), 'An approved named campaign and included subscription allowance are required');
    const control = await readJson(controlPath);
    await saveJsonControl(controlPath, { ...control, enabled: false });
    config.priority = priority === 'research' ? 'idle' : priority;
    await saveJsonControl(path, config);
    await saveJsonControl(controlPath, { ...control, enabled: true, priority });
    const saved = await readJson(controlPath);
    check(saved.enabled === true && saved.priority === priority && (await readJson(path)).priority === config.priority, 'Research priority readback failed; inspect the saved controls');
    app.config = config; return { priority, research_enabled: priority === 'research' };
  });
}

export async function researchHandoff(app, { importResults = syncResearchImports, publish = publishLifecycle } = {}) {
  const config = await readJson(join(app.directory, 'lifecycle-config.json'));
  if (config.mode !== 'production' || !config.research?.auto_import || config.research.supervised !== true) return { status: 'Disabled' };
  const control = await readJson(join(await privateStateDirectory(config.research.source_directory), 'research-control.json'));
  check(control.schema_version === 1 && typeof control.enabled === 'boolean', 'Research handoff control is unavailable');
  if (!control.enabled) return { status: 'Disabled' };
  const result = await importResults(app);
  if (result.examined) await app.change(s => { s.research_projection_due = true; });
  if ((await app.snapshot()).research_projection_due) {
    check(config.google, 'Bind the existing tracker projection before synchronizing reviewed records');
    await publish(app);
    await app.change(s => { s.research_projection_due = false; });
  }
  return result;
}

export async function runResearchService(app, { signal, tick = researchTick, handoff = researchHandoff, intervalMs = 60_000, wait = delay } = {}) {
  check(Number.isInteger(intervalMs) && intervalMs >= 1000 && intervalMs <= 60_000, 'Bounded research service interval required');
  try {
    while (!signal?.aborted) {
      let result;
      try { result = await tick(app, { signal }); }
      catch (error) {
        if (signal?.aborted) break;
        result = { status: 'Held', reason: String(error.message).slice(0, 500) };
      }
      try { const result = await handoff(app); if (result?.status !== 'Disabled') await app.change(s => { s.exceptions = s.exceptions.filter(e => e.id !== 'research-handoff'); }); }
      catch (error) { await app.change(s => { s.exceptions = s.exceptions.filter(e => e.id !== 'research-handoff'); s.exceptions.push({ id: 'research-handoff', reason: `Research handoff held: ${String(error.message).slice(0, 400)}` }); }); }
      await app.change(state => {
        state.research_runtime = { ...result, checked_at: app.now().toISOString() };
        state.exceptions = state.exceptions.filter(e => e.id !== 'research-service');
        if (result.reason && ['Held','Needs attention'].includes(result.status)) state.exceptions.push({ id: 'research-service', reason: result.reason });
      });
      try { await wait(intervalMs, undefined, { signal }); } catch { if (!signal?.aborted) throw Error('Research service wait failed'); }
    }
  } finally {
    await app.change(state => { state.research_runtime = { ...state.research_runtime, status: 'Stopped', stopped_at: app.now().toISOString() }; });
  }
}
