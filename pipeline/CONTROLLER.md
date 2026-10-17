# Subscription research controller

The controller implements the three stages below and is **disabled by default**. The original October 15 build used fictional records and substituted external boundaries. The October 17 continuation verified actual subscription compatibility and one independently reviewed business, described below. The opt-in [Studio Operations supervisor](PRODUCTION.md#research-and-contact-contract) now runs the same exact-ID controller without a chat dispatch loop. No weekly capacity or production readiness follows from these bounded checks.

| Stage | Implemented behavior | Verification boundary |
| --- | --- | --- |
| 1. Budgets and priority | An exact campaign/job allowlist, durable call reservations, configured models, daily provider caps, per-job ceiling and a website/client pause control. | Synthetic persistence, restart, priority interruption and inert CLI checks. Codex metadata protocol is mocked; live reader compatibility remains to verify. |
| 2. Independent review | A fresh session checks every observation, all five journey findings, every opportunity and other report claims against retained raw sources and scoped context. Decisions bind to exact attempt/report/source hashes. | Fictional supported, unsupported, malformed and stale-reservation cases. Real semantic quality still needs a separately authorized calibration. |
| 3. Bounded recovery | One targeted repair and one provider handoff at most, confirmed child exit, unchanged checkpoint/evidence, original report archives, idempotent qualification and consolidated exceptions. | Injected timeout/quota/write loss and actual local state/control transitions. Hard-crash/orphan recovery remains operator reconciliation. |

## Roles and context

SOSA discovers prospects and prepares dated captures under the [playbook](RESEARCH.md). It stages inputs in **Discovery intake**, receives exceptions and summarizes progress. It must not dispatch the same jobs through another Work/Codex path. This build does not message SOSA or create a Dot schedule.

The local controller reads only the configured exact job IDs, intakes Ready version-3 packets, and calls the existing signed-in CLI workers. A new campaign cannot adopt existing proof/sample directories. Paused/not-yet-submitted intake waits; old campaigns and ambiguous reservations require reconciliation. The existing A:G/H:P and inbox ownership rules remain unchanged.

Each collection, assessment, repair and review is a fresh non-persistent CLI invocation. It receives the shared playbook, one business's sources and the saved evidence it needs; the reviewer also receives that business's report and discovery context. It receives no accumulated chat transcript, credentials or other businesses. Sources and checkpoints survive handoffs. New prompts, schemas, outputs, hashes and review receipts are retained privately. Policy edits require a controller restart; no historical regrading follows automatically.

A fresh reviewer normally uses a different available provider. If only the author provider is eligible, a separate fresh review session on that provider is allowed. This provides an independent pass, not a guarantee that two models cannot share an error. Unsupported reports receive one specific repair, then another fresh review. A report can pass fidelity review and still be Hold or Pass under the commercial criteria. Only an accepted, fully supported Research-qualified decision can create a **Research** record. No sending, commercial/payment state or Apollo operation is implemented here.

## Private files and limits

All runtime files stay under the existing private `STUDIO_STATE_DIR`, outside every Git checkout. Keep that root and its protected credentials separate from worker prompts. Do not use the real prospect directory for the account-free verification below.

- `controller-config.json`: exact campaign/IDs, provider models, research budgets and repair/handoff ceilings. At most 200 named IDs per configuration; the runtime window is at most 60 minutes. The example's six calls/provider/day and 30% Codex reserve are conservative placeholders, not a measured 200/week allocation.
- `research-control.json`: `enabled`, `priority` (`website`, `client`, `research`) and verified quota-resume timestamps. Missing/invalid control blocks execution. A local monitor checks each second by default and before every call. Priority is an explicit control, not automatic detection of your work in another app.
- `controller-state.json`: all call reservations, provider quota blocks, owned job stages, attempts and child IDs. Counters belong to this root across campaigns/restarts; never delete/reset them to regain allowance. Calls are charged before dispatch, including failed, interrupted and uncertain calls. A day is UTC. The conservative per-job total never resets.
- `controller-summary.json`: counts, exact job status/decision/reason/next action and daily provider consumption. It is written after jobs and at exit; `status` can read current private state without a Google/model request. It sends no notification.
- Per-job `auto-review-*.json` and `original-*.json`: immutable review receipts and exact rejected report bytes. The engine's attempt history and per-attempt logs retain authorship and recovery details. Existing immutable qualification rules still apply.

The controller owns one dispatcher on one computer, with one job/worker at a time. Its lock prevents another process using legacy runner commands against this root. Existing execution locks still protect intake, execution and qualification. Do not sort/delete/move live queue rows. This remains a single-computer Sheets workflow, not a distributed transaction or a worker fleet.

The CLI spaces Google requests by at least 1,250 ms and serializes them, including readbacks and review checks. This stays below the documented [60 reads and 60 writes/minute/user/project quotas](https://developers.google.com/workspace/sheets/api/limits) for this instance; other applications still share limits. Review reservation polling is at most every five seconds, separately from local priority polling. Uncertain mutations are read back, not blindly retried. Existing table capacities (research/inbox through row 1000, Prospects through row 101) and broad bounded queue scans remain; expand/address them deliberately before sustained volume.

## Subscription protection

The existing filtered environment removes paid API credentials from all workers. The controller has no model-API fallback and never purchases credits, enables overage or consumes an earned reset.

For Codex, `usage.mjs` starts a metadata-only stdio app-server connection: initialization, `account/read`, `account/rateLimits/read`, then closes it. It starts no thread or turn. All returned buckets/windows must be current, authenticated by ChatGPT, and above the configured reserve. Unknown/stale/low metadata defers the job without a model call. The installed 0.148.0 help supports app-server stdio/config/feature flags; its app-server does **not** accept `--ignore-user-config`. The reader restricts features explicitly. The live subscription reader passed on October 17 after the allowance reset, returning 100% remaining; this is an observation, not a capacity guarantee. See the official [account and allowance protocol](https://learn.chatgpt.com/docs/app-server).

Claude and Cursor currently have **local call caps**, not verified live percentage readers. Their configured `reserve_percent` does not provide an account-level guard. Your other chats and website/client work consume shared subscription capacity outside this ledger, and a call's token cost varies. Stop research or reduce its cap when needed. A recognized quota error blocks that provider across restarts. After inspecting the actual account allowance/reset and included-only settings, record a later current UTC timestamp for that provider in `quota_resumes`; changing the date does not refund calls.

All providers remain disabled until `included_usage_only_confirmed` and `enabled` are deliberately set after checking authentication and billing. This flag records an operator check; it cannot disable account overage. Claude usage credits were disabled and independently read back on October 17; its current model/response path still needs verification before enabling this campaign. The authenticated Cursor CLI uses the GMU account, but current on-demand settings require that account's browser login; an older personal-account check is insufficient. Codex auto-reload was off. Recheck settings/account at activation; local caps do not establish provider percentages.

The owner chose Luna and Sol at **high** effort. The dormant configuration initially mapped those families to `gpt-6-luna` and `gpt-6.1-sol`. On October 17 the installed subscription CLI rejected GPT-6 Luna before producing research. Its metadata-only `model/list` returned `gpt-5.6-luna` and `gpt-5.6-sol`, both supporting high effort; the example and bounded private campaign now use those actual available versions. Do not assume the desktop picker, API catalog and CLI account expose identical models. Preserve the rejected attempt and charged local reservation. Existing routing normally chooses another eligible provider for independent review; a fresh same-provider reviewer is allowed when it is the only eligible provider. Claude `sonnet` and Cursor `composer-2.5` remain provisional. Verify aliases, included-only billing and the correct account before enabling them. Only Codex receives the configured reasoning-effort flag. Recheck compatibility after relevant changes; no CLI upgrade/install was performed.

Quality worker schemas now bind business/job identity and each source URL, inspection date and checksum to the retained snapshots. This addresses a live Luna response that copied an opaque checksum incorrectly and was safely rejected before qualification. Runtime evidence validation remains independent and historical saved formats remain readable; no failed report is silently corrected or accepted.

The October 17 connected run also exposed two review-transport mismatches: Codex strict output requires the phone key even when its value is empty, and a direct review result has `verdict`/`decision` rather than a top-level research `schema_version`. Both boundaries are covered by regressions. Historical reviews without phone remain readable. The retained valid Sol review was revalidated and settled without another model call. One food/beverage business completed nine observations, five journey checks and independent review, then entered the paused production workspace with a verified public phone/email. Six research reservations remain charged, including rejected calls; this single assisted run does not establish weekly capacity.

## Executable verification and operation

From `pipeline`, the account-free recipe is:

```powershell
npm run check
npm test
# Focused controller/protocol/CLI fixtures, if investigating a changed boundary:
node --test controller.test.mjs usage.test.mjs
```

Executed October 15, 2026: syntax and **87 account-free tests passed**, including 27 new controller/protocol/CLI checks. Tests create fictional state in new OS temporary directories, substitute Google transport/provider inference and use no account credentials or live queue. They run actual local intake, checkpoint/report persistence, review validation, qualification, locking and CLI init/status/disabled-run code. Provider subprocess stopping is substituted; existing tests additionally cover the runner's control boundaries. The Windows priority test exposed and verifies the bounded atomic-replacement retry used when a monitor briefly has a file open. Test fixtures/receipts remain private temporary files, never committed prospect data. There is no application browser UI to inspect in this increment.

To prepare **dormant** files later in the intended private state root:

```powershell
$env:STUDIO_STATE_DIR = 'C:\private\studio-pipeline-proof'
node controller-cli.mjs init
node controller-cli.mjs status
node controller-cli.mjs run --once  # Disabled defaults: local status only.
```

`init` refuses to overwrite either file. Preserve/reconcile a partial initialization rather than deleting an existing ledger or configuration. Disabled/empty/blocked configurations do not load Google credentials or invoke providers. `status` reports saved policy/state; it is not a live authentication/allowance health check.

For activation, verify the actual CLI model selections, filtered subscription authentication, Codex metadata reader and included-only billing; settle call budgets; name only approved fresh job IDs and the existing Google config; leave old samples alone. Make the control `enabled: true, priority: research` only for that approved scope. `run --once` checks those IDs once; `run` waits/rechecks within its bounded window. Those commands install no recurring schedule. The separately approved Studio Operations host can supervise them through its private opt-in; use one dispatcher, never a concurrent manual controller.

For website/client priority, set `priority` to `website` or `client`, or set `enabled` false. Use an atomic file replacement (the existing `saveJson` helper) for programmatic edits; an incomplete manual save safely blocks. The monitor aborts its own worker and waits for exit; already in-flight Google operations may finish before shutdown. Ctrl+C also stops the controller's own work. After restoring research priority/Ready and allowance, rerun the same controller; a deferred job resumes from its evidence/checkpoint without charging a failure recovery. Known timeouts, output-contract errors and quota errors permit at most one handoff; other failures do not.

Read the consolidated summary instead of opening every worker chat. A Held exception gives a code and next action; private attempts contain diagnostic detail. Inspect the exact reservation, attempt, hashes, child exit and failed write before reconciliation. Held infrastructure jobs do not rerun automatically. A completed accepted Hold/Pass is a reviewed business outcome, distinct from an infrastructure Held job. New commercial evidence should use a new dated/recheck job.

Hard-crash/stale-lock recovery is manual: confirm recorded controller and child processes stopped, reconcile uncertain Google writes and preserve the ledger/evidence before removing only the confirmed stale locks. Never kill an unrelated PID or auto-adopt a foreign attempt. Existing job bundles do not include the new root controller ledger/config; full-controller backup/restore and machine restart supervision remain separate stages. Preserve those protected files separately before any migration.

Rollback: disable research, stop the controller we started, retain the private ledger/reviews/evidence and return to the prior reviewed runner revision. Legacy commands bypass controller budgets, so use them only as explicit reconciled operations after the controller has stopped. Do not overwrite historical rows or reset usage counters. No queue schema migration is required by this increment.

Current supply gate: the owner authorized food/beverage research and a bounded SOSA discovery pass. That pass screened 74 distinct businesses, staged three partial-source packets and held most others for current activity/contact verification. Only one separately researched business is staged in production so far. Browser capture, independent qualification and measured throughput remain work; paused packets and screened businesses are not call-ready counts. New source work follows the owner's current scope, not authorization inferred from this document.
