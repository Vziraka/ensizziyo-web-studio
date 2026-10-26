import {callTranscriptionView,approveCallTranscription,runCallTranscription,pauseCallTranscription} from './call-transcription.mjs';
import {createEmailDraftTask,emailDraftTaskContext,submitEmailDraftResult,adoptEmailDraftResult} from './email-draft-tasks.mjs';
import {retainedSource} from './retained-sources.mjs';
import {prepareTeamNotifications,notificationView} from './team-notifications.mjs';
import {projectContext,projectWorkContext,resolveProject} from './project-work.mjs';
import {readProjectAsset} from './project-assets.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { check } from './lifecycle.mjs';
import { assessTranscript } from './lifecycle-ai.mjs';
import { readJson } from './engine.mjs';
import { renderProposal } from './lifecycle-documents.mjs';
import { queueMeeting, pauseStudio } from './production.mjs';
import { setResearchPriority } from './research-service.mjs';
import { callingSession, saveInformationDraft, sendInformation, availableMeetingSlots } from './call-desk-actions.mjs';
import { runtimeVersion } from './runtime-version.mjs';
import {startDiscoveryBatch,controlDiscoveryBatch} from './discovery-batches.mjs';
import {renderFollowUpPreview} from './follow-up-template.mjs';
import { createOperatorAuth } from './operators.mjs';
import {audioRequest,saveCallAudio,readCallAudio,reconcileCallAudio,localAudioStore} from './call-audio.mjs';

import {lifecycleAssets} from './lifecycle-assets.mjs';
export {lifecycleAssets};
export function serveLifecycle(app, { port = 8807, quiet = false, analyze = assessTranscript, operatorAuth = createOperatorAuth() } = {}) {
  const version = runtimeVersion();
  check(Number.isInteger(port) && port >= 0 && port <= 65535, 'Invalid local port');
  const session = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex'), work = new Map();
  const abort = new AbortController();
  const server = createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
    const json = (status, value, extra = {}) => { res.writeHead(status, { ...headers, ...extra, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    const readInput = async () => {
      let bytes = 0, chunks = [];
      for await (const chunk of req) { bytes += chunk.length; check(bytes <= 120_000, 'Request too large'); chunks.push(chunk); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    };
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      check(req.headers.host === `127.0.0.1:${server.address().port}`, 'Unrecognized local host');
      check(!req.headers.origin || req.headers.origin === origin, 'Cross-origin requests are blocked');
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && lifecycleAssets.has(url.pathname)) {
        const [file, type] = lifecycleAssets.get(url.pathname);
        res.writeHead(200, { ...headers, 'Content-Type': `${type}; charset=utf-8`, ...(url.pathname === '/' ? { 'Set-Cookie': `studio_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` } : {}) });
        res.end(await readFile(join(fileURLToPath(new URL('./lifecycle-ui/', import.meta.url)), file))); return;
      }
      check(!req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']), 'Cross-site requests are blocked');
      if(/^\/api\/email-draft-task\/[a-zA-Z0-9_-]{1,80}\/(context|result)$/.test(url.pathname)){
        const [,,,id,command]=url.pathname.split('/'),token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization??'')?.[1];
        if(req.method==='GET'&&command==='context')return json(200,await emailDraftTaskContext(app,id,token));
        check(req.method==='POST'&&command==='result'&&req.headers['content-type']==='application/json','Use the exact task context/result operation');
        return json(200,await submitEmailDraftResult(app,id,token,await readInput()));
      }
      check(req.headers.cookie?.split(';').some(x => x.trim() === `studio_session=${session}`), 'Open the private console first');
      if (req.method === 'GET' && url.pathname === '/api/bootstrap') return json(200, { csrf, operator_auth_required: Boolean(operatorAuth) });
      if (req.method === 'POST' && url.pathname === '/api/login') {
        check(operatorAuth && req.headers['x-studio-token'] === csrf && req.headers['content-type'] === 'application/json', 'Operator login is unavailable or the request is invalid');
        const input = await readInput(), actor = operatorAuth.authenticate(input.key);
        if (!actor) return json(401, { error: 'The operator key was not recognized' });
        return json(200, { operator: actor }, { 'Set-Cookie': operatorAuth.cookie(operatorAuth.issue(actor), { secure: Boolean(req.socket.encrypted) }) });
      }
      const operator = operatorAuth ? operatorAuth.actorFromCookie(req.headers.cookie) : 'owner';
      if (operatorAuth && !operator) return json(401, { error: 'Sign in with your operator key to continue' });
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        check(operatorAuth && operator && req.headers['x-studio-token'] === csrf && req.headers['content-type'] === 'application/json', 'Operator session or approval token required');
        return json(200, { signed_out: true }, { 'Set-Cookie': operatorAuth.cookie('', { secure: Boolean(req.socket.encrypted), clear: true }) });
      }
      if(req.method==='GET'&&/^\/api\/project-context\/[a-zA-Z0-9_-]{1,100}(?:\/[a-zA-Z0-9_-]{1,100})?$/.test(url.pathname)){const [,,,project,workId]=url.pathname.split('/'),snapshot=await app.snapshot();return json(200,workId?projectWorkContext(snapshot,project,workId):projectContext(snapshot,project));}
      if(req.method==='GET'&&url.pathname==='/api/project-resolve')return json(200,resolveProject(await app.snapshot(),url.searchParams.get('name')));
      if(req.method==='GET'&&/^\/api\/project-asset\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,100}$/.test(url.pathname)){
        const [,,,project,asset,version]=url.pathname.split('/'),original=await readProjectAsset(app,project,asset,version);
        res.writeHead(200,{...headers,'Content-Type':'application/pdf','Content-Length':original.bytes.length,'Content-Disposition':`attachment; filename="${original.filename}"`,'X-Content-SHA256':original.original.sha256});res.end(original.bytes);return;
      }
      if(req.method==='GET'&&/^\/retained-source\/[a-zA-Z0-9_-]{1,100}\/[a-f0-9]{64}$/.test(url.pathname)){const [,,project,sha]=url.pathname.split('/');return json(200,retainedSource(await app.snapshot(),project,sha,url.searchParams.get('url'),url.searchParams.get('at')));}
      if(req.method==='GET'&&url.pathname==='/api/call-transcription')return json(200,await callTranscriptionView(app));
      if(req.method==='GET'&&url.pathname==='/api/team-notifications')return json(200,notificationView(await app.snapshot()));
      if (req.method === 'GET' && url.pathname === '/api/state') return json(200, { ...await app.dashboard(), build:await version, csrf, workers: [...work.keys()], current_operator: operator, operator_auth_enabled: Boolean(operatorAuth) });
      if(req.method==='GET'&&/^\/call-audio\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,80}$/.test(url.pathname)){
        const [, ,project,id]=url.pathname.split('/'),clip=await readCallAudio(app,localAudioStore(app.directory),project,id);
        res.writeHead(200,{...headers,'Content-Type':clip.audio.mime,'Content-Length':clip.bytes.length,'Content-Disposition':`inline; filename="${clip.filename}"`});res.end(clip.bytes);return;
      }
      if(req.method==='POST'&&url.pathname==='/api/call-audio'){
        check(req.headers['x-studio-token']===csrf,'Current same-origin approval token required');
        const {input,bytes}=await audioRequest(new Request(origin+url.pathname,{method:'POST',headers:req.headers,body:req,duplex:'half'}));
        return json(200,await saveCallAudio(app,localAudioStore(app.directory),input,bytes,operator));
      }
      if(req.method==='GET'&&/^\/follow-up(?:-draft|-history)?\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,100}$/.test(url.pathname)){
        const [, route,prospectId,entryId]=url.pathname.split('/'),record=(await app.snapshot()).prospects[prospectId];
        let saved;
        if(route==='follow-up-draft')saved=record?.follow_up_drafts?.find(draft=>draft.id===entryId);
        else if(route==='follow-up-history'){if(Object.hasOwn(record?.follow_up_history??[],entryId))saved=record.follow_up_history[entryId];}
        else saved=record?.follow_ups?.[entryId];
        const entry=route==='follow-up-history'&&saved?{...saved,status:'Superseded original; retained for history'}:saved;check(entry?.content,'Unknown saved follow-up');
        res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(renderFollowUpPreview(entry));return;
      }
      if (req.method === 'GET' && /^\/proposal\/[a-zA-Z0-9_-]{1,100}$/.test(url.pathname)) {
        const record = (await app.snapshot()).prospects[url.pathname.slice('/proposal/'.length)]; check(record, 'Unknown proposal');
        res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(renderProposal(record)); return;
      }
      check(req.method === 'POST' && req.headers['x-studio-token'] === csrf && req.headers['content-type'] === 'application/json', 'Owner session and same-origin approval token required');
      const input = await readInput();
      if(url.pathname==='/api/email-draft-tasks/create'){check(operatorAuth,'Individual operator sign-in required for email draft tasks');return json(200,await createEmailDraftTask(app,input,operator));}
      if(url.pathname==='/api/email-draft-tasks/adopt'){check(operatorAuth,'Individual operator sign-in required for email draft tasks');return json(200,await adoptEmailDraftResult(app,input,operator));}
      if(url.pathname==='/api/team-notifications/prepare')return json(200,await prepareTeamNotifications(app));
      if(url.pathname==='/api/call-transcription/approve')return json(200,await approveCallTranscription(app,input,operator));
      if(url.pathname==='/api/call-transcription/run')return json(200,await runCallTranscription(app,localAudioStore(app.directory),input,operator));
      if(url.pathname==='/api/call-audio-check')return json(200,await reconcileCallAudio(app,localAudioStore(app.directory),input.prospect_id,input.id));
      if (url.pathname === '/api/event') {
        check(!['prospect_imported', 'verification_imported', 'transcript_assessed', 'reply_received', 'email_delivered', 'meeting_verified','call_audio_reserved','call_audio_stored'].includes(input.event?.type), 'Provider/research/worker events cannot be submitted as owner decisions');
        const result = await app.apply(input.event, { actor: operator, expectedRevision: input.revision });
        if (input.event.type === 'transcript_added') {
          const config = await readJson(join(app.directory, 'lifecycle-config.json'));
          if (config.transcript_ai.enabled && ['idle', 'client'].includes(config.priority)) start(input.event.prospect_id, input.event.data.call_id);
        }
        return json(200, result);
      }
      if (url.pathname === '/api/analyze') { start(input.prospect_id, input.call_id); return json(202, { queued: true }); }
      if (url.pathname === '/api/booking') return json(202, await queueMeeting(app, input));
      if (url.pathname === '/api/slots') return json(200, await availableMeetingSlots(app));
      if (url.pathname === '/api/calling-session') return json(200, await callingSession(app,input));
      if (url.pathname === '/api/information-draft') return json(200, await saveInformationDraft(app,input,operator));
      if (url.pathname === '/api/information-send') return json(200, await sendInformation(app,input,{actor:operator}));
      if (url.pathname === '/api/pause') {
        const paused=await pauseStudio(app);return json(200,{...paused,...await pauseCallTranscription(app,operator)});
      }
      if (url.pathname === '/api/research-priority') return json(200, await setResearchPriority(app, input.priority));
      if (url.pathname === '/api/discovery-batches') return json(202,await startDiscoveryBatch(app,input));
      if (url.pathname === '/api/discovery-control') return json(200,await controlDiscoveryBatch(app,input));
      if (url.pathname === '/api/backup') {
        await mkdir(join(app.directory, 'backups'), { recursive: true, mode: 0o700 });
        return json(200, await app.backup(join(app.directory, 'backups', `lifecycle-${Date.now()}.json`)));
      }
      return json(404, { error: 'Unknown local action' });
    } catch (error) { if (!res.headersSent) json(400, { error: error.message }); else res.end(); }
  });
  function start(prospectId, callId) {
    check(typeof prospectId === 'string' && typeof callId === 'string', 'Choose a connected call');
    const id = `${prospectId}:${callId}`; check(!work.has(id), 'Transcript analysis is already running');
    const promise = analyze(app, prospectId, callId, { signal: abort.signal }).catch(() => {}).finally(() => work.delete(id)); work.set(id, promise);
  }
  server.on('close', () => abort.abort());
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      if (!quiet) console.log(JSON.stringify({ ready: true, url: `http://127.0.0.1:${server.address().port}`, mode: app.config.mode, research: 'paused', outreach: 'paused', pid: process.pid }));
      resolve(server);
    });
  });
}
