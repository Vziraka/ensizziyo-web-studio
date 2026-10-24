# Internal alerts and weekday team summary

Verified attention events prepare private messages in **Needs attention → Owner alerts and team summary**. Replies go to the assigned operator, or the owner when unassigned. A verified reply includes meeting requests for human review in the original mailbox; the desk does not guess meeting intent from private text. Calendar records needing review, uncertain provider actions, urgent support and saved problems also prepare attention messages. Global problems go to the owner. Private reply bodies, call notes and raw error details are not copied into notification text.

The same active source does not prepare repeatedly. Handoff resolves the old audience's unsent message and prepares one for the new responsible operator. Reviewing/resolving the source marks its pending message resolved before delivery. A later occurrence can prepare again. None of these states means a message was sent.

At or after **9am America/New_York on weekdays**, clock preparation saves one summary for each of the owner and friend roles. The digest records its due time, actual preparation time and lateness. Before 9am and on weekends it prepares no digest; it does not backfill missed weekend/previous-day summaries. The daily snapshot stays immutable through retries/restarts. Counts distinguish new prepared businesses, due callbacks, other due call tasks, interested projects and attention items; simulated calls never become actual contacts.

## Actual callers

- Lifecycle events prepare current attention messages in the same state transaction, without external effects.
- The existing local `service` host checks preparation every 60 seconds while it is awake. This does not establish a computer-off scheduler.
- Local and hosted authenticated `GET /api/team-notifications` returns the private preparation view. CSRF-protected `POST /api/team-notifications/prepare` checks current attention and digest time; the hosted prefix is `/desk`. The UI's **Check due alerts and team summary** calls that route.
- `node lifecycle-cli.mjs notifications` reads prepared messages; `node lifecycle-cli.mjs prepare-notifications` performs the clock check against the configured private state directory.

The source history is bounded to 500 messages and the UI returns the latest 40. A full history holds further preparation with a visible reason; it cannot discard the incoming verified reply. Retention/archive behavior must be reviewed before production use. There is no send action, recipient-address inference, provider intent or automatic external delivery in this increment.

## Delivery gate and verification

All messages show **Prepared; delivery held**. Exact owner/friend recipient addresses, an approved channel and a supported hosted transport remain unconfigured. The existing Sheets service-account scope cannot send Gmail. Local `AppConnectors` starts a local Codex process with existing account links; deploying source does not transfer those credentials or make the process run in Netlify. No local authentication files should be copied to hosting. Actual off-device delivery, permissions, provider readback/duplicate protection and computer-off scheduling require a separate connected proof before activation. The original local service and production remain untouched during this source review.

Run `node --test team-notifications.test.mjs hosted-desk.test.mjs`, syntax checks and the full serial lifecycle suite. Fixtures exercise actual lifecycle/HTTP/CAS preparation, audience handoff, resolution/reoccurrence, bounded history, privacy, DST, weekday timing, lateness, restart and lost response without duplicate messages. Browser rehearsal at a fictional weekday9:07am must show one assigned alert plus both digests, explicit 7-minute lateness and held delivery; repeated checks must keep the same messages. No real recipient, provider send or clock schedule is needed for that rehearsal.
