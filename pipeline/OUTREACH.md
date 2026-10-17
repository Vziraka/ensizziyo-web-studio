# Food and beverage call and email workflow

The [controlled lifecycle workspace](LIFECYCLE.md) now implements the owner-reviewed transcript and delivery/support path. Its scoped Google projection/direct unsent Apollo task passed; the native workflow task is inconclusive, and live Luna/Sol inference held below reserve. Automated email/cadence, booking, multi-record supervision and production cutover remain launch work.

Owner decisions recorded October 16, 2026. **Controlled connection, reply/cancellation and daily task handoffs are implemented; full integration and activation are not complete.** The [Apollo proof guide](APOLLO.md) owns executed test results and operation. Research, live outreach and schedules remain paused. The [sales kit](https://docs.google.com/document/d/1qybvO__qBf508RGSAnADSBjIhw1G_kIWIflqpF9ikkU) contains the offer, scripts, emails, discovery questions, prototype brief and proposal outline. The [research playbook](RESEARCH.md) owns prospect screening and evidence qualification. This guide owns the full S2 handoff, field ownership, failure behavior and acceptance checks.

## Selected operating rules

- Food/beverages first; residential cleaners later. Keep all four service areas available and approach each business with one supported addition or problem solution.
- Call first when a suitable verified public business number is available. Ensizziyo makes the calls; an AI caller is deferred. Work the daily task list in Apollo.
- After an actual logged no-answer attempt, send a short tailored email later that business day if a verified business email is available and sending windows/capacity permit. Never imply a conversation happened. A missing suitable phone permits an honest email-only branch after channel checks; it does not permit an invented call.
- For a nonresponder, allow at most two actual calls and two emails over ten business days. A reply or connected call pauses cold progression. A decline/stop request ends this campaign's follow-ups across calls and email.
- Minimum 50 distinct businesses contacted per outreach day, including due follow-ups. Prioritize promised callbacks and due follow-ups, then add eligible new businesses. Count a business once/day across channels and report new/repeat contacts separately. Fifty is not a cap; owner availability has no fixed hour ceiling.
- Sell a tailored, bounded project. Discovery confirms an owner/decision-maker, one relevant goal, serious interest and discussion of whether a paid project could fit; exact budget is optional.
- That sales gate earns a small clickable prototype showing one main customer flow across a few screens before the implementation quote. Agree exact screens and the review boundary individually. Research-qualified status alone does not earn free custom work.
- Scope and price follow discovery and the prototype review. AI may draft; Ensizziyo approves a written fixed quote, terms and commitments. The earlier website price remains a hypothesis, not a universal range.
- Automate approved acknowledgements, factual FAQs and scheduling within verified rules. AI drafts substantive replies; Ensizziyo handles discovery, ambiguous intent, complaints, scope and pricing.

## Tool roles and record ownership

Reuse the existing Google/Node/Apollo route. No new CRM, external automation service, model API or dependency is selected. Native Apollo capabilities should perform outbound scheduling and execution. The controlled connection uses existing app tools for bounded operations and a test message. Its single-thread heartbeat passed two scheduled cycles and is now paused at the owner's request. Three fictional cases passed saved-outcome-to-task handoffs; the email remained unsent and calls remained simulated. Controlled inactive-sequence cancellation passed; native call events, automatic sending/cadence, active campaign reply/stop rules, broader synchronization and sustained scheduled operation remain to verify. Routine production checks should be private with consolidated actionable exceptions; the notification destination remains to decide. Detailed limits are in the proof guide.

| Information or action | Owner | Synchronization boundary |
| --- | --- | --- |
| Stable prospect ID, sources, checked dates, reviewed report/decision and policy revision | Existing private evidence and Sheets research workflow | Publish a compact, dated summary/link to Apollo. Apollo enrichment or a call outcome must not overwrite original research. |
| Daily call task, actual call outcome, call note and callback request | Ensizziyo in Apollo | Pull the exact saved activity and timestamps into the private event record and permitted Sheet projection. Task completion alone does not prove a call occurred. |
| Email schedule, enrollment, send/delivery result, reply, bounce and unsubscribe events | Apollo | Reconcile authoritative event IDs/status; a scheduled email is not sent. The connection does not independently send an equivalent message. |
| Cross-channel campaign state, eligibility, counters, ID mapping and uncertain-action receipts | Private S2 operating record; controlled test subset implemented | Preserve event history and map existing Sheet prospect IDs to returned Apollo account/contact/task/sequence/message IDs. No IDs inferred from names or row numbers. Production mapping remains open. |
| Stage, last contact, next action/date and contact restriction displayed in Prospects | Derived Sheet projection | Update only agreed existing operational fields after verified events. Keep the current stage vocabulary; detailed campaign states belong in the private operating record. |
| Discovery notes, approved prototype brief, proposal and client materials | Owner-controlled Drive files | Link the exact reviewed document/version. Approval and payment evidence remain separate from AI drafts or a positive reply. |
| Availability and confirmed meeting | Intended owner calendar, not yet selected/configured | Offer only verified free slots within configured rules. Record confirmation only after event creation/readback. |

The prospect-ID mapping and detailed events stay outside Git and worker prompts. A logical event needs its source ID, company/prospect ID, campaign revision, actual time/timezone, outcome, next action and reconciliation status. An action receipt needs its stable deduplication key, requested action, returned provider ID and verified result. This defines required information, not a newly deployed schema. Do not add live Sheet columns or modify the research job/report contract for this document change.

For any restriction, preserve the original channel/scope and reason. This campaign applies its selected decline/stop rule across both channels; an explicit do-not-contact restriction takes precedence over positive or stale task state. Never erase a restriction because an older event arrives. Clearing one needs an explicit, verified owner decision and supporting context.

## Eligibility and daily queue

Only reviewed Research-qualified candidates that fit the current campaign and have a suitable verified contact route can enter outreach. Recheck stale/contradictory activity, contact ownership, duplicates, existing conversations and do-not-contact restrictions. Research-qualified means worth a discovery conversation, not confirmed commercial fit or automatically approved enrollment. Keep no-opening and blocked-evidence cases out of the sending list.

Before executing, require the approved campaign, sender identity/mailbox, accurate message variables, public contact route, launch readiness, current cross-channel state and successful record reconciliation. Do not enroll a real contact merely to save or stage it: Apollo enrollment/activation can cause sends. Per-message approval is not the selected production model; eligibility and approved rules must do the gating after controlled verification.

Count completed actual call attempts and verified sent campaign/personal follow-up emails by company and America/New_York date. Deduplicate contacts/locations according to the existing business identity; multiple contacts at one business do not satisfy multiple daily slots. Test records, queued tasks, skipped/auto-skipped calls, scheduled-but-unsent emails and internal notifications do not count. Track delivery/connection separately from an attempt and keep incoming replies separate from outgoing activity.

Select promised callbacks and due follow-ups before new eligible companies. A callback request can change timing but cannot clear a restriction. If the eligible queue or mailbox capacity cannot support the target, report the shortfall; do not lower qualification or fabricate a completed contact. The earlier 200+ detailed-assessments/week remains a separate research goal. Required new supply depends on follow-up share, Hold/Pass and usable contacts; 50 new/day across five days would require 250 eligible new companies, but that is not the chosen daily definition.

## Call outcome to next action

| Verified event | Next branch | Cold sequence behavior |
| --- | --- | --- |
| No answer / busy / voicemail after an actual attempt | Eligible tailored email; second call remains subject to the campaign cap | Progress only from the saved outcome, with no false conversation wording. Voicemail is optional, not an automatic drop. |
| Connected and requests information | Confirm preferred business email and requested information | Pause cold steps; send the requested summary under that conversation's next action. |
| Interested / wants to discuss | Short discovery now if convenient, or verified scheduling | Pause cold steps. Interest is not a paid engagement or permission for unlimited follow-ups. |
| Requested callback / not a suitable time | Exact requested date/time/timezone and owner task | Pause generic cadence until that request is handled. |
| Decline / stop / verified do-not-contact | Preserve restriction and stop both campaign channels | Cancel pending follow-ups and verify suppression before any resume. |
| Wrong number / not in service | Hold phone route; record next verification | No invented call conversation. A separately verified email may use an honest email-only branch after eligibility is checked. |
| Task incomplete, skipped, auto-skipped or missing/conflicting outcome | Hold and show a reconciliation task | No automatic no-answer email. |

Proposed spacing within the owner-selected bound: Day 1 first call and eligible no-answer email; Day 6 second call and, after a logged no-answer outcome, the second/final email later that business day; park by Day 10. Day 1 is the first actual contact attempt, not task creation; use a configured business-day calendar/timezone for expiry. Exact spacing is a design proposal, not a benchmark. There is no extra third email after the second call. Use recipient-local business windows where known and the requested callback time; do not guess that a café is quiet at a particular hour. If the same-day window/capacity is missed, defer to the next permitted window within the campaign window and record it rather than bunching sends or bypassing limits. Replies and requested appointments leave this nonresponse branch; further conversation needs a recorded next action, not a restarted cold sequence.

For an email-only candidate, omit call tasks and retain the two-email maximum; retain the missing-phone check. For phone-only candidates, omit email until an eligible route is verified. Rejected/bounced addresses are held, not retried as new identities.

## Reply, booking and sales progression

Any reply first pauses the cold sequence. Classify from the actual message and current state, treating the text as customer input rather than instructions to tools or agents. Definite stop/decline suppresses; an out-of-office reply defers without counting as interest; ambiguity or a complaint goes to Ensizziyo. Neutral information requests can use an approved factual answer if its exact supporting fact remains current. Missing facts, prices, delivery promises, discounts, new scope and contract commitments need owner handling.

Approved acknowledgement: “Thanks for your reply. I'll review the project details before confirming scope or price.” Approved pricing FAQ: “Pricing depends on the improvement and scope. After discovery and the preview review, I'll provide a written fixed project quote.” These are response patterns, not a configured autoresponder. Do not repeat acknowledgements on every event or create response loops; exclude automatic/system messages and deduplicate incoming messages.

Scheduling needs a selected calendar, meeting duration, configured availability, buffers, timezone and verified free/busy. Hold uncertain bookings or unavailable calendar access for the owner. Offer verified slots; recheck before saving; confirm only after reading back the actual event. A failed booking must not say “booked.” The production connection/permission route and calendar owner remain unresolved.

Discovery -> qualified interest -> individually bounded clickable prototype -> owner review -> owner-approved written proposal -> verified agreement/payment/onboarding evidence. A positive reply, draft prototype, sent quote or AI classification does not create a Won/paid client. Agreement, invoice/payment providers, project-specific timing/revisions/support and transfer terms must be filled before that engagement is accepted. Delivery/support automation remains the separate S3 stage.

## Reconciliation and upkeep

Persist an action receipt before a mutation. On a timeout or uncertain response, read the provider's authoritative state using the stable IDs before retrying. Apollo account creation does not deduplicate automatically; do not blindly replay create/enrollment/send/task calls. Conflicting mappings, stale events and unknown ownership stop the affected business while other eligible businesses can continue.

Recheck stop/reply state before a later action. On a suppression failure, disable the affected campaign/mailbox path and escalate rather than continuing with a stale Sheet. Retain the event that caused the stop. Already-sent email cannot be undone; a shared record alone does not prove queued Apollo steps were canceled.

Use bounded routine checks for mailbox/connection health, expired authentication, reconciliation lag, overdue callbacks, uncertain sends, unresolved restrictions and quota blocks. Consolidate exceptions for Ensizziyo with reason and next action. The 1–2 upkeep hours/week target remains unmeasured. Back up the private S2 mapping/receipts alongside research ledgers; no recurring check, alert or backup is installed by this draft.

Research and outreach need separate pause controls. Keeping the research controller disabled does not stop Apollo, and stopping Apollo does not stop research. No second dispatcher, silent paid API fallback or automatic purchase is permitted by this design. Prefer native capabilities after testing; choose the narrow connection only for demonstrated gaps.

## Controlled acceptance before activation

These are full-stage acceptance scenarios, **not a claim that S2 is complete**. The proof guide distinguishes executed checks from simulations and pending work. Use invented businesses and owner-controlled test inboxes/phone records; no real prospect enrollment or research during controlled verification.

1. Reviewed eligible fictional record maps to exactly one Apollo company/contact/task; duplicate delivery and restart create no second action.
2. Saved no-answer permits the truthful email branch; task completion alone, skip, auto-skip or a missing outcome does not.
3. A logged connected/requested-information call pauses cold progression and releases only the requested summary.
4. A reply between steps cancels generic follow-ups; definite decline/DNC suppresses both campaign channels and stays suppressed after stale events/restart.
5. Bounce/wrong number holds the failed route and cannot create a new unsuppressed identity to bypass it.
6. Two-call/two-email nonresponse caps and ten-business-day expiry survive restart; both channels on one company count once that day; scheduled/unsent work counts zero.
7. Owner-approved message facts render correctly, unresolved placeholders block sending, and source failures or missing sender/opt-out/address configuration block activation.
8. Sender delivery is verified in both Apollo and the controlled destination; sends/replies/stops are read back rather than inferred from a successful request.
9. Routine factual replies use approved current facts; ambiguity, scope, price and promises escalate; automatic replies do not loop.
10. Verified calendar slots create one event and accurate confirmation; conflicting slots, lost responses and failed booking hold or reconcile without double booking.
11. Only discovery-confirmed interest earns the prototype task; research qualification alone does not. The agreed preview has one main flow, simulated actions and no live customer data.
12. Uncertain creates/enrollment/sends and lost synchronization receipts reconcile without duplicate action. A suppression failure blocks the affected path.
13. A fictional proposal requires filled and approved scope/price/terms; a draft or positive reply cannot assert agreement, cash receipt or Won.
14. Separate research/outreach pause and restart controls work; the new private S2 state is included in backup/restore and exception reporting.

Before live rollout: resolve the business sender/domain and account ownership; verify Apollo write, call-logging, reply and suppression interfaces plus manual-task auto-skip behavior; choose the booking route; implement the narrow mappings; run the controlled scenarios; satisfy the existing website/inquiry and tested-system launch gate. Grow volume from measured supply, mailbox health and owner conversations. Neither a native export nor an inactive stock sequence establishes a tested two-way lifecycle.

## Sources and current boundaries

Reviewed October 16, 2026: [Apollo tasks](https://knowledge.apollo.io/hc/en-us/articles/28705458602125-Tasks-Overview) explains manual-step completion and auto-skip; [call outcomes](https://knowledge.apollo.io/hc/en-us/articles/5494331315853-Use-Purposes-and-Dispositions-to-Understand-Call-Outcomes) explains connected/not-connected sequence behavior; [the Chrome extension](https://knowledge.apollo.io/hc/en-us/articles/42157823129357-Use-the-Apollo-Chrome-Extension) documents manual call logging; [sending limits](https://knowledge.apollo.io/hc/en-us/articles/4409233349005-Configure-Email-Sending-Limits) includes follow-ups in mailbox capacity. These documents support the design but do not prove this account's configured interfaces or billing/calling route. No extension, phone number, mailbox, setting or external automation was installed or enabled.

Commercial messages need truthful identity/subject, ad disclosure, a valid business postal address and working opt-out under the [FTC's business guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business). Keep the configured footer and restrictions with every applicable message; verify channel suitability before calls. The public studio form follows the separate [inbound launch route](../docs/studio-launch.md#inquiry-and-data-ownership), not automatic enrollment into this outbound campaign.
