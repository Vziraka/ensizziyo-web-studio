# Subscription research controller

This increment implements the controller in three dependent stages, verified with fictional records and substituted external boundaries. It is **disabled by default**. No business sample, provider inference, live Google write, schedule, purchase or account-setting change was run for this build. It does not establish weekly capacity or production readiness.

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

For Codex, `usage.mjs` starts a metadata-only stdio app-server connection: initialization, `account/read`, `account/rateLimits/read`, then closes it. It starts no thread or turn. All returned buckets/windows must be current, authenticated by ChatGPT, and above the configured reserve. Unknown/stale/low metadata defers the job without a model call. The installed 0.148.0 help supports app-server stdio/config/feature flags; its app-server does **not** accept `--ignore-user-config`. The reader restricts features explicitly. Its live account protocol was not executed during this build. See the official [account and allowance protocol](https://learn.chatgpt.com/docs/app-server).

Claude and Cursor currently have **local call caps**, not verified live percentage readers. Their configured `reserve_percent` does not provide an account-level guard. Your other chats and website/client work consume shared subscription capacity outside this ledger, and a call's token cost varies. Stop research or reduce its cap when needed. A recognized quota error blocks that provider across restarts. After inspecting the actual account allowance/reset and included-only settings, record a later current UTC timestamp for that provider in `quota_resumes`; changing the date does not refund calls.

All providers remain disabled until `included_usage_only_confirmed` and `enabled` are deliberately set after checking authentication and billing. This flag records an operator check; it cannot disable account overage. In the audit, Claude usage credits were enabled with a $0 balance and $100 cap, so its example confirmation must remain false until the included-only route/settings are verified. Cursor on-demand was off; Codex auto-reload was off. These observations need a current check at activation. Nothing in this build changes them.

The owner approved the Codex selections on October 15, 2026: `gpt-6-luna` with **high** effort for collection/assessment and `gpt-6.1-sol` with **high** effort for review/repair when Codex handles those stages. These are saved in the disabled example configuration. Existing provider routing normally chooses another eligible provider for independent review. Claude `sonnet` and Cursor `composer-2.5` remain provisional selections. `sonnet` is a provider alias; verify its resolved version on the installed CLI before activation. Only Codex receives the configured reasoning-effort flag. Approval chooses the settings; live model compatibility, quality and allowance consumption remain to verify. Record observed versions/model behavior and recheck after relevant updates; no CLI upgrade/install was performed.

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

Activation is **not part of this build**. Before a separately agreed controlled run: verify the actual CLI model selections, filtered subscription authentication, Codex metadata reader and included-only billing; settle small call budgets; name only new fictional/test job IDs and the existing Google config; leave old samples alone. Make the control `enabled: true, priority: research` only for that approved scope. `run --once` checks those IDs once; `run` waits/rechecks within its bounded window. Neither installs restart supervision or a recurring schedule.

For website/client priority, set `priority` to `website` or `client`, or set `enabled` false. Use an atomic file replacement (the existing `saveJson` helper) for programmatic edits; an incomplete manual save safely blocks. The monitor aborts its own worker and waits for exit; already in-flight Google operations may finish before shutdown. Ctrl+C also stops the controller's own work. After restoring research priority/Ready and allowance, rerun the same controller; a deferred job resumes from its evidence/checkpoint without charging a failure recovery. Known timeouts, output-contract errors and quota errors permit at most one handoff; other failures do not.

Read the consolidated summary instead of opening every worker chat. A Held exception gives a code and next action; private attempts contain diagnostic detail. Inspect the exact reservation, attempt, hashes, child exit and failed write before reconciliation. Held infrastructure jobs do not rerun automatically. A completed accepted Hold/Pass is a reviewed business outcome, distinct from an infrastructure Held job. New commercial evidence should use a new dated/recheck job.

Hard-crash/stale-lock recovery is manual: confirm recorded controller and child processes stopped, reconcile uncertain Google writes and preserve the ledger/evidence before removing only the confirmed stale locks. Never kill an unrelated PID or auto-adopt a foreign attempt. Existing job bundles do not include the new root controller ledger/config; full-controller backup/restore and machine restart supervision remain separate stages. Preserve those protected files separately before any migration.

Rollback: disable research, stop the controller we started, retain the private ledger/reviews/evidence and return to the prior reviewed runner revision. Legacy commands bypass controller budgets, so use them only as explicit reconciled operations after the controller has stopped. Do not overwrite historical rows or reset usage counters. No queue schema migration is required by this increment.

Next acceptance gate: validate the new integrations on fictional records with an expressly bounded subscription allowance, then decide supervision and measured throughput. **No new business sample is authorized by these instructions.**
