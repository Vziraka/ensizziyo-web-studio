# Controlled Apollo connection

Latest increment: the [private lifecycle workspace](LIFECYCLE.md) links explicit call outcomes, reviewed transcripts and the commercial/delivery/support journey. One new unsent task and a scoped Google projection passed connected readback. A separate native list-trigger test logged an action but did not return a verifiable task; it is paused and remains inconclusive. The old heartbeat stays paused. Neither this increment nor the earlier proofs activate a production campaign.

This controlled S2 increment connects private Node receipts to the existing authenticated Apollo/Gmail app connectors and a fictional Sheets projection. **Production is blocked; research remains paused.** It adds no dependency, API key or paid model API. The single-thread test heartbeat passed two actual scheduled cycles and is now paused at the owner's request. The controlled daily queue below adds fictional saved-outcome handoffs without sending. The [workflow](OUTREACH.md) owns full production requirements; the [controller](CONTROLLER.md) owns research separately.

`apollo.mjs` owns record bounds, eligibility and receipts. `apollo-cli.mjs` prepares/settles requests and ingests verified Gmail reply readbacks. The Codex app invokes the existing Apollo and Gmail tools and saves their exact responses privately. Apollo owns email execution. This requires an active authenticated app session; it is not a standalone unattended transport or another follow-up scheduler.

## Executed verification — October 16, 2026

| Check | Result and boundary |
| --- | --- |
| Profile/mailboxes | Connected profile read passed. After the owner completed mailbox consent, the selected owner-controlled Gmail was verified active and default. |
| Fictional company/contact | One reserved `.invalid` company/contact created and read back. The contact has no phone. Apollo title-cases names; exact email, organization and account checks remain. |
| Apollo tasks | One standalone test call and one fixture action item created/read back. The call was skipped without dialing; only the action item was completed after executing its local simulation. Final statuses were read back as skipped/completed. |
| Call-first gate | Persisted skipped-call fixture stays ineligible. Separately labelled simulated no-answer permits the owner-only branch. Neither creates a real call or daily contact count. |
| Restart/duplicates | Separate CLI processes reuse saved mappings. Repeated company/contact/task prepares return already-done without another provider mutation. |
| Failure/recovery | Account-free tests cover lost task-create response reconciliation, uncertain receipts across reopening, foreign records, envelope mismatches, reply/decline holds, late events, caps and business-day expiry. Faults are injected; no real provider crash/quota exhaustion is claimed. |
| Sheets | `Outreach test!A1:J2` contains the fictional mapping and explicitly simulated outcome. Native readback/rendered layout checked. `Prospects!A1:P101` matched its saved baseline exactly; original tabs retained. This is an app-assisted projection, not a polling synchronizer. |
| Actual email/reply | One approved owner-only test email completed delivery. The owner confirmed arrival/reply; authenticated Gmail readback matched the sent original and incoming reply. Ingesting that receipt persisted `Reply review` and blocked further email. Reopening and polling again counted one reply. The later monitor increment sent no new email. |
| Native future-step cancellation | After separate creation/enrollment confirmations, one private inactive sequence with two seven-day delayed email steps received the existing fictional contact paused. The monitor used the verified owner reply to stop it. Independent contact readback showed `finished` / `manually finished`; sequence readback stayed inactive. This verifies stopping future sequence steps, not recall of an immediate-send queue message or an active production campaign. |
| Recurring supervision | Two manual and two actual scheduled full cycles passed using existing connections, preserving one reply and verified cancellation. The owner then paused both `Studio controlled reply monitor` and its private control. This does not establish sustained uptime. |
| Pause | Private test configuration is disabled after email/reply verification. Saved receipts remain; disabling outbound does not block ingestion of an already received reply. |
| Local checks | The original monitor passed 118 account-free tests, including 31 Apollo tests. The daily queue adds 13 focused tests for routing, ordering, ownership, compact provider shapes, changed messages and lost-response recovery. No research subscription worker was invoked. |

Private evidence: `C:\Users\zvent\Documents\Codex\2026-10-16\apollo-controlled-proof`, outside Git with owner/SYSTEM access. Configuration, state, raw provider receipts, preserved tracker values and browser evidence stay there. Never commit or attach those files to a PR. The native view is a test log, not a prospect queue.

## Setup and transport contract

Requires Node 24 and the existing app connection. Create a private directory outside **every** Git checkout and save `config.json` there. No Apollo credential belongs in it:

```json
{
  "schema_version": 1,
  "mode": "controlled-test",
  "enabled": false,
  "run_id": "studio-outreach-test-20261016-00000000",
  "user_id": "REPLACE_WITH_OBSERVED_APOLLO_USER_ID",
  "recipients": [],
  "time_zone": "America/New_York"
}
```

Use a unique eight-character lowercase hex run suffix and a current observed owner ID. Enable only an explicitly scoped fictional test; reads work while disabled. Production mode and arbitrary company/contact/phone arguments are rejected.

From `pipeline`:

```powershell
$env:STUDIO_APOLLO_STATE_DIR = 'C:\private\apollo-controlled-proof'
$env:STUDIO_APOLLO_SESSION = [guid]::NewGuid().ToString()
node apollo-cli.mjs prepare owner-session profile
# The app invokes the returned tool/input, saves its raw response to
# receipts/owner-session.json, then settles that exact request:
node apollo-cli.mjs settle owner-session
node apollo-cli.mjs status
```

Reuse the session token within the app session. After reconnect/restart, create a fresh token and profile-read key. A profile refresh invalidates earlier verification until the response matches. Refresh exact test contact/task reads so IDs have been observed in the current tool session; cached IDs are reconciliation information, not authorization.

`prepare <key> <operation> [kind]` returns `{key, tool, input}` or `already_done`. The app invokes only that tool/request, adding its conversation/rationale metadata, saves the **raw** response as `receipts/<key>.json`, then runs `settle <key>`. Check exit codes; a failed prepare must not invoke a tool. Never manufacture a successful receipt. The CLI makes no Apollo network call and cannot access the app's OAuth token.

Operations: profile/mailboxes/contact_search; account_create/contact_create; task_create/task_search/task_show; fixture_complete/call_task_skip; draft_create/send/message_status. Task kind is `call_gate` or `fixture`. An exact empty contact search and verified account precede contact creation. New tasks are due at their prepared timestamp, belong only to the test contact and have no sequence. The connected trial preceded that due-date addition; daily-list placement remains to verify. Read before skip/complete. Only the fixture action item can be completed; actual call completion/dialing are absent.

Save local events as `receipts/<key>.json`, then use `event <key>`:

```json
{
  "id": "simulated-call-1",
  "type": "simulated_call",
  "outcome": "no_answer",
  "at": "REPLACE_WITH_CURRENT_ISO_TIME_WITH_TIMEZONE"
}
```

Fixtures retain `source: fixture` and zero real outreach. Call outcomes: no_answer/interested/callback/decline/bad_number. skipped_call never supplies an outcome. Reply/decline/bounce/email_failure events test holds. Duplicate IDs are idempotent; conflicting duplicates fail. Declines stay stopped; late no-answer/positive events cannot clear a reply, callback, discovery or route hold. One no-answer permits one email, with independent two-call/two-email and ten-weekday limits. Holidays and automatic Day 6 scheduling are not implemented.

## One owner-only email

Read linked mailboxes first; sender address/ID must match. Before **creating the draft**, present From/To/subject/body and obtain the connector's required concrete confirmation. Mailbox access/terms consent is separate. Keep at most two approved owner recipients in `recipients` and add the exact confirmed `approved_message`:

```json
{
  "from": "owner-controlled-sender@example.com",
  "to": "owner-controlled-recipient@example.com",
  "mailbox_id": "REPLACE_WITH_OBSERVED_MAILBOX_ID",
  "subject": "[STUDIO TEST] Call-first workflow check",
  "body_html": "<p>CONTROLLED TEST — fictional business; no actual call placed.</p>",
  "confirmed": true
}
```

Subjects/bodies must identify the test; unresolved merge placeholders block it. The fictional contact keeps its `.invalid` address; explicit recipients override it to the approved owner inbox. Draft readback must match the exact contact, sole To recipient, subject and HTML. Apollo's exact `<html><head></head><body>…</body></html>` wrapper is accepted only when the inner HTML is unchanged. Altered content, head content, extra recipients or a returned conflicting sender/mailbox hold the action. The existing mailbox signature was inherited for this owner-only test; production studio identity/footer still needs review.

Only one send reservation is permitted per run. Scheduled/drafted counts zero. Poll the exact returned message ID at most four times, 10–20 seconds apart, as the connector requires. Unknown/failed is not delivery; failure holds the route. Repeated delivery receipts count once. Independently verify destination arrival. A local reply fixture does not prove real reply ingestion or queued-step cancellation.

### Verified owner reply

Use the existing Gmail connector to read its authenticated profile, search for this exact owner-to-owner test subject/route/date and read the matching thread with at most 20 messages. Save the unmodified tool results privately as `receipts/<key>.json`:

```json
{
  "gmail_profile": "REPLACE_WITH_RAW_PROFILE_TOOL_RESULT_OBJECT",
  "gmail_thread": "REPLACE_WITH_RAW_THREAD_TOOL_RESULT_OBJECT"
}
```

Run `node apollo-cli.mjs reply <key>`. The profile must match the approved sender. A delivered test send and unchanged message confirmation are required. The thread root must be the matching SENT original within five minutes of the send reservation; replies must reverse the exact owner route, retain the subject and reference the original SMTP Message-ID through In-Reply-To. Duplicate/invalid headers and invalid chronology fail without changing state. This deliberately narrow timing window covers the immediate controlled proof; delayed sends and general production threading need a separate implementation.

Matching messages create stable Gmail event IDs with `source: gmail_readback`, persist `Reply review` and retain zero real-business outreach. Repeated ingestion after reopening does not duplicate events. Message bodies cannot issue workflow commands. The recurring wrapper below reuses the same validation; it does not automatically respond.

## Continuous controlled monitor

Merge this separate control into the private configuration; outbound `enabled` remains false during monitoring:

```json
{
  "reply_monitor": {
    "enabled": false,
    "thread_id": "REPLACE_WITH_OBSERVED_GMAIL_THREAD_ID",
    "interval_minutes": 5,
    "sequence_create_confirmed": false,
    "enrollment_confirmed": false
  }
}
```

Use a fresh app-session token for each wake. `node apollo-cli.mjs monitor-next` returns one exact request or Disabled, Waiting, Deferred, Complete or Held. Invoke only its returned tool/input, save the exact raw response to `receipts/<key>.json`, then run `settle <key>`. Check every exit code before continuing. A cycle reads the authenticated Gmail owner and the single saved thread (at most 20 messages). No reply is a successful empty result; inaccessible, malformed or unrelated evidence is an error. A verified reply immediately holds outbound state. With an enrolled test sequence, the cycle then verifies the Apollo owner, exact contact and owned inactive sequence, requests one native stop, and independently reads contact/sequence state. Successful stop submission alone is not cancellation: only terminal membership plus the inactive owned sequence makes suppression `Verified`.

Pending reads can be reissued up to three times. An uncertain stop is never replayed; the next request reads membership. Readbacks are at least 20 seconds apart and hold after four nonterminal results. A new key cannot bypass that pending stop. Held/error cases retain evidence and require authoritative reconciliation; do not clear them to make the display green. Stale root locks retain the existing manual recovery rule. `status` exposes completed-cycle count, last completion, hold reason and suppression status.

State uses the existing exclusive lock and atomic file replacement. Each new cycle prunes only completed, UUID-named routine monitor-read actions and their exact files within the private receipts directory. Original proof, mutation receipts, independent terminal cancellation readbacks, pending actions and files outside that scope remain. Already-finished membership is verified without a redundant stop. Gmail body/attachment data stays out of the compact action ledger; the current raw readback remains private until the next cycle. Preserve a selected full proof bundle before retention rotates its routine reads. `monitor-connected-proof.json` retains the native cancellation evidence.

The app heartbeat runs the bounded protocol (at most 12 operations per wake), with no email creation, enrollment, activation, research dispatch or extra model CLI. It uses subscription capacity rather than a paid model API. Polling has a five-minute interval and scheduler latency; it is not instant push delivery. [Local scheduled tasks require the computer and desktop app to stay running](https://learn.chatgpt.com/docs/automations). First scheduled execution and sustained reliability must be observed separately from registration and manually driven cycles. Stable state is quiet; new replies, changed cancellation results and exceptions produce a deduplicated notice. This single-thread controlled scope does not establish production volume or unattended availability guarantees.

For a fresh native test, use `sequence_search` before `sequence_create`; the connector requires concrete name/audience/goal/channel/tone confirmation. The fixed owned name is `STUDIO TEST <run_id> reply-stop`, private and inactive, with two seven-day delayed, review-required email steps. After it exists, refresh sequence/mailbox reads and obtain the connector's separate summary confirmation before `sequence_enroll`, which can only enroll the single fictional contact paused without automatic unpause. Keep the reserved `.invalid` address. Never activate this sequence. The monitor uses `sequence_stop` only after an actual Gmail reply and fresh owned contact/sequence reads, even while outbound is disabled. [Apollo's native stop endpoint](https://docs.apollo.io/reference/update-contact-status-sequence) owns future sequence progression; this connector exposes no recall operation for a standalone email already submitted to immediate sending.

Pause monitoring by setting `reply_monitor.enabled: false` and pausing its heartbeat through the app; leave outbound `enabled: false`. This does not undo a provider action. Retain the inactive finished test sequence/contact, approvals and proof. If a worktree, connection or account changes, hold and reverify; do not extract OAuth tokens or substitute credentials. Weekly upkeep checks last completion/held status, connection availability, private-state backup and subscription usage. The 1–2 hour upkeep target and a supported multi-record production deployment remain unmeasured.

## Controlled daily call queue

`apollo-queue.mjs` extends the existing connection's private ledger, exclusive lock and atomic writes. `apollo-queue-cli.mjs` prepares exact connected requests; it owns no API credentials or outbound executor. Use the separate private `apollo-controlled-proof/daily-call-queue` directory so the original email/reply proof remains intact. Start from [the disabled example](apollo-queue.example.json), choose a fresh reserved run ID, use the observed Apollo owner ID, and set a future exact callback time. `enabled` must remain false; only `daily_queue.enabled` permits bounded fictional task writes. At most ten named cases are supported. Changing their identities/outcomes against existing state is blocked.

The connected proof used three fictional cases. Each has a `.invalid` email and no phone number. Apollo canonicalized the reserved subdomains; account verification retains the exact run/case name and permits only the observed run-domain normalization. Compact task reads omit owner/account fields, so only an exact existing task/contact binding can retain the owner verified at creation. Conflicting returned values still fail.

| Verified simulated outcome | Connected result |
| --- | --- |
| No answer | One scheduled `outreach_manual_email` task, with the exact test-only subject/body and a native draft still unsent. No send operation exists in this interface. |
| Callback | One high-priority call task at the exact requested test timestamp; no email. |
| Decline | Persistent stop state, no handoff, and an empty independent scheduled follow-up search. |

All three original call tasks were skipped without dialing. Only separate `action_item` simulation tasks were completed. Their saved, scoped outcome notes were independently read before any handoff. Completion alone, a skipped call or arbitrary free text cannot release email. A fresh-session restart retained one verified event per case and created no duplicate handoff. The native Tasks view showed exactly two open test tasks: the unsent email and callback. Source/status receipts and `apollo-task-list-verified.png` remain private. The queue's task writes were disabled after the proof; research and outbound sending stayed disabled throughout.

From `pipeline/`, use a fresh `STUDIO_APOLLO_SESSION` and set `STUDIO_APOLLO_STATE_DIR` to the queue's private directory:

```powershell
node apollo-queue-cli.mjs prepare owner-read profile
# Invoke the returned connected tool/input, save the unmodified result to receipts/owner-read.json.
node apollo-queue-cli.mjs settle owner-read
node apollo-queue-cli.mjs prepare case-read contact_search no-answer
node apollo-queue-cli.mjs settle case-read
node apollo-queue-cli.mjs status
node apollo-queue-cli.mjs pause
```

For a new authorized proof, the per-case recipe is exact contact search, company/contact creation, exact empty task search, call creation/readback, simulation action-item creation/readback, `fixture <case-id>`, `fixture_complete` for the action item, independent `task_show`, and `call_skip`/readback for the unperformed call. Only an eligible verified outcome permits `task_search`/`task_create`/`task_show` with kind `handoff`. Prepare syntax is `prepare <key> <operation> <case-id> <call|fixture|handoff>`; settle each exact receipt before the next dependent operation. Phone tasks can only be skipped, never completed by this test interface. Do not click Send email or Start call session in the native test list.

A pending mutation blocks further mutations for its case, including under a new key. Save and settle its actual result. Lost task-create responses can reconcile through exact owned scheduled-task search; lost fixture-completion or skip responses reconcile through exact task readback. Unknown company creation remains held for authoritative reconciliation, never recreated. Foreign, ambiguous, incomplete, externally enrolled or changed-message results remain pending. Routine reads can refresh ownership; they do not erase restrictions. Pause retains all records and evidence. Back up the stopped private directory, configuration and raw receipts together; do not restore over the original or use the research job-bundle backup as an S2 backup.

`dailyCallQueue` orders due callbacks, follow-ups and new tasks, deduplicating by company with no 50-item cap. Those mechanics are account-free tested, including 54 distinct due companies; fictional records always count zero real calls, emails and businesses. This increment neither measures daily capacity nor implements production activity metrics, research-qualified enrollment, automatic sending/cadence, Sheet synchronization, calendar booking or multi-record reply supervision. Native task tools are available, but a dedicated call-log endpoint is not exposed by this connector; actual call capture requires a later verified route. The chat destination was a test choice. Production should keep routine logs private and consolidate actionable exceptions; its alert destination remains undecided. No recurring queue task was created.

Verify with `node --test apollo-queue.test.mjs`, `npm run check` and `npm test`. Native [task creation](https://docs.apollo.io/reference/create-a-task) and [task detail](https://docs.apollo.io/reference/get-a-task) support the chosen manual-task boundary; [call dispositions](https://knowledge.apollo.io/hc/en-us/articles/5494331315853-Use-Purposes-and-Dispositions-to-Understand-Call-Outcomes) remain distinct from these simulated outcomes.

## Recovery, upkeep and rollback

Receipts are persisted before mutation. Pending actions cannot replay, including under another key. If the raw response was saved, inspect and settle the original request. Exact owned task search can resolve a lost scheduled task-create response without recreating it. Ambiguous/truncated/foreign results hold. Unknown account/contact/draft creation requires authoritative manual reconciliation; there is no guessed-ID or retry fallback. Inspect uncertain sends through their exact status/provider UI, never resend. Follow current-session ID requirements when resuming.

The existing exclusive lock/atomic replacement protects state. Stale locks require confirmed process exit before manual recovery. Preserve configuration, full state, receipts and evidence together in an owner-only backup, separately from legacy research bundles. Automatic S2 backup/restore, broader exception aggregation and sustained production supervision remain later work.

Set outbound `enabled: false` to stop new record/message mutations; the separate monitor control still permits a scoped stop. Disable that control and pause its heartbeat to stop monitoring too. Neither control undoes an email already queued in Apollo. Verify pending sends/sequences before cleaning up only owned test tasks. Retain the labelled fictional account/contact as evidence. The adapter never starts research or changes stock sequences. Code rollback uses a Git revert/PR; provider state needs separate authoritative readback.

Before production: verify native call outcomes, campaign reply rules/stop behavior under active controlled sending, cadence, company/day metrics, calendar/reply handling and automated projection. Validate sustained scheduled execution and multi-record supervision without extracting session credentials, then satisfy sender/domain and website/inquiry launch gates. The full [S2 acceptance scenarios](OUTREACH.md#controlled-acceptance-before-activation) remain open beyond this increment.

```powershell
npm run check
npm test
node --test apollo.test.mjs
```

The suite substitutes Apollo/Gmail at the external boundary and makes no account request. Connected recipe: verify profile/exact test identity; create/read bounded records; execute skip/no-answer fixtures; check duplicate prepares after restart; complete only the fixture action item. After sender readiness and concrete approval, verify the exact draft, send once, read delivery status, confirm arrival and ingest the authenticated reply thread. Reopen to check duplicate reply handling, disable outbound and verify the Google projection/preservation. Record actual delivery/reply separately from simulated calling; neither makes the fictional business a real outreach count. Record passed, failed and pending checks separately.
