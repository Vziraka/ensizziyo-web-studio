# Subagent model-routing pilot

November 1, 2026. The owner approved comparing model and reasoning choices, then applying an evaluated route in this repository. These are fictional text-only exercises: no client data, network, filesystem access, delivery or paid overage. Each run receives the same task text in a fresh conversation; the shared host and permissions are not isolated. The prompts and rubric below were independently designed before candidate runs.

The planned screening compares Luna High twice and Terra Max once on task 1; Sol Medium twice and Terra Max once on task 2; Sol High twice, Astra Medium once and Terra Max once on task 3. The single baseline observations and two candidate observations are a small screening sample, not evidence of general model rankings. An independent grader checks anonymized outputs against the frozen rubric; unresolved grading disagreements remain visible. Model availability, inference usage, latency, tool calls and errors are reported only when observed.

## Task 1 — evidence extraction

```text
This is a fictional release desk exercise. Use only the facts below. Do not use tools, network access, files, or outside knowledge. Do not invent missing results.

Policy:
- A release requires a completed PASS for both unit and e2e suites on its exact current artifact.
- For each artifact/suite, the most recent COMPLETED result governs.
- RUNNING is not a completed result and does not replace an earlier completed result.
- Results from another artifact cannot satisfy a requirement.
- There are no waivers.

Current release artifacts:
Atlas → A-2
Birch → B-2
Cove → C-1

Evidence:
R1 | 10:00 | A-2 | unit | PASS
R2 | 10:01 | A-2 | e2e  | PASS
R3 | 10:03 | A-2 | e2e  | RUNNING
R4 | 10:00 | B-2 | unit | PASS
R5 | 10:02 | B-1 | e2e  | PASS
R6 | 10:00 | C-1 | unit | PASS
R7 | 10:01 | C-1 | e2e  | FAIL
R8 | 10:04 | C-1 | e2e  | RUNNING

Return a three-row table: release, READY or HOLD, evidence IDs, and one short explanation. For each HOLD, state exactly what evidence is still needed. Keep the answer under 200 words.
```

Rubric (10 points): Atlas ready with R1/R2, despite R3 running (3); Birch held until a completed passing B-2 e2e, since R5 is B-1 (3); Cove held until a later completed passing C-1 e2e, since R7 remains controlling (3); correct grounding without invented outcomes (1). Deduct one per unsupported additional defect, up to three. A running result is not itself a release failure.

## Task 2 — code review

```text
Review this fictional TypeScript search controller. Use only the supplied code and contract. Do not use tools, network access, files, or outside knowledge. Do not invent surrounding code or requirements.

Contract:
- Calls may overlap, and API promises may settle in any order.
- Only the most recently STARTED search may change rows, error, or loading.
- While that current search is pending, loading must remain true.
- setState merges its argument into existing state synchronously.
- All strings are valid queries. Cancellation and component unmounting are outside scope.

let requestNo = 0;

async function runSearch(text: string): Promise<void> {
  const mine = ++requestNo;
  setState({ query: text, rows: [], error: null, loading: true });

  try {
    const rows = await api.search(text);
    if (mine !== requestNo) return;
    setState({ rows });
  } catch {
    setState({ error: "Search failed" });
  } finally {
    setState({ loading: false });
  }
}

Identify concrete contract violations, with an execution order that demonstrates each. Give the smallest sufficient correction or pseudocode, and two deterministic tests using controllable promises. Do not recommend unrelated refactors. Keep the answer under 500 words.
```

Rubric (10 points): show stale rejection overwriting current error (2); show stale completion clearing loading while the current request is pending, including `finally` after a stale success returns (2); guard both catch and finally writes while retaining the existing rows guard (4); give two controllable-promise tests for stale success/pending loading and stale failure after current success (2). Deduct one per unsupported additional defect, up to three. Cancellation, unmounting, blank-query rules and an unguarded rows write are not established defects.

## Task 3 — operations and security review

```text
Review this fictional outbound-message queue. Use only the supplied facts and pseudocode. Do not use tools, network access, files, or outside knowledge. Do not invent authentication, infrastructure, or provider behavior.

Required properties:
1. A user may enqueue only drafts belonging to that user's tenant.
2. An approval authorizes exactly:
   (tenantId, draftId, to, subject, body, attachmentIds).
   Changing any field requires a matching new approval.
3. Each job causes at most one provider delivery, including retries after a worker crash.

Established facts:
- Draft IDs are globally unique, may be known across tenants, and are not authorization credentials.
- requireQueueRole correctly verifies the actor's queue role in actor.tenantId.
- requireOwner correctly verifies ownership in the specified tenant.
- approve loads a draft scoped to the actor's tenant. editDraft is correctly tenant-authorized and can change any draft content field, including to.
- Approval records are immutable. Only approve creates them.
- hash is collision-resistant; canonical is deterministic and unambiguous.
- Database reads return immutable snapshots, not live references.
- Database calls below are atomic individual operations, not one combined transaction.
- At most one worker holds a job's lease at a time. A crash releases the lease for retry.
- A crash may happen after provider delivery and before markDelivered.
- provider.send delivers once per call unless given an idempotencyKey.
  With a key, retries using that key produce at most one delivery for 24 hours.
- Every job's retry window is at most 12 hours. Every enqueue creates a fresh job ID.
- There are no hidden provider defaults, tenant filters, or deduplication mechanisms.

function approvalDigest(d) {
  return hash(canonical([
    d.tenantId, d.id, d.subject, d.body, d.attachmentIds
  ]));
}

function approve(actor, draftId) {
  requireOwner(actor, actor.tenantId);
  const d = db.drafts.getInTenant(actor.tenantId, draftId);
  db.approvals.insert({
    tenantId: d.tenantId,
    draftId: d.id,
    digest: approvalDigest(d)
  });
}

function enqueue(actor, draftId) {
  requireQueueRole(actor);
  return db.jobs.insert({
    tenantId: actor.tenantId,
    draftId,
    status: "queued"
  });
}

async function processNext() {
  const job = db.jobs.claimNextLease();
  if (!job) return;

  const d = db.drafts.getById(job.draftId);
  const approval = db.approvals.find({
    draftId: d.id,
    digest: approvalDigest(d)
  });

  if (!approval) {
    db.jobs.markHeld(job.id);
    return;
  }

  await provider.send({
    to: d.to,
    subject: d.subject,
    body: d.body,
    attachmentIds: d.attachmentIds
  });

  db.jobs.markDelivered(job.id);
}

Report concrete violations, prioritized by impact. For each, provide an execution sequence, the violated property, and the smallest sufficient fix. State whether any finding depends on an assumption beyond the supplied facts. Do not report speculative vulnerabilities. Keep the answer under 650 words.
```

Rubric (10 points): for each of cross-tenant queueing/send, omitted recipient in the approval digest, and duplicate delivery after crash/retry, give one point each for the defect, supported sequence and sufficient fix (9 total). Enqueue must check tenant ownership and the worker must enforce the job/draft tenant relationship; the corrected approval digest must cover `to` and invalidate old incomplete digests; a stable per-job provider idempotency key lasts beyond the stated retry window. Give one point for prioritization/calibration without extra assumptions. Deduct one per unsupported additional defect, up to three. Do not invent SQL injection, weak hashing, simultaneous lease holders, provider-key expiry within the retry window, or a mutable-snapshot race.

## Results and limitations

Pending.

The preceding “Pending” was frozen before any candidate run. The results below supersede that status. The SHA-256 of the complete pre-run file was `464d80f14fdf6f6ea7cefa055a0fa0ddae98c595fc4ff5f0f3708f803c48562d`; that exact prefix is retained above.

Ten fresh-context runs completed with the planned model/effort choices. The [sanitized answers and observed usage](model-routing-evaluation-results.json) retain all ten responses, anonymized grading IDs, model/effort, elapsed time and token records. An independent grader scored the blinded answers against the frozen rubric; a second independent grader checked task 3 and agreed on its scores.

| Task | Candidate observations | Baseline/comparison |
| --- | --- | --- |
| Evidence extraction | Luna High: 10/10 in both runs | Terra Max: 10/10 once |
| Ordinary code review | Sol Medium: 9/10 in both runs | Terra Max: 10/10 once |
| Operations/security review | Sol High: 10/10 and 9/10 | Astra Medium: 10/10 once; Terra Max: 10/10 once |

The two Sol Medium answers identified both bugs, gave sufficient guards and supplied two deterministic tests. The frozen rubric deducted one point because neither used one particular test ordering that the original prompt did not require. On task 3, one Sol High answer omitted the additional worker-side tenant check required by the rubric; enqueue-time validation still addresses new unauthorized jobs. Adding the recipient to the digest invalidates the old incomplete digest under the fixture's assumptions, even where an answer did not separately say so.

The rubric missed a further issue: the Terra Max answer alone observed that approving A, editing to B and then reverting to A can reuse the old approval. The literal “new approval after a change” wording supports that finding, although reusable approval of an identical tuple is another plausible interpretation. Both graders flagged the ambiguity. The other answers were not retroactively penalized, so the numeric scores do not represent coverage of that edge case.

Observed input was about 22,200–25,100 tokens per run, including cached input; output was 211–2,347 tokens, including reasoning output. Measured candidate elapsed time was about 3–31 seconds from the local turn context to final answer. These figures include host instructions and differ in caching, model and prompt; they are not a controlled cost or latency comparison. Subscription allowance and billed cost per task were not determined. No candidate tool call appeared in its stored response-item records. Dispatch text in the parent log is encrypted, so byte-for-byte equality with the saved prompts could not be independently recovered from that log.

The owner-approved pilot therefore adds optional, bounded evidence and routine-review roles and task-specific routing guidance; it does not apply a cheaper default to all reviewers. This is one scenario per task, two candidate samples and one baseline sample, run without randomized order. It does not establish general capability, real-project tool use, role discovery in every client, or long-term savings. Re-evaluate on representative authorized tasks and retain the previous route if the host cannot apply a supported choice.


A metadata-only check of installed Codex CLI 0.166.0 exposed both proposed custom roles in `codex debug prompt-input`, including their pinned model/effort. The account's model-list metadata exposed the tested models and efforts. A fresh lead agent read the routing instructions and requested Luna High for a fictional evidence task, but its two child-spawn attempts were rejected with “agent thread limit reached”; no routed child executed. The individual model/effort runs above did execute. Role discovery and the lead's selection are therefore observed; a complete named-role-to-child execution and behavior remain unverified. The direct model override mechanism was exercised by the individual comparisons.
