import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { invokeCLI } from './workers.mjs';
import { readCodexUsage } from './usage.mjs';
import { readJson, saveJson, alive } from './engine.mjs';
import { check, hash, businessDate, validateTranscriptProposal } from './lifecycle.mjs';

import {transcriptSchema,reviewSchema,publishAssessment,acceptedTranscriptReview,transcriptAuthorPrompt,transcriptReviewerPrompt} from './transcript-assessment-contract.mjs';
export {transcriptSchema,acceptedTranscriptReview} from './transcript-assessment-contract.mjs';

// A transcript is a customer artifact, never an instruction source or authority to send/quote/charge.
export async function assessTranscript(app, prospectId, callId, { invoke = invokeCLI, usage = readCodexUsage, signal } = {}) {
  const active = new AbortController();
  const abort = () => active.abort(); signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) active.abort();
  const configPath = join(app.directory, 'lifecycle-config.json');
  const ensureAllowed = async () => {
    const config = await readJson(configPath), ai = config.transcript_ai;
    check(ai.enabled === true && ['idle', 'client'].includes(config.priority), 'Transcript AI paused for owner priority or disabled allowance');
    check([['gpt-5.6-luna', 'gpt-5.6-sol'], ['gpt-6-luna', 'gpt-6.1-sol']].some(([author, reviewer]) => ai.author_model === author && ai.reviewer_model === reviewer) && ai.effort === 'high', 'Use the owner-selected Luna/high and Sol/high models');
    check(Number.isInteger(ai.daily_calls) && ai.daily_calls >= 2 && ai.daily_calls <= 20 && ai.reserve_percent >= 30, 'Invalid bounded subscription allowance');
    active.signal.throwIfAborted(); return ai;
  };
  let record, transcript;
  await app.change(state => {
    record = state.prospects[prospectId]; transcript = record?.transcripts[callId];
    check(transcript && (record.stage === 'Connected review' || record.approved_calls[callId]) && !record.restriction, 'A saved connected-call transcript is required');
    check(!Object.values(state.ai_attempts).some(a => a.status === 'Running' && (a.child_pid && alive(a.child_pid) || a.controller_pid && alive(a.controller_pid))), 'Another subscription worker is active');
    for (const a of Object.values(state.ai_attempts)) if (a.status === 'Running') { a.status = 'Interrupted'; a.child_pid = null; a.error = 'Stopped process confirmed; retained transcript/result may be resumed'; }
  });
  const directory = join(app.directory, 'transcripts', hash(`${prospectId}:${callId}:${transcript.sha256}`).slice(0, 32));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const attempts = [];
  let proposal, existingReview;
  try { proposal = await readJson(join(directory, 'proposal.json')); validateTranscriptProposal(proposal, transcript); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { existingReview = await readJson(join(directory, 'review.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (proposal && existingReview && acceptedTranscriptReview(existingReview, proposal)) {
    return publishAssessment(app, prospectId, callId, proposal, existingReview);
  }
  const timer = setInterval(() => { ensureAllowed().catch(abort); }, 2000); timer.unref();
  const run = async (phase, prompt, schema) => {
    const ai = await ensureAllowed(), allowance = await usage({ signal: active.signal });
    await app.change(state => { state.subscription_status = { ...allowance, reserve_percent: ai.reserve_percent }; });
    check(allowance?.authenticated_subscription === true && allowance?.buckets?.length && allowance.buckets.every(b => b.remaining_percent > ai.reserve_percent), 'Preserve website/client subscription reserve; allowance unavailable or too low');
    const id = randomUUID(), today = businessDate(app.now());
    await app.change(state => {
      const current=state.prospects[prospectId];
      check((current.stage === 'Connected review' || current.approved_calls[callId]) && !current.restriction && current.transcripts[callId]?.sha256===transcript.sha256, 'Call changed before dispatch');
      const consumed = Object.values(state.ai_attempts).filter(a => a.date === today).length;
      const jobCalls = Object.values(state.ai_attempts).filter(a => a.transcript_sha256 === transcript.sha256 && a.prospect_id === prospectId && a.call_id === callId).length;
      check(consumed < ai.daily_calls && jobCalls < 4, 'Durable daily/job call allowance reached; hold and continue other work');
      check(!Object.values(state.ai_attempts).some(a => a.status === 'Running'), 'Another transcript dispatch owns the allowance');
      state.ai_attempts[id] = { id, date: today, prospect_id: prospectId, call_id: callId, transcript_sha256: transcript.sha256,
        phase, model: phase === 'author' ? ai.author_model : ai.reviewer_model, effort: ai.effort, status: 'Running', controller_pid: process.pid, started_at: app.now().toISOString(), child_pid: null };
    });
    attempts.push(id);
    try {
      const field = phase === 'author' ? 'transcript_sha256' : 'proposal_sha256';
      const outputSchema = { ...schema, properties: { ...schema.properties, [field]: { ...schema.properties[field], const: phase === 'author' ? transcript.sha256 : hash(proposal) } } };
      const result = await invoke({ worker: 'codex', phase: 'review', directory, attempt_id: id, signal: active.signal,
        model: phase === 'author' ? ai.author_model : ai.reviewer_model, effort: ai.effort, outputSchema, promptText: prompt,
        onEvent: async event => app.change(state => { const a = state.ai_attempts[id]; if (event.event === 'worker_started') a.child_pid = event.pid; if (event.event === 'worker_stopped') a.child_pid = null; }) });
      await app.change(state => { Object.assign(state.ai_attempts[id], { status: 'Complete', child_pid: null, result_sha256: hash(result), finished_at: app.now().toISOString() }); });
      return result;
    } catch (error) {
      await app.change(state => { Object.assign(state.ai_attempts[id], { status: active.signal.aborted ? 'Interrupted' : 'Held', child_pid: null, error: error.message, finished_at: app.now().toISOString() }); });
      throw error;
    }
  };
  try {
    let feedback = proposal && existingReview && !acceptedTranscriptReview(existingReview, proposal) ? existingReview : null;
    for (let repair = 0; repair <= 1; repair++) {
      if (!proposal || feedback) {
        proposal = await run('author', transcriptAuthorPrompt(record, callId, transcript, feedback), transcriptSchema);
        validateTranscriptProposal(proposal, transcript); await saveJson(join(directory, 'proposal.json'), proposal);
      }
      const review = await run('review', transcriptReviewerPrompt(proposal, transcript), reviewSchema);
      const accepted = acceptedTranscriptReview(review, proposal); await saveJson(join(directory, 'review.json'), review);
      if (accepted) return await publishAssessment(app, prospectId, callId, proposal, review);
      feedback = review;
    }
    throw Error('Independent review still needs repair after the bounded retry; owner clarification required');
  } catch (error) {
    await app.change(state => {
      const id = `transcript-${hash(`${prospectId}:${callId}`).slice(0, 24)}`;
      const exception = { id, prospect_id: prospectId, reason: error.message, transcript_sha256: transcript.sha256, at: app.now().toISOString() };
      state.exceptions = [...state.exceptions.filter(x => x.id !== id), exception];
    });
    throw error;
  } finally { clearInterval(timer); signal?.removeEventListener('abort', abort); }
}
