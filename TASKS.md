# Launch tasks

## Setup
- [x] Consolidate website audience, offer hypothesis, design direction, and verification criteria.
- [x] Create and verify private GitHub remote.
- [x] Create Drive workspace and publish business operating plan.
- [x] Create native Google Sheets prospect tracker and verify it.

## Website milestones

W1 round two is ready for design review: [eight original studio previews, desktop/mobile evidence, tradeoffs, and recommendation](prototypes/w1/round-2/README.md) on `feature/w1-design-prototypes`. The first A/B comparison remains historical evidence. W2 awaits Ensizziyo's actual design choice from the new round. No production website implementation has started. The commercial launch work below can progress alongside design; the final brand/domain does not block a prototype.

| ID | Deliverable | Depends on | Complete when |
| --- | --- | --- | --- |
| W1 | Homepage message and interactive design exploration | Existing brief and annotated feedback | First A/B comparison is preserved. Eight original round-two previews use direct service headings covering all four service areas, concrete business problems, separate page navigation, labelled concept studies and a simulated improvement-led inquiry. Desktop/mobile evidence, tradeoffs and a recommendation are presented. |
| W2 | Record selected direction and production approach | W1 and Ensizziyo's design choice | Brief/task records the chosen direction, rationale, experiment reference, and production acceptance checks. Stack, editing needs, inquiry destination, and relevant costs are resolved or clearly assigned as blockers. |
| W3 | Build the selected studio site and inquiry journey | W2 | Homepage, About, Services, Work and inquiry content and responsive layouts work; invalid submissions show useful errors, valid ones reach the designated test destination, and delivery failures do not show false success. Relevant tests, CI, and an executed runtime verification recipe exist. |
| W4 | Add the concept demonstration and complete launch review | W3 | Demonstration is reviewable; BRIEF.md acceptance criteria pass, open limitations are recorded, and hosting ownership, cost, and rollback are documented. Deployment/domain actions follow their separate authorization. |

Mark milestones complete only with their evidence linked from the task or PR. Break implementation into smaller complete behaviors as needed under WORKFLOW.md.

### W1 review checkpoint — October 12, 2026

- [x] Draft realistic homepage copy covering the audience, offer, next step, concept, process, founder introduction, FAQ, and agency route.
- [x] Build two structurally different, isolated browser prototypes with simulated inquiries: A, service-first editorial split with a short modal; B, example-first panorama with a guided inline brief.
- [x] Inspect desktop/mobile layouts and drive the interactions; retain screenshots and verification limits in the [experiment record](prototypes/w1/README.md#verification-evidence).
- [x] Present the tradeoffs and recommendation: A is the proposed fit for the first local-business audience; this is not a selected direction or a conversion result.
- [ ] Ensizziyo selects a direction or specified combination. The request for a new round supersedes the initial A recommendation; it is not a selection.

Experiment branch is for preservation and review, not a production merge. W2 still needs the actual design choice, stack/editing decisions, inquiry destination, and relevant ownership/cost decisions. Do not assume a production destination or send real inquiries from this experiment.

### W1 second-round checkpoint — October 12, 2026

- [x] Present the approach before building; confirm the user wants original studio previews rather than existing commercial templates.
- [x] Read and visually inspect NexStudio and consult relevant prototype/motion guidance through TOOLKIT.md without installation.
- [x] Build eight structures: Studio, Focus, Index, Gallery, Frame, Ledger, Surface, and Common. Use direct headings, sans-serif type, About/Services/Work page views, Explore work/Let's talk actions, and restrained interaction/depth.
- [x] Add three original, interactive design studies. Reviews remain a clearly marked placement; no client metrics, rating or testimonial is invented.
- [x] Check all eight homepages at 1440, 768, 390 and 320 CSS pixels; inspect supporting page families, navigation/history, filters, project controls, invalid/valid inquiries and keyboard focus. Evidence and limitations are in the round-two record.
- [x] Recommend Studio for the clearest service hierarchy, with Surface's interactive work presentation as a possible combination.
- [ ] Record Ensizziyo's choice in W2 before production work.

### W1 positioning revision — October 12, 2026

Requested outcome: broaden the same eight premium previews to websites and landing pages, business systems and integrations, practical automation and AI, and marketing support. Keep About, Services and Work as separate page views. No visual direction is selected by this content revision.

- [x] Align every homepage, About, Services, Work and inquiry with the broader positioning and concrete owner problems.
- [x] Make Let's talk the primary action; ask what the owner wants to improve without requiring a technical brief or chosen service.
- [x] Clearly label concept work and distinguish local interface demonstrations from proposed integration, automation and AI scope. Retain unapproved review placements; invent no results or delivery claims.
- [x] Refresh all eight desktop/mobile comparison captures; inspect the expanded content, navigation and inquiry validation on desktop and mobile. The [experiment record](prototypes/w1/round-2/README.md#executed-verification--positioning-revision) records 32 homepage checks, 88 supporting-page layouts and the inquiry journey.
- [x] Record separate requirements/engineering reviews and update the existing [draft PR #3](https://github.com/Vziraka/ensizziyo-web-studio/pull/3). Production remains unstarted pending the design choice.

## Commercial launch work

The [operating plan](https://docs.google.com/document/d/1VpdPBWCjokoTHm3mSw9ytVTJEUjIODgyX3Rs4lPP6Ws/edit) owns the detailed commercial milestones and business decisions. This table tracks their launch dependencies; W1-W4 above own website implementation and verification. Prospect and outreach evidence belongs in the [live tracker](https://docs.google.com/spreadsheets/d/1QKorp30lNPe9Pww1OUoZ27OQohiIDg9VaJefJJMu0Xg/edit).

The studio's agreed service areas are websites and landing pages, business systems and integrations, practical automation and AI, and marketing support. The first research hypothesis is independent residential cleaners serving Fairfax, Centreville and Chantilly; confirm or change it from the sample in C2. Match the proposed improvement to a verified observation and an owner conversation. Research qualification does not establish budget, urgency, revenue or willingness to buy.

| ID | Milestone | Depends on for completion | Complete when |
| --- | --- | --- | --- |
| C1 | Agree first offer and capacity | Current interview | First paid-project emphasis, weekly capacity, outreach channel and target start date are recorded, with demonstrated services distinguished from work requiring assessment or a pilot. |
| C2 | Validate customer/problem hypothesis | Existing audience brief | Ten businesses have dated sources, exact observations, possible effects, questions and public contact routes in Sheets; Ensizziyo records the pilot category and rationale. |
| C3 | Prepare starter offer and sales kit | C1 and C2 | A one-page offer, discovery questions and proposal outline define scope, exclusions, inputs, revisions, timing, payment milestones, acceptance, handover, support and running costs for the relevant improvement. |
| C4 | Make studio and supporting proof ready | W4 and C3 for final service claims | Website review evidence and relevant labelled demonstrations support the offer; public identity/contact, hosting ownership, costs and launch/rollback instructions are resolved. |
| C5 | Build researched pipeline and drafts | C2 for research; C3 for final drafts | Sheets holds 20 deduplicated research-qualified businesses with evidence and next actions, plus five personalized drafts for Ensizziyo's review. |
| C6 | Run and review outreach pilot | C3, C4 and C5 | Ensizziyo reviews and sends five initial messages; actual outcomes, owner-confirmed needs, next actions and a short learning review are recorded before expanding. |
| C7 | Deliver a client project and assess repeatability | C6 and an actual suitable engagement | A project has agreed scope/payment milestones, accepted verification and handover, support terms and accurate cash records; delivery effort, costs and feedback inform the next cycle. This is conditional on winning work. |

Current planning checkpoint (October 12, 2026): C1 is in progress; C4 is in progress through the separate website design work. C2, C3 and C5-C7 are planned. No commercial milestone is complete. C1, C2 and website design can progress in parallel; dates await the capacity and outreach interview. Mark completion only with evidence from the authoritative plan, tracker or reviewed website change.

Choose the public business name and check domain availability as part of C4; purchase and deployment retain separate authorization. Continue prototypes under the working name. Pricing remains a scope-dependent hypothesis, with each service and ongoing cost assessed separately. Ensizziyo reviews and sends initial outreach; this plan does not activate automated sending.

## Later, after a repeatable manual process
- Optional care plan with bounded tasks and response times.
- Automate record updates, research drafts, and follow-up reminders.
- Consider a Dot only when its input, schedule, output, and permissions are clear.
- Evaluate custom systems individually. No speculative platform build.

## Open decisions that do not block setup
- First paid-project emphasis, weekly capacity, outreach channel and target start date (current interview).
- Public name/domain; pilot-category confirmation; final scope/payment terms; hosting and editability.
- Free Paper alternative link and whether a canvas improves the actual design workflow.
