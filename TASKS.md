# Launch tasks

## Setup
- [x] Consolidate website audience, offer hypothesis, design direction, and verification criteria.
- [x] Create and verify private GitHub remote.
- [x] Create Drive workspace and publish business operating plan.
- [x] Create native Google Sheets prospect tracker and verify it.

## Website milestones

W1 is complete for design review: [draft homepage copy, two interactive directions, evidence, and recommendation](prototypes/w1/README.md) on `feature/w1-design-prototypes`. Current next task is W2, awaiting Ensizziyo's design choice. No production website implementation has started. The commercial launch work below can progress alongside design; the final brand/domain does not block a prototype.

| ID | Deliverable | Depends on | Complete when |
| --- | --- | --- | --- |
| W1 | Homepage message and two interactive design directions | Existing brief | Realistic draft copy explains audience, offer, and next step. Two structurally different hero/supporting-section layouts and stubbed inquiry interactions run in a preview. Desktop/mobile evidence, tradeoffs, and a recommendation are presented. |
| W2 | Record selected direction and production approach | W1 and Ensizziyo's design choice | Brief/task records the chosen direction, rationale, experiment reference, and production acceptance checks. Stack, editing needs, inquiry destination, and relevant costs are resolved or clearly assigned as blockers. |
| W3 | Build the selected studio page and inquiry journey | W2 | Page content and responsive layout work; invalid submissions show useful errors, valid ones reach the designated test destination, and delivery failures do not show false success. Relevant tests, CI, and an executed runtime verification recipe exist. |
| W4 | Add the concept demonstration and complete launch review | W3 | Demonstration is reviewable; BRIEF.md acceptance criteria pass, open limitations are recorded, and hosting ownership, cost, and rollback are documented. Deployment/domain actions follow their separate authorization. |

Mark milestones complete only with their evidence linked from the task or PR. Break implementation into smaller complete behaviors as needed under WORKFLOW.md.

### W1 review checkpoint — October 12, 2026

- [x] Draft realistic homepage copy covering the audience, offer, next step, concept, process, founder introduction, FAQ, and agency route.
- [x] Build two structurally different, isolated browser prototypes with simulated inquiries: A, service-first editorial split with a short modal; B, example-first panorama with a guided inline brief.
- [x] Inspect desktop/mobile layouts and drive the interactions; retain screenshots and verification limits in the [experiment record](prototypes/w1/README.md#verification-evidence).
- [x] Present the tradeoffs and recommendation: A is the proposed fit for the first local-business audience; this is not a selected direction or a conversion result.
- [ ] Ensizziyo chooses A, B, or a specified combination. Record that decision in W2 before production implementation.

Experiment branch is for preservation and review, not a production merge. W2 still needs the actual design choice, stack/editing decisions, inquiry destination, and relevant ownership/cost decisions. Do not assume a production destination or send real inquiries from this experiment.

## Commercial launch work
1. Choose the first service-business category by reviewing a small sample of local businesses and their inquiry journeys. Capture observed problems, not assumptions about revenue.
2. Finalize a one-page starter offer: deliverables, exclusions, revisions, timeline, payment milestones, client inputs, handover, and optional care. Price remains a hypothesis until scope is set.
3. Choose public business name and check domain availability; purchase only with explicit authorization. Continue prototypes under the internal working name.
4. Research an initial 20 qualified prospects in Sheets while the site is built. Draft a small personalized batch for Ensizziyo to review and send.
5. Prepare discovery questions and a concise proposal template before calls. Set delivery capacity before accepting simultaneous work.
6. After website launch review, track sent messages, replies, qualified conversations, proposals, wins, and cash received separately.

## Later, after a repeatable manual process
- Optional care plan with bounded tasks and response times.
- Automate record updates, research drafts, and follow-up reminders.
- Consider a Dot only when its input, schedule, output, and permissions are clear.
- Evaluate custom systems individually. No speculative platform build.

## Open decisions that do not block setup
- Public name/domain; first prospect niche; final scope/payment terms; hosting and editability.
- Free Paper alternative link and whether a canvas improves the actual design workflow.
