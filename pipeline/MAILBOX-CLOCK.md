# Automatic mailbox intake

`shared-mailbox-clock-v1` extends the existing mailbox review and proposal workspace with scheduled read-only intake. Existing capabilities remain unscheduled. The same canonical workspace retains records, manual call outcomes, ownership, PDFs, tasks and exact draft approvals. The worker never classifies messages, assigns new responsibility, generates proposals or sends mail.

The immutable `mailbox_clock` policy binds the published desk deployment, cadence, recovery generation, expiry, at most three reads per tick, a daily read ceiling and a deadline no longer than 25 seconds. Either signed operator can pause or resume. Initial state is paused and has no allowance. A separate reviewed allowance records included-usage evidence, expiry and a finite total read budget. Failed and uncertain reserved reads consume that budget. This is a finite authorization, not a live meter or proof of a percentage usage reserve; unknown hosting allowance remains a release hold.

Every invocation claims the current schedule slot conditionally, then reserves each provider read before making it. The saved tick and monotonic fence prevent duplicates and concurrent ticks from repeating a reserved read. A late provider response cannot commit after pause, allowance replacement, deadline, policy change or a later tick. Observation/failure and step settlement share one conditional write and independent replay. Lost acknowledgements reconcile only the exact saved envelope. An unresolved read stays charged; the next scheduled slot resumes the durable Gmail cursor instead of restarting bootstrap. Expired Gmail history requires explicit recovery.

## Hosting

Netlify schedules run on published deployments, not deploy previews, and have a 30-second execution limit. Keep the operations project protected; the public studio and API-only proposal gateway do not receive Gmail credentials. A new published deployment needs its exact manifest and Google grant binding reconciled deliberately. Existing protected previews are retained until cutover is verified.

The build emits a scheduled function only with `CONTEXT=production`, `EVZ_MAILBOX_CLOCK_BUILD=shared-mailbox-clock-v1` and an allowed `EVZ_MAILBOX_CLOCK_INTERVAL_MINUTES` of 5, 15, 30 or 60. The runtime additionally requires `EVZ_MAILBOX_CLOCK_RUNTIME=shared-mailbox-clock-v1`, the exact manual binding and trusted published Netlify context. Default and preview builds emit only a disabled response. Build/runtime cadence must match the saved policy. Creating source or deploying a preview activates nothing.

Measure actual store/provider latency and included Netlify usage before choosing a production cadence. The current workspace is roughly 12 MB; repeated whole-workspace reads and writes are material. The finite fictional proof cannot establish sustained affordability or 100-business/day capacity. A paused scheduler still incurs invocation/validation work, so disabling its build/runtime is the operational stop for hosting usage.

The host validates one canonical envelope before returning a paused/expired hold. An active invocation retains fresh conditional guards. Instrumented empty-history fixtures require 13 workspace reads and three writes; paused/expired invocations require one read, and duplicates four. These counts measure internal storage operations, not billable bandwidth. A finite provider-read allowance does not bound scheduled hosting overhead. The first hosted proof must use one total read and disable its schedule after readback.

## Verification

Run `node --test mailbox-clock.test.mjs mailbox-clock-host.test.mjs mailbox-intake.test.mjs mailbox-work-service.test.mjs shared-manual-records.test.mjs` from `pipeline`, then syntax/build checks and required CI. Integration tests retain actual conditional storage/replay and Gmail transport, substituting only the network/token boundary. They exercise duplicate ticks, late responses, pause during a read, exact lost-ack reconciliation, old-profile denial and default-disabled builds.

Browser recipe: use an isolated fictional clock workspace; inspect Setup, save a finite reviewed budget, resume, invoke one synthetic provider tick, reload the completed check and budget count, then pause as the other operator. Inspect desktop and narrow layout. No real mailbox or sending is involved in this fixture.

Before unattended acceptance, publish the protected fictional profile, observe a real scheduled tick with browser tabs closed, and read back its durable cursor and counters. Then measure a finite real-mailbox run. Actual computer-off and Eugene's independent identity checks remain separately deferred. Notification delivery and commercial sending are separate capabilities and release gates. Rollback disables the scheduler and runtime; preserve the canonical workspace and charged read history.

Primary reference: [Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/), checked November 1, 2026.
