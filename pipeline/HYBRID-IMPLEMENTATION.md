# Hybrid operations implementation checkpoints

October 26, 2026. This file turns the owner-approved staged plan into repository checkpoints. The full design and alternatives remain in the private `hybrid-system-review-plan-20261026.md`; this document records implementation scope, evidence and gates without copying that proposal.

## Authorized scope and boundary

Proceed with staged code and fictional controlled proofs for the existing-client workflow. Stage 1 is the first implementation target: a narrow task/context/result interface, then a fictional existing-client email-to-draft-to-approval-to-provider-receipt journey using the existing desk/store. A task result is a proposal until the desk validates it and an operator accepts it. Keep current shared-store ownership, signed operator attribution, exact-bundle approval and uncertainty handling.

This authorization covers repository work and controlled fictional verification. It does not authorize deployment, production data migration, real client email, real calls or recordings, purchases, resuming old automations, or enabling production capabilities. Preserve the existing commercial-email hold. Do not weaken current contact restrictions, approvals, provider grants, quotas or failure states to make the proof pass.

Stages 2–7 remain ordered follow-on work: production persistence/identity/queue/recovery; calls and reviewed transcription; mockup-to-proposal; paid website delivery; maintenance/evaluation; then an explicitly approved limited cutover. Reuse existing implementation where it meets the stage's acceptance evidence. Do not build speculative platform layers while Stage 1 is unproved.

## Stage 0 — baseline and feasibility

**Baseline:** inspected source base is `3a48fbe` (`3a48fbe0f4b3cb9d54dd449863fd220e8f049318`). Preservation commit `3bf20a7` copies the paused source's 23 tracked changes and two untracked files into the isolated hybrid worktree; the original source checkout remains untouched. Its initial full test run had 1,037 passing and eight failing tests. Seven failures shared an undefined-variable error in the local email hold path; the eighth exposed a valid zero-tick PDF Bootstrap recovery rejection, then an unassigned test fixture's invalid handoff. These now pass targeted regression checks without relaxing ownership or raw-evidence validation. The final combined regression result is recorded below.

**Observed reusable facts:** the repository already has Node 24/Netlify Functions, a strong-read/conditional-write shared record store, signed owner/friend event flows, exact-email approval and provider-evidence handling, project authoring/assets, and substantial fictional boundary tests. The current shared exact-mail source is default-disabled and only sends declared-thread replies. Its current authored PDF companion messages start new conversations and are held before approval, action, reservation, token or provider work. Existing project output recording is not equivalent to an agent's durable cloud result returning to the desk.

**Unproved source and capability:** native cloud Work/Codex or Workspace Agent access to the narrow EVZ tools, durable result/artifact return, and operation with both computers off have not been demonstrated. The intended Business account's identity, eligible features, connected sources, execution route and allowances remain unverified. The currently signed-in personal account has 78% weekly usage remaining; that does not establish Business account entitlements or available execution capacity. No subscription seat, local CLI, source test, or personal usage number proves the required Business capability.

**True gates:** Business-workspace access is required to verify Business identity, features, connections and allowances. The selected cloud route must prove that it can call the narrow tools and durably submit structured results/artifact references; a run status without its output is insufficient. These gates block claims of native cloud readiness, computer-off completion and production cutover. The existing commercial-email address/launch requirements and explicit action authorization remain gates for real sending.

**Independent work that can proceed:** source inspection, task/result interface design, Stage 1 implementation on fictional records, unit/integration tests against injected boundaries, and local browser review can proceed without Business access or live credentials. Label that evidence as source/fictional proof. If the native route is unavailable, report a bounded local option and its computer-off limitation; do not silently substitute it for the cloud requirement or enable paid API execution.

Stage 0 exit evidence is a concise capability/cost sheet marking each required feature supported, unavailable or unproved, plus an explicit selected execution route. Do not infer entitlement from documentation or account usage displays.

## Stage 1 — existing-client email proof

The controlled journey must start from an existing fictional client and current conversation, retrieve only relevant reviewed facts/files and the responsible operator's writing preferences, prepare a sourced draft and exact attachment versions, and show recipients/body/attachments to the operators. A separate signed approval applies to that exact bundle. Relevant changes to recipient, body, attachment, restriction or source facts invalidate approval; unrelated note progress need not do so. Recheck current assignment, stop/reply state, source and approval before provider submission. Retain provider evidence and distinguish verified, failed and uncertain; reconcile the original intent after ambiguous response and never blindly resend.

The narrow agent result caller must bind output to the exact task, client/project, current context/version, actor/attempt and artifact references. Validate schema, size, allowed asset/version identities, task freshness and current restrictions before saving. Duplicate submissions return the original receipt or hold; stale, conflicting, partial or uncertain results do not overwrite newer work or acquire approval authority. Keep result acceptance, email approval and external dispatch as distinct attributable events.

Follow-ups remain review-required and anchored to actual send timestamps: first after three business days, then a final after three business days from the first follow-up's actual send. Replies/stops cancel pending follow-ups; promises take precedence. Use Eastern Time and the proposed weekdays excluding US federal holidays calendar, without rewriting historical timestamps. This stage must not activate real follow-ups.

### Stage 1 checkpoint and acceptance

- [x] Inventory inherited worktree changes and reconcile intended callers before editing them.
- [x] Define the local caller-facing task/context/result contract, ownership, validation, idempotency and failure behavior before adding an adapter. Shared/cloud composition remains open.
- [ ] Fictional existing-client thread produces a sourced personalized draft with the correct exact-version file.
- [ ] Both operators see one current record and actor-attributed result/review/approval; handover changes the responsible queue and invalidates only affected approval.
- [ ] Duplicate event/restart does not duplicate the saved result or provider intent; stale context, altered bundle, stop/reply and uncertain send remain held/reconcilable.
- [ ] Verify stored result and provider receipt, not only a visible confirmation; record usage/duration for the controlled run.
- [ ] Report separately what source tests establish and what requires native Business execution, provider delivery or computer-off evidence.

### Implemented local increment — October 26

[Email draft tasks](EMAIL-DRAFT-TASKS.md) now support signed preparation, narrowly scoped worker context/result access, stale-source and replacement fencing, result integrity, idempotent submission/adoption, Team signature and restore revocation. Shared stores and production state are rejected. The actual local Luna worker/browser proof returned a proposal to the desk and adopted it without new external actions; desktop and mobile views were inspected. The focused task/reply/server suite passed 21 tests, including a reproduced same-path backup restoration regression. This is a partial Stage 1 increment: automatic execution, exact attachments, shared task storage, full conversation retrieval, operator writing preferences and the combined provider-receipt journey remain unfinished.

Requirements review: the increment meets its fictional text-only contract and preserves independent content/send approvals. It does not meet the full Stage 1 acceptance above. Engineering review covered task-only auth, bounded schema, source freshness, reducer/event consistency, retries, preserved human edits and backup recovery. The restore finding was reproduced before repair. This is a focused code review, not a completed Codex Security plugin scan.

Final local verification for this increment: `npm run check` passed; `npm test` passed all 1,061 tests in 402 seconds; desk asset build, site build and site verification passed. The 21-test focused task/reply/server suite and two targeted PDF Bootstrap/G1 regressions also passed. Desktop/mobile browser evidence and exact logs remain private. CI against the committed revision is a separate check; none of these results establishes live email or unattended cloud operation.

The inherited contact-stage `call_claimed` event cannot assign an unassigned Discovery conversation. The recovery fixture records a genuine eligible claim before reply/authoring and tests both rejected and successful handoffs. The following increment supplies a distinct conversation claim; no call/contact guard was relaxed.

### Conversation ownership and personal style increment

[Conversation records](CONVERSATION-OWNERSHIP.md) add explicit claims for active unassigned conversations and self-scoped writing profiles. Claims preserve stage and contact restrictions, refresh affected attention routing, and invalidate cached completed work. A signed handoff remains necessary to transfer an assigned client. Asset/private-note workspaces retain their no-contact boundary. The lead's profile guides local task generation; changing it holds unfinished work, while reviewed wording remains unchanged.

The current composed shared record authority can bind the exact optional conversation schema in its immutable policy and manifest and use existing signed/typed replay. Historical profiles reject the new effects. Backup/rebind checks reconstruct each role's profile predecessor chain and reject rollback, missing or duplicated history, broken chains and event identity mismatches. This does not enable shared email tasks or any provider operation.

Local browser checks exercised explicit claim, saved owner style, an actual Luna result, unapproved adoption followed by separate approval, and a later style change preserving that approved draft. Independent owner/friend browser sessions then verified handoff, stale prior approval, preserved wording and separate self-profile edits. Desktop/mobile views were inspected; no new external actions were created. The second actual worker measured 8,671 ms with token counts unavailable. These are functional examples, not a draft-quality benchmark.

Requirements review: existing-client assignment and explicit personal styles are implemented; new-inquiry round-robin intake remains open. Engineering review confirmed policy opt-in, same-store replay, role isolation, claim races, cached notification routing and style/fact freshness separation. A profile rollback accepted by the first import validator was reproduced and fixed. A later source review also reproduced a machine reassessment being exposed as operator-reviewed call facts; only matching approval/proposal/review hashes and current transcript provenance now expose those claims. Changed evidence stales affected drafts while preserving their text.

Verification: the ownership/style full regression passed 1,068 tests in 395 seconds. After the subsequent call-fact repair, the final affected task/reply/exact-mail/server/conversation set passed 48 tests and full syntax checks passed. Desk/site builds and site verification passed, and the desktop/mobile and independent-session browser proofs above passed. The full local run predates that last call-fact repair; final-head CI supplies the broader check rather than representing the earlier run as a new one. GitHub checks for the preceding `70d462d` increment passed separately.

## Focused existing test map

These tests are existing evidence and candidates for a focused Stage 1 regression set; they were not run for this checkpoint. A passing source test does not establish native cloud result return, live provider delivery or production readiness.

| Concern | Existing coverage | Remaining Stage 1 proof |
|---|---|---|
| Existing-client task preparation and saved project output | `project-work.test.mjs`: approved context/output, stale output holds, feedback/approval invalidation, foreign output rejection and authenticated HTTP result recording. `PROJECT-WORK.md` describes `project_work_recorded` binding the exact asset/version, actor, export review and current context hash. | Combined agent-result submission path bound to an exact current task/client/context with durable same-record readback. Existing output recording is not proof of cloud result return. |
| Shared records and operator races | `shared-operations-records.test.mjs`, `shared-manual-internal-dispatch.test.mjs`: one CAS authority, signed events, duplicate/actor receipts, conflicts, stop/handoff and whole-state preservation. | Exercise result submission through the selected result caller and its interaction with current assignment, approvals and dispatch. |
| Exact email preparation, approval and dispatch | `shared-operations-exact-mail.test.mjs`: signed reply review, separate exact approval, one send intent, exact readback, stop/wait fences, uncertainty and replay. Contract: `SHARED-OPERATIONS-EXACT-MAIL.md`. | Stage 1 must also prove task-result-to-draft wiring, attachment version selection and UI/operator readback. Current source supports declared-thread replies only. |
| New-thread PDF companion email | `shared-operations-pdf-mail.test.mjs`: a separate bounded PDF/new-thread caller proof exists in the inherited untracked changes. | Include only if Stage 1 selects this caller; it is not covered by the declared-thread exact-mail test. Current shared exact-mail contract still holds these companions. |

Avoid deleting or combining tests based only on overlap in source names. Retire a candidate only after identifying the same behavior-level boundary in a replacement and preserving role, race, failure and recovery coverage.

## Commands and CI

From `pipeline/`, the documented repository checks are `npm run check` and `npm test`. Focused current contracts include `node --test project-work.test.mjs shared-operations-records.test.mjs shared-manual-internal-dispatch.test.mjs shared-operations-exact-mail.test.mjs`; add `shared-operations-pdf-mail.test.mjs` only if that separate caller is in scope. These commands are recommendations for implementation verification, not results claimed here.

`.github/workflows/research-proof.yml` uses Node 24, installs locked dependencies with `npm ci --ignore-scripts`, then runs `npm run check` and `npm test` in `pipeline/`. `.github/workflows/site-check.yml` covers the public site build/checks separately. Update executable docs/CI only if the actual test command or affected behavior changes.

## Later-stage gates

Use the private approved plan's stage table and acceptance criteria for detailed later stages. Stage completion depends on evidence, not file count. Production persistence/migration, call processing, proposals, website release, maintenance, and cutover must each retain their own approval and rollback boundary. The final pilot requires a reconciled export/import, verified references/hashes, both operator sessions, duplicate handling and restore rehearsal, a limited controlled run, cost/results review and explicit activation decision.
