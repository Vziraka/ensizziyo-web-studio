# Launch tasks

## Setup
- [x] Consolidate website audience, offer hypothesis, design direction, and verification criteria.
- [x] Create and verify private GitHub remote.
- [x] Create Drive workspace and publish business operating plan.
- [x] Create native Google Sheets prospect tracker and verify it.

## Website milestones

Current next task is W1. No website implementation has started. The commercial launch work below can progress alongside design; the final brand/domain does not block a prototype.

| ID | Deliverable | Depends on | Complete when |
| --- | --- | --- | --- |
| W1 | Homepage message and two interactive design directions | Existing brief | Realistic draft copy explains audience, offer, and next step. Two structurally different hero/supporting-section layouts and stubbed inquiry interactions run in a preview. Desktop/mobile evidence, tradeoffs, and a recommendation are presented. |
| W2 | Record selected direction and production approach | W1 and Ensizziyo's design choice | Brief/task records the chosen direction, rationale, experiment reference, and production acceptance checks. Stack, editing needs, inquiry destination, and relevant costs are resolved or clearly assigned as blockers. |
| W3 | Build the selected studio page and inquiry journey | W2 | Page content and responsive layout work; invalid submissions show useful errors, valid ones reach the designated test destination, and delivery failures do not show false success. Relevant tests, CI, and an executed runtime verification recipe exist. |
| W4 | Add the concept demonstration and complete launch review | W3 | Demonstration is reviewable; BRIEF.md acceptance criteria pass, open limitations are recorded, and hosting ownership, cost, and rollback are documented. Deployment/domain actions follow their separate authorization. |

Mark milestones complete only with their evidence linked from the task or PR. Break implementation into smaller complete behaviors as needed under WORKFLOW.md.

## Commercial launch work

The [operating plan](https://docs.google.com/document/d/1VpdPBWCjokoTHm3mSw9ytVTJEUjIODgyX3Rs4lPP6Ws/edit) owns the detailed commercial milestones and business decisions. This table tracks their launch dependencies; W1-W4 above own website implementation and verification. Prospect and outreach evidence belongs in the [live tracker](https://docs.google.com/spreadsheets/d/1QKorp30lNPe9Pww1OUoZ27OQohiIDg9VaJefJJMu0Xg/edit).

The studio's agreed service areas are websites and landing pages, business systems and integrations, practical automation and AI, and marketing support. The internal system covers research through sales, onboarding, delivery tracking and ongoing support, built in stages. Decide tools, connections, costs and upkeep in A1 before implementation, then verify the S1 research-to-tracker foundation before C2. The first research hypothesis is independent residential cleaners serving Fairfax, Centreville and Chantilly; confirm or change it from the sample in C2. Match the proposed improvement to a verified observation and an owner conversation. Research qualification does not establish budget, urgency, revenue or willingness to buy.

| ID | Milestone | Depends on for completion | Complete when |
| --- | --- | --- | --- |
| C1 | Agree first offer and capacity | Completed interview in the operating plan | A decision brief records the problem-led offer across all four services, total weekly capacity, automation responsibilities, outreach channel, sending mode and launch date or readiness trigger, with public claims supported by reviewed evidence. |
| A1 | Decide system architecture and upkeep | C1 and current tool inventory | Tool roles, connection layer, record ownership, costs, automation boundaries, owner accounts, access checks and upkeep/recovery responsibilities are recorded and accepted before implementation. |
| C2 | Validate customer/problem hypothesis | A1 and verified S1 foundation | Ten businesses run through the connected research workflow with dated sources, exact observations, possible effects, questions and public contact routes in Sheets; Ensizziyo records the pilot category and rationale. |
| C3 | Prepare starter offer and sales kit | C1 and C2 | A one-page offer, discovery questions and proposal outline define scope, exclusions, inputs, revisions, timing, payment milestones, acceptance, handover, support and running costs for the relevant improvement. |
| C4 | Make studio and supporting proof ready | W4 and C3 for final service claims | Website review evidence and relevant labelled demonstrations support the offer; public identity/contact, hosting ownership, costs and launch/rollback instructions are resolved. |
| C5 | Build the customer lifecycle system in stages | A1 and S1-S3; C2/C3 inform targeting and rules | The connected system demonstrates research, automatic outreach and reply handling, sales/onboarding, delivery tracking and support using controlled records. Sheets holds 20 sourced research-qualified prospects and five personalized drafts. Contracts, running costs, upkeep/recovery instructions and executed verification are recorded. |
| C6 | Run and review outreach pilot | C3, C4 and C5 | Five initial messages use the agreed channel and sending mode; actual outcomes, owner-confirmed needs, next actions and a short learning review are recorded before expanding. |
| C7 | Deliver a client project and assess repeatability | C6 and an actual suitable engagement | A project has agreed scope/payment milestones, accepted verification and handover, support terms and accurate cash records; delivery effort, costs and feedback inform the next cycle. This is conditional on winning work. |

Current checkpoint (October 13, 2026): C1 is complete. Ensizziyo selected the full customer lifecycle in stages and wants tool connections, costs and upkeep settled before building or starting C2. A1 is in progress. The recommended research connection route is a Dot using the existing Google Drive plugin for queue priorities and review, plus one local Node.js runner using the Google Sheets API to dispatch Cursor, Claude and Codex. One primary worker runs each job; Grok Bot is optional. The runner owns execution status and accepted result writes. This is a design recommendation, not a deployed system; owner acceptance, account access and controlled handoffs remain to verify.

The later operating target is 200+ new businesses per week, each receiving a detailed, source-backed problem/solution assessment. A shared job/output contract, source-quality checks, preserved checkpoints and per-worker capacity/usage evidence must support that requirement. Installed CLI version/help checks succeeded for Cursor, Claude and Codex; authenticated research, record access and dispatch have not been demonstrated. Dot conversations not counting toward ChatGPT limits does not establish unlimited delegated Work/Codex capacity. Account-specific usage snapshots and official source links stay in the operating plan.

The user-installed Apollo connector passed profile, sending-mailbox-list and existing-sequence reads. It returned no linked sending mailbox and two inactive sequences; no writes or sends were tested. All four services, 40 total weekly hours, email primary/social secondary and automatic sending/follow-ups within agreed rules remain confirmed. The additional monthly spending ceiling is $200, excluding existing subscriptions. C4 continues separately; S1-S3 and C2/C3/C5-C7 remain planned. Launch still waits for the tested system and ready studio website/inquiry route. Mark completion only with evidence from the authoritative plan, tracker or reviewed website change.

Choose the public business name and check domain availability as part of C4; purchase and deployment retain separate authorization. Continue prototypes under the working name. Pricing remains a scope-dependent hypothesis, with each service and ongoing cost assessed separately. Design automation from the outset. Define the outreach rules in C3/C5 and verify automatic email sending, follow-ups and reply handling before the selected launch trigger; verify supported social operations before adding that secondary route. Per-message or per-batch approval is not the chosen operating model. This planning update activates no sends, and C4/C5 remain launch dependencies.

## System build stages

The operating plan owns tool roles, cost assumptions and upkeep details. These are implementation checkpoints after A1, not completed software.

| ID | Depends on | Complete when |
| --- | --- | --- |
| S1 | A1 | A controlled research-to-tracker run verifies evidence/dates, IDs, duplicate and missing-data handling, retry recovery, logs and a health check before the C2 sample. |
| S2 | S1, C2 and C3 | Controlled tests demonstrate automatic outreach, reply/decline stops, discovery/proposal state, agreement/invoice/payment evidence and onboarding, with selected providers and no duplicate sends. |
| S3 | S2 | A fictional project demonstrates service-appropriate tasks, materials, review/revision/acceptance, handover and a support request through closure; upkeep, backup/restore and pause/recovery instructions are verified. |

Code and tests belong in Git; operational prospect/client records and snapshots stay in their private systems. Apollo owns prospecting email execution; other tools must not run duplicate outbound sequences. The system records commercial/client decisions and authoritative payment evidence rather than inventing approvals or payment success.

Confirmed account sequence: prove a small controlled flow with the existing personal Gmail, then establish the business domain/account before live automation. The production target is one Google Workspace Business Starter user, initially on flexible monthly billing; actual domain/address, checkout terms and purchase remain unresolved. Keep owner addresses and file IDs in configuration. Verify the migration/copy route, permissions and links; recreate and authorize any production triggers under their intended owner and disable test jobs before cutover. A different public sending address does not require moving every existing software subscription.

Recommended connection contract: Dot writes job inputs, requested worker and priority through the Google Drive plugin; a single local runner polls Sheets, validates ready work, reserves a job, invokes an installed CLI and validates/upserts its result by stable job and attempt IDs. Workers return research to the runner and do not need separate Google record credentials. Use a dedicated Google service account with access only to the required spreadsheet, subject to sharing-policy verification; keep its credential outside Git and worker prompts. Node.js v24.13.0 is installed. Windows Task Scheduler would supervise this one runner, with an enforced single instance, bounded retries, private checkpoints and an explicit pause control. Start with one research job at a time and measure before increasing concurrency. No new runtime, schedule, credential or sharing permission has been activated.

The operating plan holds the detailed inputs/outputs, recovery, cost and upkeep proposal. A Dot's plugin access and scheduled coordination need their own verification; native Dot-to-Codex delegation is not a second path for the same queue jobs. Direct Dot research remains an option to test under the same reservation/output requirements. Verify each CLI's subscription authentication, public-source tools, output quality and usable capacity; plugin access in this chat does not automatically transfer to a CLI. Apps Script is deferred from this research route and remains an option only for a later demonstrated Google-workflow gap. Apollo native export does not establish complete reply sync or a tested Sheets-to-Apollo handoff; settle that S2 interface independently. Education offers remain unredeemed.

## Later expansion
- Optional care plan with bounded tasks and response times; support tracking is already part of S3.
- Evaluate custom systems individually. No speculative platform build.

## Open decisions that do not block setup
- A1 acceptance and access checks for the recommended Dot/Sheets/local-runner route; service-account sharing policy, credential storage and business-account cutover; per-worker authentication, research tools and capacity; Dot plugin/schedule permissions and direct/delegated usage; Apollo standalone API/write/reply access and sending-mailbox setup. Ensizziyo is the proposed account/operations owner; weekly review and monthly recovery/access checks still need acceptance. No pipeline runtime has been deployed by this proposal.
- Outreach targeting/message rules, cadence, volume, reply/decline handling, exceptions and payment/agreement providers (C3/S2); proposed weekly allocation remains adjustable.
- Public name/domain; pilot-category confirmation; final scope/payment terms; hosting and editability.
- Free Paper alternative link and whether a canvas improves the actual design workflow.
