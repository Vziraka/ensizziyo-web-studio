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

const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/money.js', ['money.js', 'text/javascript']], ['/app.css', ['app.css', 'text/css']],
  ['/call-desk.js', ['call-desk.js', 'text/javascript']], ['/preview/', ['preview.html', 'text/html']], ['/preview.js', ['preview.js', 'text/javascript']]]);
export function serveLifecycle(app, { port = 8807, quiet = false, analyze = assessTranscript } = {}) {
  const version = runtimeVersion();
  check(Number.isInteger(port) && port >= 0 && port <= 65535, 'Invalid local port');
  const session = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex'), work = new Map();
  const abort = new AbortController();
  const server = createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
    const json = (status, value) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      check(req.headers.host === `127.0.0.1:${server.address().port}`, 'Unrecognized local host');
      check(!req.headers.origin || req.headers.origin === origin, 'Cross-origin requests are blocked');
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        res.writeHead(200, { ...headers, 'Content-Type': `${type}; charset=utf-8`, ...(url.pathname === '/' ? { 'Set-Cookie': `studio_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` } : {}) });
        res.end(await readFile(join(fileURLToPath(new URL('./lifecycle-ui/', import.meta.url)), file))); return;
      }
      check(!req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']), 'Cross-site requests are blocked');
      check(req.headers.cookie?.split(';').some(x => x.trim() === `studio_session=${session}`), 'Open the private console first');
      if (req.method === 'GET' && url.pathname === '/api/state') return json(200, { ...await app.dashboard(), build:await version, csrf, workers: [...work.keys()] });
      if (req.method === 'GET' && /^\/proposal\/[a-zA-Z0-9_-]{1,100}$/.test(url.pathname)) {
        const record = (await app.snapshot()).prospects[url.pathname.slice('/proposal/'.length)]; check(record, 'Unknown proposal');
        res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(renderProposal(record)); return;
      }
      check(req.method === 'POST' && req.headers['x-studio-token'] === csrf && req.headers['content-type'] === 'application/json', 'Owner session and same-origin approval token required');
      let bytes = 0, chunks = [];
      for await (const chunk of req) { bytes += chunk.length; check(bytes <= 120_000, 'Request too large'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (url.pathname === '/api/event') {
        check(!['prospect_imported', 'verification_imported', 'transcript_assessed', 'reply_received', 'email_delivered', 'meeting_verified'].includes(input.event?.type), 'Provider/research/worker events cannot be submitted as owner decisions');
        const result = await app.apply(input.event, { actor: app.config.mode === 'controlled' ? 'controlled-fixture' : 'owner', expectedRevision: input.revision });
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
      if (url.pathname === '/api/information-draft') return json(200, await saveInformationDraft(app,input));
      if (url.pathname === '/api/information-send') return json(200, await sendInformation(app,input));
      if (url.pathname === '/api/pause') {
        return json(200, await pauseStudio(app));
      }
      if (url.pathname === '/api/research-priority') return json(200, await setResearchPriority(app, input.priority));
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
