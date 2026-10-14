# Controlled research proof

One Windows Node.js process connects the **Research proof** tab of the existing tracker to subscription-authenticated Cursor, Claude and Codex CLIs. It supports named on-demand runs and a bounded listener that automatically picks up one specified new job from Sheets. It does not install a recurring schedule, contact businesses or connect to Apollo.

Legacy jobs retrieve 2–4 approved business-host HTTPS pages. Explicit version-2 jobs use 1–4 approved public sources, including reviewed external/social captures and a blank unverified website. The runner saves dated text with SHA-256 checksums, then asks the selected worker to extract facts and assess opportunities. Workers receive the same evidence contract through stdin. The Google connection moves records; no separately billed model API is configured. Existing subscription limits and account billing settings still apply. A successful job is an execution result; source review and an owner conversation determine business suitability.

## Setup and commands

Requires Windows, Node 24, the three existing signed-in CLIs and the dedicated Google service account. The observed versions and dependency scope are in [TOOLKIT.md](../TOOLKIT.md). Tests also run on Linux without provider accounts.

From `pipeline`:

```powershell
npm ci --ignore-scripts
npm run check
npm test

$env:STUDIO_STATE_DIR = 'C:\private\studio-pipeline-proof'
node proof.mjs google-probe
node proof.mjs run proof-cursor cursor
node proof.mjs run proof-claude claude
node proof.mjs run proof-codex codex

# Start before Dot submits a new, unique queue ID; stops after that one job.
node proof.mjs watch proof-auto-example --timeout-seconds 900

# Optional, bounded handoff on recognized subscription quota errors only.
node proof.mjs watch proof-auto-example --fallback claude,cursor
```

Use an explicit private state directory outside every Git checkout. Put a real, dated `business.json` there using [business.example.json](business.example.json), and copy [google-config.example.json](google-config.example.json) there as `google-config.json`. The credential file belongs in separate protected local storage, never this repository, the job directory or worker prompts. Set a Windows ACL allowing only the owner and SYSTEM. Grant that machine identity Editor access only to the intended workbook; no Cloud IAM role, Gmail access or domain-wide delegation is needed. API enabling and credential sharing require the owner's approved scope.

`node proof.mjs prepare` creates four private jobs (`proof-cursor`, `proof-claude`, `proof-codex`, `proof-recovery`) and refuses to overwrite existing jobs. It does not create queue rows. Create the corresponding rows through the connected Sheets plugin, then run the probe before a live worker. Missing Google configuration permits an explicitly labelled local-only test; it does not count as a connected proof.

`google-probe` reads workbook metadata, writes a unique receipt to `Research proof!P7` and verifies the readback. This is the current connection health check. Every execution transition and final result also has a readback check. `node proof.mjs sync <job-id>` reconciles retained local results without invoking a model.

## Queue contract

Keep columns A:G as job inputs: job ID, business, website, newline-separated seed URLs, requested worker, Ready/Pause request and purpose. Columns H:P belong to the runner: execution status, actual worker, attempt ID, checkpoint indicator, source count, recommendation, report JSON, updated UTC and review notes. Keep N hidden for readable browsing. The state directory holds the matching immutable job inputs; changed scope requires a new job ID.

`run` names the worker explicitly and validates the Sheet inputs. `watch <job-id>` polls only that exact ID every five seconds for up to 15 minutes by default (configurable waiting limit: 30–3600 seconds). It accepts one fresh Ready row with no prior reservation and worker `cursor`, `claude` or `codex`; paused/completed rows never launch work. Duplicate IDs, unknown workers and existing reservations stop the listener. It saves immutable business scope/purpose with the current UTC source date outside Git, takes the existing execution lock, rechecks inputs including the requested worker and publishes/verifies a Running attempt before fetching pages or launching a CLI. The attempt records its worker. It exits after that job. Without `--fallback`, failures stop; the optional handoff policy below is the only automatic provider switch. The waiting limit ends when pickup occurs; existing source/worker timeouts bound execution separately.

Dot and the runner use separate Google access. Verify Dot's own plugin metadata/read/write rather than assuming this chat's connection transfers. Dot owns A:G and reads results in H:P; it never dispatches the same queue job through a separate Work/Codex task. For a controlled test, have Dot recheck an empty row, preserve neighboring formatting/validation without copying old values, write one unique ID with exact business-host seeds, selected worker, Ready and a proof-only purpose, then read back the inputs. The listener supplies the attempt/result automatically. Dot reads the final ID/status/worker/attempt/source count/recommendation and stops. If Dot requests human confirmation in its own chat, the owner must provide it; another agent must not approve for them.

Run only one dispatcher on one computer; do not sort, delete or move queue rows during a run. The local process lock and readback reservation cover this controlled single-computer flow; they are not a distributed Sheets transaction. A workbook Editor grant covers the whole workbook even though this code writes only the proof ranges.

Private `sources.json` retains successful page text, retrieval times, final URLs, hashes and failed-read reasons. `checkpoint.json` retains extracted evidence. `state.json` retains attempts and process IDs; per-attempt prompts/results/logs and `events.jsonl` retain execution history. Reports must cite retrieved URLs/hashes and source dates. Failed reads cannot count as facts. Every commercial effect remains a hypothesis. Checksums establish provenance and integrity, not factual accuracy; compare claims and absence statements against the actual pages.

For policy claims, check what each interval or condition measures before calling it inconsistent; a response-time promise and a reporting deadline can both apply. Execution Complete and source-review Accepted are separate checks, and neither establishes outreach eligibility.

## Version-2 research and reviewed external sources

For a new quality job, leave C blank if no standalone website is verified; D lists 1–4 exact approved HTTPS source URLs. Do not put a Facebook URL in C and call it a standalone website. Use a new unique ID and select the worker as usual:

```powershell
node proof.mjs watch quality-example --quality --timeout-seconds 60
# For external/social sources, prepare and review the private captures first.
node proof.mjs watch quality-social-example --quality --sources 'C:\private\reviewed-captures.json'
```

The explicit flag snapshots `research_version: 2`; free-text purpose never selects a schema or becomes a business research topic. Named `run` commands retain their saved version. Legacy jobs/checkpoints remain unchanged. Changed scope, version, source date or captures require a new ID. Private capture files are read only under the existing job execution flow; saved evidence is immutable across retries. `--sources` may also accompany an explicit named resume if collection never succeeded; it cannot replace already-saved evidence.

Business-host retrieval remains automatic with its existing network restrictions. External/social sources are an operator-assisted path: discover the correct public business, read the available business content through connected search/browser tools, verify name/location/linked identity, then save a private JSON capture packet. The runner does not bypass login walls, scrape private accounts or automatically turn search results into verified business facts. Signed-in browser visibility does not authorize reading private messages; public business content only. A restricted-use source is excluded from marketing inputs.

Packet fields: top-level `reviewed_by`, `sources` and `failures`. Each source needs `url`, `checked_at` (job's UTC date), `fetched_at` (ISO retrieval/capture time), `text`, `content_sha256`, `kind` (`business`, `social`, `directory`), `capture_method` (`http`, `reviewed_page`, `search_snippet`), `coverage` (`full`, `partial`) and a specific `identity_note`. Add `coverage_reason` and an observed `content_date` when useful. The hash is SHA-256 of the exact UTF-8 text. An excerpt, hidden content, an old index, or truncation requires partial coverage; never label it a full page. A current check date does not make old post content current. Failures record unavailable URLs/reasons and cannot count as facts. Keep irrelevant personal details, home addresses and third-party comments out of captures.

Capture files must be bounded regular files outside Git. Each URL/date/hash/identity note is checked before the worker starts. Observation evidence must quote short exact text from its cited capture, with no more than 25 quoted words per source across distinct excerpts. Contact routes are exact captured source URLs, not guessed addresses or unvisited outgoing links. Reports may contain 1–6 supported observations; thin evidence must not be padded to four. Partial/directory/snippet-only evidence requires **Insufficient evidence** and zero opportunities. A proposed opportunity needs a supported primary observation, existing alternatives, a validation step and an owner question. A discussion recommendation with no opportunity is rejected.

Prompts distinguish reporting deadlines from resolution promises, unknown systems from observed pain, social ordering from poor performance, and no storefront from no website. These are reasoning instructions, not proof of entailment: exact quotes and hashes cannot establish that an interpretation is true. Compare every finding with the source and record Accepted/Needs review separately. A public pause/closure update requires a current status check; do not assume reopening. `No strong public case` and `Insufficient evidence` are useful research outcomes, not failures to invent a sales angle.

## Discovery intake and qualification

Use the existing workbook's **Discovery intake** tab for the public-source handoff. A:H belong to the discovery operator/Dot: Job ID, Business, Category, Area, Found through, Worker, Request and the private JSON evidence packet. H is hidden for readability; I:M belong to the runner: handoff, update time, research ID, review decision and next action. This inbox prepares the one execution queue in Research proof. It is not a second worker dispatcher. After Queued, control execution through Research proof F (Ready/Pause); changing the inbox request does not pause an already handed-off job.

Discover candidates through local Search/Maps, public business Instagram/Facebook pages and suitable local/vendor directories. Keep the current category/area hypothesis explicit. Check exact business identity and currently available customer information/actions. Record actual search terms and the bounded website check: **Verified site** requires a standalone URL; **No verified site found** leaves it blank and never asserts confirmed absence. Existing menus, booking links and contact options are alternatives to assess. A social-first business or a coming-soon page alone does not establish poor performance, owner need or willingness to buy.

Copy [discovery.example.json](discovery.example.json) into private storage and replace every fictional field with observed data. Keep public captures dated, identify their reviewer and preserve honest full/partial coverage; do not copy unrelated personal information or private messages. Capture hashes are computed at intake; an optional supplied hash must match. Source/job dates must be the current UTC date at intake. The Sheet JSON packet is limited to 48,000 characters; it supports the same 1–4 sources and 20,000-character per-source limits. Reduce the number/scope of sources honestly if the packet is too large; do not relabel an excerpt as a full page. Do not put fictional examples into the live workbook.

For a controlled shared handoff, start the listener, then submit one new row with matching visible A:G and packet H:

```powershell
node proof.mjs watch discovery-new-id --intake --timeout-seconds 900
# Alternative for an operator with a prepared private packet:
node proof.mjs intake 'C:\private\candidate.json'
node proof.mjs watch discovery-new-id --quality
```

The shared listener waits only for that ID and Ready request, validates the packet, saves immutable inputs/captures, creates and reads back one research row, acknowledges Queued, then runs the selected existing subscription worker. It exits after one job. Unknown workers, mismatched fields, duplicates, stale dates, changed evidence and uncertain writes stop before assessment. Identical intake replay does not append or rewrite a job. The local-packet command only stages the job; it does not invoke a worker. Keep one dispatcher and do not sort/delete/move rows while running. A failed/uncertain handoff requires inspection of both inbox and research records plus private state; after reconciliation, use an explicit named `run` to resume. Reopening an acknowledged inbox row never silently replays execution.

When Complete, generate the review form and inspect every observation against the actual sources:

```powershell
node proof.mjs review-template discovery-new-id 'C:\private\review.json'
# Complete the private form, then:
node proof.mjs review discovery-new-id 'C:\private\review.json'
```

The template binds the decision to the current attempt and exact report/source-file hashes. Fill `reviewed_by`, an identity note, every indexed observation's supported flag and specific review note, a rationale and next action. Decisions are **Hold**, **Pass**, or **Research-qualified**. Hold/Pass do not add a prospect. For Research-qualified, require a validated Suitable to discuss report, all supported observations, current primary operating evidence, a selected recorded opportunity and a captured first-party public contact route. An optional email must appear exactly in that contact source; unclaimed directory/snippet contact details do not qualify. Evidence older than 14 days needs fresh research before positive qualification. Active here records the reviewer's current public evidence, not owner-confirmed trading/availability. Public-source interpretation and commercial judgment still require review; hashes and boolean checks cannot establish them automatically.

If source review corrects a completed report before final qualification, retain the original completed JSON and raw worker outputs, document the field changes/reason and before/after report hashes privately, validate the amended report against unchanged snapshots, then `sync` and generate a fresh review template. Never label a reviewer amendment as an untouched model result. Changed source scope/date still requires a new job ID; a report correction does not permit changing the saved evidence.

The reviewed positive record enters the existing native Prospects table at **Research**, with last contact, proposal and money fields blank. Notes retain the rationale, owner question, report hash and unconfirmed budget/urgency/need. Research-qualified is permission to prepare discovery, not sending authorization or a claim that the business is struggling. Apollo remains the future outbound owner. No sending sequence is activated. Exact decision replay makes no duplicate record; existing user edits, declines or commercial fields are never overwritten. A changed final decision requires manual reconciliation with any existing prospect; decisions are immutable in this controlled increment. Failed-assessment feedback can be archived and replaced after an explicit corrected attempt; original worker outputs remain intact.

Private job backups now include intake and qualification when present (up to eight operational files). Restore preserves the review and evidence but does not create a prospect, configure Google or call a worker. The controlled Prospects writer stays within the existing 101-row native table and stops at capacity; expand and verify the native table before larger batches. Discovery/capture and semantic review remain assisted. SOSA's expanded submission now has its own connected check below. Scheduling, multiple-job dispatch, usable capacity and production cutover remain separate work.

## Executed SOSA expanded submission check

On October 14, SOSA used its own Google plugin to submit one new Discovery intake A:H record after direct owner confirmation in its chat. The supplied packet contained an operator-reviewed partial homepage capture, discovery context, identity/website checks and attribution. SOSA read back all eight inputs; the 1,969-character JSON matched the privately prepared string exactly. The already-listening `watch <new-id> --intake --timeout-seconds 900` validated/saved the packet, acknowledged Queued, created one research row and automatically invoked the existing Claude subscription CLI. One attempt completed both phases in about 51 seconds after pickup, yielding one source, four observations, Insufficient evidence and zero opportunities. No named `run`, retry, fallback or model API was used for this job.

SOSA independently read the completion, then flagged the generic prospect notes for benchmark exclusion. Operator source review accepted all four observations with their coverage/current-operation limits and recorded Hold, explicit exclusion from C2/qualification/outreach and a no-contact next action. Original model output and source hashes remained unchanged. The full saved report matched private JSON; earlier neighboring intake/research values and Prospects were unchanged. Both worker PIDs exited, the runner lock was absent and the bounded listener stopped. The private `sosa-expanded` folder holds the packet, per-observation review, hashes, receipts and SOSA/Sheet browser evidence; real business data stays outside Git.

To repeat, prepare a new dated packet and unused business/job identity, run `google-probe`, start its bounded intake listener, then ask SOSA to inspect an empty intake row and submit/read back A:H through its own plugin. If SOSA requests direct owner confirmation, the owner must provide it in SOSA; a relayed approval does not satisfy that check. Preserve I:M for the runner. Compare the saved packet/report with private files, review each observation, record benchmark exclusions and verify SOSA's final result lookup, exited workers and released lock. Stop after the one job. This check proves submission/readback of supplied evidence, not SOSA's independent discovery/capture, recurring write authorization, unattended semantic review or 200 detailed businesses/week.

## Executed discovery/qualification check

On October 14, this chat submitted three real-business packets to Discovery intake; one listener was started before submission, and the others selected their existing Ready records. Each packet was verified, saved privately, handed to the one Research proof queue and assessed using its selected existing Codex, Claude or Cursor subscription. Four captures produced 12 reviewed observations. Two quote-budget failures stopped assessment; two explicit reassessments reused the same evidence/checkpoint. Source review then documented an amendment restoring a supported FAQ-repetition finding omitted by the last formatting revision. The original completed model report, rejected raw outputs, reviewer changes and all hashes are retained privately. The resulting small website-cleanup discussion candidate is not an untouched AI recommendation or a confirmed owner need.

The final decision added one first-party-email candidate to Prospects at Research and held two others for missing operating/problem/contact evidence. All three decisions and next checks were read back in Discovery intake and Research proof. Repeating the positive decision returned the existing prospect without a write. An eight-file backup restored into a new private root; a completed named run returned from cache with no worker call or Google configuration. Native table/chip metadata and the Google-rendered inbox/prospect views were verified; all recorded worker processes stopped and locks were released. Syntax and 47 account-free tests passed. The private `discovery-build` receipt owns real identities, review/amendment details and executed commands. This verifies the assisted handoff/qualification increment; the separate SOSA submission check is above. C2 category selection, unattended collection, recurring dispatch and weekly capacity remain unverified.

## Executed mixed-source calibration

The October 13 six-business test used all three saved subscription CLIs, 11 dated captures and 26 reviewed observations. It included a policy-clock control, a site with Instagram updates, an Instagram-led candidate with a dated business pause, a Facebook public Intro and older/unclaimed directory cases. Four had no verified standalone site; no definitive website-absence claim was made. Two final reports have No strong public case and four Insufficient evidence; none is qualified for outreach or counted toward C2.

Three initial drafts were rejected for contract violations, then explicitly reassessed from the same evidence. Limited-evidence outcomes are now constrained in the generation schema as well as checked afterward. Source review documented edits on three records, including an event classification, a class venue versus business location, and a directory HTTP URL versus the HTTPS read actually attempted. Original outputs and feedback are retained privately. All final Sheet reports matched private JSON; recorded worker processes exited and the lock was absent. Syntax and 38 account-free tests passed. This is evidence of a controlled quality workflow, not a claim that prompting or excerpt checks alone make every AI statement correct.

The private `quality-captures/quality-sample-review.json` receipt records identities, per-job hashes, attempts, corrections and readbacks. Quality sample in the live tracker is a readable projection keyed to Research proof jobs, not a second execution queue. Repeat with new IDs and currently reviewed sources, preserve partial coverage and unresolved facts, compare each claim against the actual source and save the review before any qualification. Source discovery/browser capture and semantic review still need a repeatable unattended handoff and measured effort before larger batches.

For a reviewed result, save private `review.json` with the current `attempt_id`, `verdict` (`Accepted` or `Needs review`), `reviewed_at` and an array of `notes`. Sync it to show the review in Sheets. To correct a completed assessment:

```powershell
node proof.mjs run proof-claude claude --revise
```

This requires current review feedback, creates a new attempt and reuses the saved evidence. Prior raw outputs remain in their attempt logs. A correction can fix a checkpoint summary in the report without rewriting the original checkpoint.

## Executed automatic pickup recipe

On October 13, Dot used its own Google plugin to submit/read back one fresh Ready record while `watch <job-id>` was already listening. The runner reserved it before retrieval, ran the existing ChatGPT-authenticated Codex CLI and saved four dated sources/five observations in about 46 seconds after pickup. Dot independently read Complete from Sheets. This was one new queue job, not a manual `run` invocation or another Dot-created task.

Source review then corrected a policy-timing interpretation through one separate assessment. Both retained evidence-file hashes stayed unchanged. The reviewed report has no strong public case and stays excluded from C2/outreach. The full Sheet report matched private JSON; every recorded worker PID was stopped and the global lock was absent. The tracker and private `dot-queue-receipt.json` hold the actual IDs, source dates, timings and hashes.

To repeat: run `google-probe`, choose a new unused ID, start its bounded `watch`, then have Dot verify an empty row and submit/read back A:G as described above. Confirm the reservation precedes worker launch, compare the final H:P result/report with retained private state, review claims against snapshots and sync the review. Verify Dot's own final lookup, stopped PIDs and lock release. The listener exits after the one job; preserve private evidence and pause the row when retiring it. This recipe activates no recurring schedule.

## Executed recovery recipe

```powershell
node proof.mjs run proof-recovery cursor --interrupt-assessment
# Expected: nonzero exit and state Interrupted after the assessment process exits.
node proof.mjs run proof-recovery claude
```

Before the second command, confirm the recorded prior PID is stopped and save the SHA-256 hashes of `checkpoint.json` and `sources.json`. Afterward, verify both hashes are unchanged, the replacement attempt has only assessment events and the Sheet records the new worker/attempt. The October 13 proof executed this recipe; its private receipt and tracker hold the evidence.

Normal Ctrl+C, active Pause, the controlled interruption and the four-minute phase timeout stop the exact worker process tree and wait for its exit. A live prior PID prevents reassignment. A global exclusive lock prevents overlapping executions. Named completed jobs return their retained report without another model call; the automatic listener skips them entirely. Authentication and unknown errors stop execution. There is no paid API fallback or unbounded retry loop.

Hard crashes need manual recovery: stop the dispatcher, inspect `.runner.lock` and every job's `child_pid`, confirm those exact processes are stopped, retain a copy of the lock, then remove only that stale lock and rerun the interrupted job. A stale timestamp alone is insufficient. Each result publication makes one PUT then compares all H:P values with the intended output. A lost response is reconciled only if that complete readback matches. An unavailable or mismatched receipt stops execution and any quota handoff; inspect the row's attempt and reconcile using `sync`. Never append another row or overwrite a foreign attempt.

Set column F to Pause to block pickup and stop active work. Control is checked between phases, before accepting completion and every five seconds during execution; network latency/timeouts add to detection time. A stopped job becomes Paused with its snapshots/checkpoint retained. Lost Google control, changed inputs or a changed reservation abort execution as Blocked. Restore Ready, verify the old PID has exited and explicitly `run <job-id> <worker>` to resume; `watch` does not silently restart a reserved job. A Pause arriving after the final completion check can race with an already-finished assessment; verify the recorded final state. No Task Scheduler entry exists. Keep test rows excluded from C2 and outreach. Roll back by stopping this runner, pausing the rows and using the prior Git revision; revoke the workbook share/key if retiring the proof identity.

## Subscription quota handoff

`run` and `watch` accept `--fallback claude,cursor` (choose the other workers appropriate to that job). Each named worker is tried at most once, in order, with a new attempt; duplicates, unknown names and the primary worker in that list are rejected. There is no default fallback. A recognized terminal provider quota/usage-limit error records Quota, confirms child exit and verifies that same Sheet reservation before continuing. Saved snapshots/checkpoints are reused; collection runs only if no checkpoint was saved. Column E retains the requested primary worker and I records the actual worker.

Only terminal JSON error envelopes are classified. Research prose containing quota words and transient retry events cannot trigger handoff. Authentication, validation, unknown failures, Pause/Blocked and uncertain Google writes stop the run. If all allowed workers are exhausted, it ends in Quota for explicit owner action. Provider error formats may change; an unknown format stops safely rather than assuming quota or activating another service. Actual subscription exhaustion has not been induced; quota contracts are fixture-tested.

## Private backup and restore

Stop execution before backing up. The backup takes the same global lock and refuses unresolved/running processes. It exports only validated `job.json`, `state.json`, retrieved sources, checkpoint, report and optional quality review, with file checksums. It excludes Google configuration, credentials, raw prompts/results/logs and the runner lock. This is a job evidence backup, not a complete machine/account backup; private raw history and separately protected credentials need their own owner-managed retention.

```powershell
$env:STUDIO_STATE_DIR = 'C:\private\studio-pipeline-proof'
node proof.mjs backup proof-auto-example 'C:\private\job-backup.json'

# Parent folder must exist; destination itself must be new.
$env:STUDIO_STATE_DIR = 'C:\private\restored-proof'
node proof.mjs restore 'C:\private\job-backup.json'
node proof.mjs run proof-auto-example claude
```

Backup output and restore destinations must stay outside Git and cannot overwrite existing paths. Restore validates bounded regular files, allowed filenames, checksums, job/evidence identities and stopped state before creating anything. It performs no execution or Google writes and restores no Google configuration. The final command above verifies a completed job from cache with no model invocation. Do not use it to resume an incomplete job until the current queue scope, credential configuration and Ready request have been explicitly reconciled. Keep bundles private in Drive; create a separate native tracker copy for operational-record backup, never test restore by overwriting the authoritative tracker. Restoring a machine also requires rechecking subscription logins and separately provisioning the scoped Google credential.

## Executed pause, recovery and restore checks

On October 13, a fresh controlled job retrieved four pages under Codex. Changing F to Pause during assessment stopped the recorded worker process and saved Paused. An explicit Claude resume invoked assessment only, kept both evidence hashes unchanged and verified Complete in Sheets. Source review marked that report Needs review: it confused guarantee timing and proposed improvements from unknown systems. Execution success does not qualify that business.

A separate benchmark reused those same snapshots and injected a quota error before a Codex model call, then completed through the real Cursor subscription CLI. Another injection dropped the response after a real Sheets PUT; exact readback reconciled it without repeating the mutation. These prove controlled failure handling, not actual provider quota exhaustion. Private receipts distinguish injected failures from real provider execution. The private job-bundle restore check compares evidence byte-for-byte, retains completed state and invokes no model; the native tracker backup is checked separately. All benchmark rows remain excluded from C2/outreach.

## Limits and upkeep

The HTTP collector supports bounded server-rendered HTML/plain text from the approved business host. It rejects private/reserved addresses and out-of-scope redirects, caps response size and marks truncation. It is a controlled local collector, not a public URL-fetching service. Version-2 external/social text enters through reviewed captures; automatic source discovery, browser ingestion and wider unattended collection are not implemented. Public-reader throttling and browser login limits can differ. Native unattended Cursor web-fetch attempts were rejected on the tested version; those earlier results were excluded. Shared evidence lets subscription assessment proceed without weakening CLI permissions.

Before recurring unattended operation: verify any selected schedule and meaningful-change health alerts, confirm real provider quota/on-demand behavior, settle automatic discovery/capture and review effort, measure usable capacity and test production account cutover. Active pause, simulated quota/write handling, job restore and a bounded mixed-source quality calibration do not establish unattended production readiness or 200 detailed usable records/week. Measure usable outcomes, retries, quota consumption and review effort before increasing volume.

Ensizziyo owns accounts, runtime availability and business exceptions. Proposed upkeep is a weekly quality/usage review and monthly access/restore check; its real effort remains to measure. After a relevant CLI, Node, Google-library or provider change, rerun one controlled job and the handoff check before increasing volume. Code changes and synthetic tests belong in Git; all real research and credentials remain in private storage/Sheets.
