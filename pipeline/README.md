# Controlled research proof

One Windows Node.js process connects the **Research proof** tab of the existing tracker to subscription-authenticated Cursor, Claude and Codex CLIs. This is an on-demand proof runner. It does not poll automatically, schedule jobs, contact businesses or connect to Apollo.

The runner retrieves 2–4 approved public HTTPS pages, saves dated text snapshots with SHA-256 checksums, then asks the selected worker to extract facts and assess opportunities. Workers receive the same evidence contract through stdin. The Google connection moves records; no separately billed model API is configured. Existing subscription limits and account billing settings still apply. A successful job is an execution result; source review and an owner conversation determine business suitability.

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
```

Use an explicit private state directory outside every Git checkout. Put a real, dated `business.json` there using [business.example.json](business.example.json), and copy [google-config.example.json](google-config.example.json) there as `google-config.json`. The credential file belongs in separate protected local storage, never this repository, the job directory or worker prompts. Set a Windows ACL allowing only the owner and SYSTEM. Grant that machine identity Editor access only to the intended workbook; no Cloud IAM role, Gmail access or domain-wide delegation is needed. API enabling and credential sharing require the owner's approved scope.

`node proof.mjs prepare` creates four private jobs (`proof-cursor`, `proof-claude`, `proof-codex`, `proof-recovery`) and refuses to overwrite existing jobs. It does not create queue rows. Create the corresponding rows through the connected Sheets plugin, then run the probe before a live worker. Missing Google configuration permits an explicitly labelled local-only test; it does not count as a connected proof.

`google-probe` reads workbook metadata, writes a unique receipt to `Research proof!P7` and verifies the readback. This is the current connection health check. Every execution transition and final result also has a readback check. `node proof.mjs sync <job-id>` reconciles retained local results without invoking a model.

## Queue contract

Keep columns A:G as job inputs: job ID, business, website, newline-separated seed URLs, requested worker, Ready/Pause request and purpose. Columns H:P belong to the runner: execution status, actual worker, attempt ID, checkpoint indicator, source count, recommendation, report JSON, updated UTC and review notes. Keep N hidden for readable browsing. The state directory holds the matching immutable job inputs; changed scope requires a new job ID.

The proof command names the worker explicitly and validates the Sheet inputs. Dot priority selection, automatic dispatch and a shared reservation protocol are still to implement. Run only one dispatcher on one computer; do not sort, delete or move queue rows during a run. A workbook Editor grant covers the whole workbook even though this code writes only the proof ranges.

Private `sources.json` retains successful page text, retrieval times, final URLs, hashes and failed-read reasons. `checkpoint.json` retains extracted evidence. `state.json` retains attempts and process IDs; per-attempt prompts/results/logs and `events.jsonl` retain execution history. Reports must cite retrieved URLs/hashes and source dates. Failed reads cannot count as facts. Every commercial effect remains a hypothesis. Checksums establish provenance and integrity, not factual accuracy; compare claims and absence statements against the actual pages.

For a reviewed result, save private `review.json` with the current `attempt_id`, `verdict` (`Accepted` or `Needs review`), `reviewed_at` and an array of `notes`. Sync it to show the review in Sheets. To correct a completed assessment:

```powershell
node proof.mjs run proof-claude claude --revise
```

This requires current review feedback, creates a new attempt and reuses the saved evidence. Prior raw outputs remain in their attempt logs. A correction can fix a checkpoint summary in the report without rewriting the original checkpoint.

## Executed recovery recipe

```powershell
node proof.mjs run proof-recovery cursor --interrupt-assessment
# Expected: nonzero exit and state Interrupted after the assessment process exits.
node proof.mjs run proof-recovery claude
```

Before the second command, confirm the recorded prior PID is stopped and save the SHA-256 hashes of `checkpoint.json` and `sources.json`. Afterward, verify both hashes are unchanged, the replacement attempt has only assessment events and the Sheet records the new worker/attempt. The October 13 proof executed this recipe; its private receipt and tracker hold the evidence.

Normal Ctrl+C, the controlled interruption and the four-minute phase timeout stop the exact worker process tree and wait for its exit. A live prior PID prevents reassignment. A global exclusive lock prevents overlapping runs. Completed jobs return their retained report without another model call. Authentication/quota errors fail the attempt; reassignment is explicit during this proof, with no paid API fallback or automatic retry loop.

Hard crashes need manual recovery: stop the dispatcher, inspect `.runner.lock` and every job's `child_pid`, confirm those exact processes are stopped, retain a copy of the lock, then remove only that stale lock and rerun the interrupted job. A stale timestamp alone is insufficient. If a Sheets write is uncertain, inspect the row's attempt ID and reconcile using `sync`; never append another row or overwrite a foreign attempt.

Set the queue request to Pause to block the next invocation. Pause is checked before a run; it does not cancel an active child in this version. Use Ctrl+C in the dispatcher terminal for an active job. No Task Scheduler entry exists. Keep test rows excluded from C2 and outreach; preserve private evidence rather than deleting it after verification. Roll back by stopping this runner, pausing the rows and using the prior Git revision; revoke the workbook share/key if retiring the proof identity.

## Limits and upkeep

The collector supports bounded server-rendered HTML/plain text from the approved business host. It rejects private/reserved addresses and out-of-scope redirects, caps response size and marks text truncation. It is a controlled local collector, not a public URL-fetching service. JavaScript-only sites, social sources, wider source discovery and stronger network isolation require separate S1 validation. Native unattended Cursor web-fetch attempts were rejected on the tested version; those results were excluded. Shared retrieval made subscription-backed assessment work without weakening CLI permissions.

Before unattended operation: verify Dot queue edits, implement polling/reservation and active pause, exercise quota and ambiguous-write recovery, confirm backup/restore, review provider on-demand settings, and test production account cutover. The one-business benchmark does not establish 200 detailed usable records/week. Measure quality, elapsed time, quota consumption and owner review time on a larger bounded sample first.

Ensizziyo owns accounts, runtime availability and business exceptions. Proposed upkeep is a weekly quality/usage review and monthly access/restore check; its real effort remains to measure. After a relevant CLI, Node, Google-library or provider change, rerun one controlled job and the handoff check before increasing volume. Code changes and synthetic tests belong in Git; all real research and credentials remain in private storage/Sheets.
