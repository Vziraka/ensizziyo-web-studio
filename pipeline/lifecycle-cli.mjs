import {prepareTeamNotifications,notificationView} from './team-notifications.mjs';
import {projectContext,projectWorkContext,resolveProject} from './project-work.mjs';
import {readProjectAsset,recoverDriveAsset} from './project-assets.mjs';
import {AppConnectors} from './app-connectors.mjs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { StudioLifecycle, initialConfig, check } from './lifecycle.mjs';
import { readJson } from './engine.mjs';
import { seedLifecycle } from './lifecycle-fixtures.mjs';
import { assessTranscript } from './lifecycle-ai.mjs';
import { LifecycleBridge } from './lifecycle-bridge.mjs';
import { productionConfig, operationsFor, importResearch, importVerification, approveProductionRelease, approveCallRelease, pauseStudio } from './production.mjs';

async function main() {
  const [command, key, operation, actionId, prospectId] = process.argv.slice(2), directory = process.env.STUDIO_LIFECYCLE_STATE_DIR;
  if (command === 'restore') return StudioLifecycle.restore({ input: key, destination: directory });
  if (command === 'init') return { directory: (await StudioLifecycle.initialize({ directory, config: { ...initialConfig, run_id: `lifecycle-${randomUUID()}` } })).directory };
  if (command === 'init-production') return { directory: (await StudioLifecycle.initialize({ directory, config: structuredClone(productionConfig) })).directory, outreach: 'paused' };
  if (command === 'service') { const { startStudioService } = await import('./service-host.mjs'); return startStudioService(directory); }
  const app = await StudioLifecycle.open({ directory });
  if (command === 'seed') return seedLifecycle(app);
  if(command==='project-context'){const state=await app.snapshot();return operation?projectWorkContext(state,key,operation):projectContext(state,key);}
  if(command==='project-resolve')return resolveProject(await app.snapshot(),key);
  if(command==='project-asset'){const {bytes,...result}=await readProjectAsset(app,key,operation,actionId);return result;}
  if(command==='project-author'){
    const author=await import('./project-authoring.mjs'),input=await readJson(operation),actor=input.actor??'owner';
    if(key==='claim')return author.claimAuthoring(app,input,actor);
    if(key==='render')return author.renderAuthoring(app,input,await readJson(actionId),actor);
    if(key==='resume')return author.resumeAuthoring(app,input,actor);
    if(key==='review')return author.reviewAuthoring(app,input,actor);
    if(key==='revise')return author.reviseAuthoring(app,input,actor);
    check(key==='inspect','Use project-author claim, render, resume, review, revise or inspect');return author.inspectAuthoring(app,input,actor);
  }
  if(command==='recover-drive-asset'){
    const context=projectContext(await app.snapshot(),key),connector=new AppConnectors({cwd:process.cwd(),accountLinks:{google_drive:process.env.STUDIO_DRIVE_ACCOUNT_LINK}});
    try{await connector.connect();return await recoverDriveAsset(app,{project_id:key,asset_id:operation,version_id:actionId,expected_sha256:prospectId,context_sha256:context.context_sha256},{connector,email:process.env.STUDIO_DRIVE_ACCOUNT_EMAIL});}finally{await connector.close();}
  }
  if(command==='notifications')return notificationView(await app.snapshot());
  if(command==='prepare-notifications')return prepareTeamNotifications(app);
  if (command === 'status') return app.dashboard();
  if(command==='discover-home-100'){const {startDiscoveryCampaign}=await import('./discovery-batches.mjs');return startDiscoveryCampaign(app,{id:key,target:100,verification_ref:operation});}
  if (command === 'ops-next') {
    const ops = operationsFor(app, process.env.STUDIO_LIFECYCLE_SESSION), result = await ops.next();
    if (result.status === 'Complete') { await ops.effects(); const { maintainOperations } = await import('./lifecycle-maintenance.mjs'); result.maintenance = await maintainOperations(app); Object.assign(result, await ops.report()); }
    return result;
  }
  if (command === 'ops-settle') {
    check(/^[a-zA-Z0-9_-]{1,100}$/.test(key ?? ''), 'Invalid operations receipt key');
    const result = await operationsFor(app, process.env.STUDIO_LIFECYCLE_SESSION).settle(key, await readJson(join(app.directory, 'receipts', `${key}.json`)));
    check(result.status === 'Done', 'Provider receipt failed; inspect the hold and continue other controlled records'); return result;
  }
  if (command === 'ops-ack') return app.change(state => { check(state.operations?.notification?.fingerprint === key, 'Acknowledge only the current exception report'); state.operations.notification.last_notified = key; return { acknowledged: true }; });
  if (command === 'event') return app.apply(await readJson(key), { actor: app.config.mode === 'controlled' ? 'controlled-fixture' : 'owner' });
  if (command === 'import-research') return importResearch(app, process.env.STUDIO_STATE_DIR, key, operation ? await readJson(operation) : undefined);
  if (command === 'import-verification') return importVerification(app, await readJson(key));
  if (command === 'release-calls') return approveCallRelease(app, key, operation);
  if (command === 'release') return approveProductionRelease(app, key, operation);
  if (command === 'assess') return assessTranscript(app, key, operation);
  if (command === 'publish') { const { publishLifecycle } = await import('./lifecycle-sync.mjs'); return publishLifecycle(app); }
  if (command === 'booking-check') { const { checkCalendarReceipt } = await import('./lifecycle-documents.mjs'); return checkCalendarReceipt(await readJson(key), app.config.calendar, app.now()); }
  if (command === 'serve') { const { serveLifecycle } = await import('./lifecycle-server.mjs'); const server = await serveLifecycle(app, { port: Number(process.env.STUDIO_LIFECYCLE_PORT ?? 8807) }); process.once('SIGINT', () => server.close()); process.once('SIGTERM', () => server.close()); return; }
  if (command === 'backup') { await mkdir(join(app.directory, 'backups'), { recursive: true }); return app.backup(key ?? join(app.directory, 'backups', `lifecycle-${Date.now()}.json`)); }
  if (command === 'pause') { await pauseStudio(app); return { execution: 'paused' }; }
  const bridge = new LifecycleBridge(app, process.env.STUDIO_LIFECYCLE_SESSION);
  if (command === 'prepare') return bridge.prepare(key, operation, actionId, prospectId);
  if (command === 'settle') { check(/^[a-zA-Z0-9_-]{1,100}$/.test(key ?? ''), 'Invalid receipt key'); return bridge.settle(key, await readJson(join(app.directory, 'receipts', `${key}.json`))); }
  throw Error('Use init, init-production, import-research, discover-home-100, release, seed, status, project-resolve, project-context, project-asset, recover-drive-asset, notifications, prepare-notifications, event, assess, serve, service, prepare, settle, ops-next, ops-settle, ops-ack, pause, backup or restore');
}
try { const result = await main(); if (result !== undefined) console.log(JSON.stringify(result)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
