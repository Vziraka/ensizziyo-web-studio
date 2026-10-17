# Private sales, delivery and support workspace

The owner approved this design on October 17, 2026. [Controlled operations](OPERATIONS.md) connects its email, booking, synchronization and supervision paths. Research, real outreach and the previous heartbeat remain paused. It reuses Node 24, the existing Google library, Apollo/Gmail/Calendar connections and subscription CLIs. No dependency, paid model API or new subscription was added.

## Journey and ownership

SOSA discovers candidates using [RESEARCH.md](RESEARCH.md); the existing controller owns evidence, worker handoffs, allowance and independent review. Food/beverages remain first, cleaners later. This build runs no discovery and contributes no fictional records to C5's 20 real qualified prospects/five drafts.

Apollo remains the call/email workspace. The owner makes every call. The console records outcomes and carries a conversation through transcript/owner review → discovery → bounded clickable preview → fixed written quote → signed agreement → invoice/settled payment evidence → onboarding → service-specific checks → revision/acceptance → settled balance/handover → support closure. Agreement, payment and acceptance require owner-verified references; v1 does not sign contracts or charge a customer.

[OUTREACH.md](OUTREACH.md) owns the campaign rules: 50 distinct businesses/day minimum including follow-ups, callbacks first, no fixed owner-hour cap, two cold calls/two emails over ten business days, all four services. Completing/skipping a task never proves a call. Connected calls/replies pause cold progression; decline/do-not-contact cancels queued local actions. Provider suppression still needs authoritative readback and cannot recall submitted mail. Fictional calls, drafts and tasks count zero actual outreach. Neither 50/day nor 200 detailed assessments/week capacity is proven.

Research files/Sheets own sources and qualification; Apollo owns outbound execution; private lifecycle events own stages/restrictions/reservations; the owner owns commercial, client and support decisions. A private fictional Calendar booking passed creation and independent readback; recipient invitations remain a production rehearsal. The console complements Apollo on this computer, with loopback binding, session/same-origin protection and text-only rendering of untrusted content. Its three-screen preview submits no order/payment; its private written proposal includes all approved commercial fields.

## Context and subscription use

Durable context lives in source/checkpoint/report/review files, playbooks, lifecycle events and exact document references. Chat history is not the database. Each transcript worker receives only its saved transcript, call time/hash, trusted schema/instructions and bounded review feedback. Credentials, browser cookies, parent connectors and whole client folders are excluded. Redact credentials before intake; recording consent is separate.

The author uses `gpt-6-luna`/high and the independent reviewer `gpt-6.1-sol`/high in separate restricted ChatGPT-authenticated Codex CLI calls. Exact quotes and complete claim/summary/outcome review precede owner approval. One repair, four calls/job and persistent daily allowance apply; an interrupted reviewer reuses the author result. Default AI is disabled, four calls/day and 30% Codex reserve. Website priority blocks dispatch. Live metadata returned 20% remaining, so this build held before either model ran. Routing/recovery tests pass; live model compatibility/quality remains unverified. No paid fallback exists.

## Run the review

Use an owner/SYSTEM-only directory outside Git. `init` never overwrites state; `seed` creates three clearly fictional examples using `.invalid` mail/no phone. Do not reseed an existing run. Private configuration, evidence, client records and raw receipts never belong in Git.

```powershell
cd C:\Users\zvent\.codex\worktrees\studio-launch-milestones\ensizziyo-web-studio\pipeline
$env:STUDIO_LIFECYCLE_STATE_DIR='C:\private\studio-lifecycle'
node lifecycle-cli.mjs init
node lifecycle-cli.mjs seed
node lifecycle-cli.mjs serve
# Open http://127.0.0.1:8807/; Ctrl+C stops this instance.
```

The actual review state is `C:\Users\zvent\Documents\Codex\2026-10-16\apollo-controlled-proof\lifecycle`, with owner/SYSTEM-only inherited ACL verified. Browser QA uses a separate restored sibling with execution disabled. The five fictional examples include transcript review, no-answer email, accepted delivery/support, historical reply cancellation and a private Calendar booking. Fixture prices, signatures and payments are not real commitments. Controlled HTTP decisions are recorded as `controlled-fixture`; actual design approval is separately recorded from the owner's October 17 message and does not activate production.

```powershell
node lifecycle-cli.mjs status
node lifecycle-cli.mjs assess <prospect-id> <call-id>
node lifecycle-cli.mjs publish
node lifecycle-cli.mjs pause
node lifecycle-cli.mjs backup C:\private\studio-lifecycle-backup.json
$env:STUDIO_LIFECYCLE_STATE_DIR='C:\private\new-empty-restore'
node lifecycle-cli.mjs restore C:\private\studio-lifecycle-backup.json
```

`assess` obeys allowance/priority and never researches a business. `publish` writes only the explicit **Lifecycle proof** tab using the previously approved scoped Google identity. It preserves original tabs, refuses unexpected owner edits and reads back pending writes after restart instead of resending them.

## Apollo request/receipt protocol

The bridge permits exact allowlisted fictional contacts and unsent standalone tasks only. Production, enabled outreach, unknown owners, missing current-session contact verification and changed drafts fail closed. The authenticated app retains its credentials.

```powershell
$env:STUDIO_LIFECYCLE_SESSION='fresh-session-token'
node lifecycle-cli.mjs prepare owner-read profile
# Invoke exactly the returned tool/input; save its unmodified result in receipts/owner-read.json.
node lifecycle-cli.mjs settle owner-read
node lifecycle-cli.mjs prepare contact-read contact unused <prospect-id>
node lifecycle-cli.mjs settle contact-read
node lifecycle-cli.mjs prepare task-write create_task <action-id> <prospect-id>
node lifecycle-cli.mjs settle task-write
node lifecycle-cli.mjs prepare task-read read_task <action-id> <prospect-id>
node lifecycle-cli.mjs settle task-read
```

The app adds a generic Apollo rationale/conversation reference. IDs come from current-session reads. Transcript/email/page text never authorizes tools. A reservation precedes mutation; unknown results cannot replay under another key. `search_task` reconciles an exact owner/contact-filtered candidate; detail readback must then verify note, second-precision due time and unchanged unsent content. Explicit null/changed ownership fails. A verified email task is still unsent.

The native proof is paused: one fictional contact, isolated list, automatic approval, no re-enrollment, one non-sending action item. Initial task lookups were empty and were reported through the Apollo connector. A later workflow view showed the task; exact keyword/contact/owner-filtered search and task detail then independently verified its identity, scheduled state and non-sending note. The delayed task handoff passed without retriggering or creating a replacement. This verifies an action item only; automatic email/cadence/stop remains unverified. Keep the workflow paused and do not add real contacts. The direct task request/receipt path also passed. Earlier owner-only email delivery, reply monitoring and inactive-sequence cancellation remain separate proofs in [APOLLO.md](APOLLO.md).

## Recovery, upkeep and launch

Backups checksum operating state and restore only into a new directory. They exclude configuration/credentials, worker prompts/logs and external receipts; retain the separate private receipt archive. Restore disables AI, connector writes, research and outreach, and makes Pending mutations Uncertain. Explicitly rebind providers; a restored copy must not become another executor.

Pause all disables new work, including controlled operations. Running inference checks pause/priority and stops its own child while retaining results and consumed allowance. Local pause cannot cancel submitted mail. The exclusive lock prevents overlap; hard-crash stale-lock recovery requires confirming parent/child exits. Never remove a live/unknown lock. Exceptions consolidate in the private console. The old heartbeat stays paused; the bounded replacement test and actual scheduled evidence follow [OPERATIONS.md](OPERATIONS.md). Verify sustained supervision, restart, backups and actionable alerts before production; measure upkeep against the 1–2-hour weekly target. Rerun affected bounded proofs after provider/CLI changes.

Verification: `npm run check` and `npm test`. Tests cover the fictional journey, claim review, bounded repair/recovery, stops/caps, financial/acceptance gates, projection ambiguity, restore and HTTP protection. Browser QA checks desktop/mobile/keyboard, preview, written quote, unconfirmed-discovery refusal and closure after support resolution. Verify persisted state as well as success messages.

Passed connected checks include scoped Google publication/readback, Apollo owner/contact/unsent task reconciliation, native non-sending workflow task, one exactly confirmed owner-only email with delivery/Gmail verification and a future standalone call task, owner/free-busy and private booking creation/readback, historical reply/future-action cancellation, private ACL, restore and the fictional browser journey. [The October 17 task](../TASKS.md#controlled-email-booking-synchronization-and-supervision--october-17-2026) and private operations proof distinguish new delivery, historical replies, native task cancellation and actual scheduled execution. Live transcript inference remains Held below reserve. No real calling/research/outreach, actual signing/payment or production invitation is included.

Remaining launch gates: recovered/verified business sender, studio signature/postal details, alias receipt/domain authentication and sending limits; production-mailbox delivery/stop rehearsal; recipient booking/invitation and sustained production supervision; business-account cutover; then authorized research, reviewed prospect/draft supply and measured capacity. Required connector confirmations cannot be bypassed through the browser. Website/inquiry readiness belongs to the separate launch work.

S1/S2/C5 remain in progress. S3's core/controlled journey is demonstrable; final integration/activation depends on S2 and these gates. This working review version does not establish a completed live pipeline or proven scale.
