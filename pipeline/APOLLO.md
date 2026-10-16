# Controlled Apollo connection

This first S2 increment connects private Node receipts to the existing authenticated Apollo app connector and a fictional Sheets projection. **Production is blocked; research remains paused.** It adds no dependency, API key, model API or recurring job. The [workflow](OUTREACH.md) owns full production requirements; the [controller](CONTROLLER.md) owns research separately.

`apollo.mjs` owns record bounds, eligibility and receipts. `apollo-cli.mjs` prepares/settles requests. The Codex app invokes the returned Apollo tool and saves its exact response privately. Apollo owns email execution. This requires an active authenticated app session; it is not a standalone unattended transport or another follow-up scheduler.

## Executed verification — October 16, 2026

| Check | Result and boundary |
| --- | --- |
| Profile/mailboxes | Connected profile read passed. No linked sender was returned at the last read. |
| Fictional company/contact | One reserved `.invalid` company/contact created and read back. The contact has no phone. Apollo title-cases names; exact email, organization and account checks remain. |
| Apollo tasks | One standalone test call and one fixture action item created/read back. The call was skipped without dialing; only the action item was completed after executing its local simulation. Final statuses were read back as skipped/completed. |
| Call-first gate | Persisted skipped-call fixture stays ineligible. Separately labelled simulated no-answer permits the owner-only branch. Neither creates a real call or daily contact count. |
| Restart/duplicates | Separate CLI processes reuse saved mappings. Repeated company/contact/task prepares return already-done without another provider mutation. |
| Failure/recovery | Account-free tests cover lost task-create response reconciliation, uncertain receipts across reopening, foreign records, envelope mismatches, reply/decline holds, late events, caps and business-day expiry. Faults are injected; no real provider crash/quota exhaustion is claimed. |
| Sheets | `Outreach test!A1:J2` contains the fictional mapping and explicitly simulated outcome. Native readback/rendered layout checked. `Prospects!A1:P101` matched its saved baseline exactly; original tabs retained. This is an app-assisted projection, not a polling synchronizer. |
| Actual email/reply | Pending owner mailbox linking. One exact test message between owner-controlled inboxes is approved. No draft/send/enrollment/sequence activation occurred while the sender was missing. |
| Pause | Private test configuration is disabled after record verification; a new draft request was rejected. Saved mappings and owner approval remain for a verified resume. |
| Local checks | Syntax and all 106 account-free tests pass, including 19 Apollo tests. No subscription worker invoked; no active research runner found. |

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

Subjects/bodies must identify the test; unresolved merge placeholders block it. The fictional contact keeps its `.invalid` address; explicit recipients override it to the approved owner inbox. Draft readback must match the exact contact, sole To recipient, subject and HTML. Unexpected normalization or omitted fields holds the action for inspection; do not send an unverified envelope.

Only one send reservation is permitted per run. Scheduled/drafted counts zero. Poll the exact returned message ID at most four times, 10–20 seconds apart, as the connector requires. Unknown/failed is not delivery; failure holds the route. Repeated delivery receipts count once. Independently verify destination arrival. A local reply fixture does not prove real reply ingestion or queued-step cancellation.

## Recovery, upkeep and rollback

Receipts are persisted before mutation. Pending actions cannot replay, including under another key. If the raw response was saved, inspect and settle the original request. Exact owned task search can resolve a lost scheduled task-create response without recreating it. Ambiguous/truncated/foreign results hold. Unknown account/contact/draft creation requires authoritative manual reconciliation; there is no guessed-ID or retry fallback. Inspect uncertain sends through their exact status/provider UI, never resend. Follow current-session ID requirements when resuming.

The existing exclusive lock/atomic replacement protects state. Stale locks require confirmed process exit before manual recovery. Preserve configuration, full state, receipts and evidence together in an owner-only backup, separately from legacy research bundles. Automatic S2 backup/restore, exception aggregation and unattended supervision remain later work.

Set `enabled: false` to stop new test mutations; it cannot undo an email already queued in Apollo. Verify pending sends/sequences before cleaning up only owned test tasks. Retain the labelled fictional account/contact as evidence. The adapter never starts research or changes stock sequences. Code rollback uses a Git revert/PR; provider state needs separate authoritative readback.

Before production: verify native call-outcome capture, reply/suppression interfaces, queued-step cancellation, cadence, company/day metrics, calendar/reply handling and automated projection. Prove a supported unattended transport without extracting session credentials, then satisfy sender/domain and website/inquiry launch gates. The full [S2 acceptance scenarios](OUTREACH.md#controlled-acceptance-before-activation) remain open beyond this increment.

```powershell
npm run check
npm test
node --test apollo.test.mjs
```

The suite substitutes Apollo at the external boundary and makes no account request. Connected recipe: verify profile/exact test identity; create/read bounded records; execute skip/no-answer fixtures; check duplicate prepares after restart; complete only the fixture action item; verify Google projection/preservation. Add draft/send/arrival/reply checks after mailbox readiness. Record passed, failed and pending checks separately.
