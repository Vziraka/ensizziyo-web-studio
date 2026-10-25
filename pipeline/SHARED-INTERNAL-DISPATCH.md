# Disabled shared internal dispatch

The separate [manual/internal composition](SHARED-MANUAL-DISPATCH.md) adds five signed human events under its own exact profile and policy; this original internal-only profile remains human-read-only.

This source capability joins one existing registered-inbox continuation and the existing responsible-role attention/weekday digest preparation to a finite standing **internal-only** owner policy. It uses the same `workspace` key, exact authoritative namespace, `ConditionalLifecycleStore`, lifecycle reducer, `actions`, `operations.requests`, `operations.email`, `operations.gmail_incoming` and `team_notifications`. There is no second operational queue or active copied workspace. Existing fictional, inert, manual, project, research and each-message notification capabilities retain their own gates.

The [proposed policy](shared-internal-dispatch.example.json) is **UNAPPROVED**. Actual recipients, verified address mappings, Google grant, deployment, dates and allowances are blank. No flag, schedule, grant, settings, real state migration or production activation was changed. Tests fill these fields with fictional values only.

## Caller and authority

`shared-internal-dispatch.mjs` validates a distinct `shared-internal-dispatch-v1` deployment binding. It retains full policy, template, signature, role verification references and authorization bytes in the authoritative state. The policy binds workspace/run/site/deploy/origin/namespace, exact business Google account/grant/from, distinct verified owner/friend addresses, existing registered routes/contact hashes, templates/privacy/signature versions, UTC starts/expiry (maximum seven days), limits, priority and pause rules. Configuration and the policy's UNAPPROVED label are never human approval: the signed owner must authorize its exact SHA-256 in a separate event. The host principal is explicitly `service:internal-dispatch`, attributed to that event; it never fabricates a human session or an `exact_team_notification_approved` event. Existing each-message approval is unchanged.

Signed owner/friend routes under `/desk/api/internal-dispatch/`:

| Operation | Authority and outcome |
| --- | --- |
| GET `policy`, `status` | Both roles inspect exact policy, limits, authorization, tick observations and observed recovery hash. |
| POST `authorize` | Owner only: current revision, stable event ID, `authorized:true`, exact `policy_sha256`. One grant per binding; no resume or allowance reset. |
| POST `pause` | Either role, current revision/event ID. Fences new work after awaits. Already-started requests may finish. |
| POST `reconcile` without action ID | Either role, current revision/event ID and exact control `observed_sha256`. Closes incomplete ticks as retained evidence and pauses the policy. No process-exit attestation or replay permission. |
| POST `reconcile` with action ID | Either role explicitly authorizes one original Uncertain intent's readback using its observed intent hash. Reserves one finite read-only tick and queues a MAC-bound reference. May read after policy pause/expiry; cannot poll, prepare, claim or POST a send. Lost acknowledgement requires durable claim readback, never requeue. |

Both roles retain equal design authority in the existing design capability, visibility here and authority to pause. This profile exposes read-only saved business records plus these controls; it does not combine unrelated human/design/provider transitions. CSRF, individual sessions and same-origin checks remain enforced. The desk shows Unapproved, Authorized, Runtime paused, Paused, Expired and Recovery required separately, and states that sender verification is not inbox delivery.

## Clock and bounded runner

`internal-dispatch-host.mjs` requires `CONTEXT=production`, exact `EVZ_OPERATIONS_DESK_ENABLED`, separately set `EVZ_INTERNAL_DISPATCH_RUNTIME`, `EVZ_INTERNAL_DISPATCH_BINDING`, exact site/deploy/origin/namespace and a distinct `EVZ_INTERNAL_DISPATCH_SECRET`. Trusted platform context must identify the published production deploy. The clock reads the scheduled `next_run` envelope, reserves one due tick and POSTs a tiny opaque workspace/tick/policy/binding/deadline reference authenticated by its own MAC. It performs no Gmail work. The protected `/desk/api/internal-dispatch-background` function owns execution. Ordinary desk routing excludes that background path.

Default generated builds emit **no schedule and no storage import** for this clock. Only an explicitly selected future production build `EVZ_INTERNAL_DISPATCH_BUILD=shared-internal-dispatch-v1` emits the one-minute UTC clock. [Netlify schedules](https://docs.netlify.com/build/functions/scheduled-functions/) run on published deploys with a 30-second ceiling; [background functions](https://docs.netlify.com/build/functions/background-functions/) may redeliver after acknowledgement. Neither 202 nor a clock invocation proves execution/delivery. Duplicate clock calls, redelivery and lost committed responses read the same durable tick/action/intent. No background claim is restarted.

Every mutation is a deterministic typed transition, independently replayed over the entire prior state before conditional publication. The incoming transition replays the actual existing parser/reducer from retained bounded provider observations. Cursor/pages, dedup/provenance, stop actions and held alert preparation remain one atomic CAS. Explicit internal notification receipts are still excluded before both retained-thread and exact-receipt prospect route derivation.

One runner first reconciles at most one outstanding standing intent, then performs one incoming continuation, prepares current notifications and sends only within its finite tick slots. It preserves reply, meeting, problem, digest ordering with stable IDs, while reserving both due digest slots within the tick and daily budget. Responsible-role source/assignment/stop/package checks run again after awaited preflight, immediately before claim. Unclaimed stale work closes without refund/replay and fresh preparation can reflect reassignment/resolution. Claimed work retains its original MIME for reconciliation only.

The unchanged Eastern weekday 9am/DST/current-date digest uses immutable same-day snapshots, actual preparation lateness and no backfill. No prospect email, private call notes or incoming body is placed in an internal notification. Provider observations stay private in state/G1; ordinary status shows their hashes/counts rather than their body bytes.

## Limits and uncertainty

The exact policy grants 1–1,000 lifetime and 1–100 daily tick reservations; cadence 60–3,600 seconds; 4–40 GETs, 2–4 send slots, 200 KB–8 MB response bytes and 1–240 seconds per tick. Internal daily sends are 2–20, lifetime sends 2–100, with 1–8 attention slots per role/day. These are schema maxima, **not approved actual allowances**. Token requests and OAuth HTTP use the same deadline and finite request budget; fetch and streaming body reads are bounded across the entire cycle. A blocked token/fetch/body cannot extend authority. Each request and completion is retained on the original tick; late completion cannot reopen a reconciled phase.

All internal reservations also count against the unchanged combined **20/day** sender cap, including existing/native/information/uncertain send reservations. Nothing is refunded or reset. Due digests retain priority slots but cannot override an exhausted combined cap or incoming hold. Finite ticks reserve their full ceilings even if unused. The owner must supply a measured finite host-cycle allowance/evidence reference; lifetime ticks cannot consume its final 30%. The store also leaves a 30% reserve before a worst-case incoming observation. Actual hosting cost/credit accounting and measured cycle compatibility remain separate activation acceptance.

The Google transport, MIME composer and complete raw Sent verifier are the existing callers. The action/intent and exact MIME are durable before preflight; `Uncertain` is durable before the single simulated/provider POST. Lost responses, missing/ambiguous Sent results or changed raw MIME remain Uncertain with **no resend**. A pre-dispatch closure retains its cancelled reservation and original MIME; it grants no replacement send. A complete verified Sent receipt proves sender readback only.

## Separate future Google profile

`internal-dispatch-gmail-v1` is a distinct published-deployment owner OAuth profile under `/desk/api/internal-google-oauth/`, with its own client, credential namespace/key/secret and exact Gmail read-only/send plus essential OpenID email scopes. It uses the existing encrypted conditional grant state machine. `EVZ_INTERNAL_GOOGLE_OAUTH` and the `EVZ_INTERNAL_GOOGLE_*` binding/credential/client settings are independently unset by default. Existing Gmail/Drive/Calendar profiles/scopes/accounts are unchanged, cannot silently supply this grant, and are not copied. No real OAuth consent occurred.

## G1 and recovery

Complete G1 retains full policy/template/authorization bytes and attribution, tick/request/phase reservations and observations, source events/cursor/dedup, exact MIME/intents/receipts, pauses, uncertainty and every existing project/audio/original/source/runtime/raster dependency. Both local and hosted inventory reject live Reserved/Claimed dispatch ticks until explicit observed-hash recovery closes them. Closure preserves prior phase/status evidence and never claims a process exited. Required published dependencies still fail closed.

Preparation and installer dry-run/commit also enforce the [complete incoming scope](GOOGLE-INCOMING-MAIL.md#supported-caller-and-scope) before dependency/workspace writes. Shared routes use the immutable policy's full array, including several threads for one project; its order and bytes remain reviewed policy evidence. Effective-route equality and compatible supported saved incoming binding/progress are required. An incompatible account/grant/contact/route, missing scope or unsupported legacy shape holds the whole install. Matching saved progress and old raw tick observations remain exact; this adds no cursor migration, automatic route adoption or standing allowance reset.

Restore uses disabled default configuration, contains no credentials/schedules/grant authority and never replays an intent. A subsequent trusted rebind needs the recovered control hash and a distinct new policy; prior complete policy bytes/history and reservations remain retained. A fresh exact owner approval is necessary before any new effect. Prior Uncertain intents still require their original binding/readback; rebind is not resend permission or allowance restoration.

## Verification and boundaries

Run `node --test pipeline/shared-internal-dispatch.test.mjs pipeline/google-oauth.test.mjs pipeline/google-incoming-mail.test.mjs pipeline/exact-team-notifications.test.mjs pipeline/team-notifications.test.mjs`, `npm run check --prefix pipeline`, `npm test --prefix pipeline`, default desk build and the normal site build/verification/tests. The local fixture uses the real pinned Blobs SDK over injected conditional HTTP, real signed Request/Response callers, existing incoming parser/reducer, existing Google MIME/transport/raw verification and actual Node PDF/source/runtime dependency generation. Google/token/Blobs HTTP and raster pixels are fictional boundary substitutes. Desktop/narrow signed UI inspection uses the bundled Playwright when the Browser plugin is absent.

No live Google/source/model/provider request, send/alert/invitation, credential read/copy, new account/scope/permission, migration/upload, charge, settings change, deploy or production activation was performed. Real role recipients/owner policy, Google consent/alias/refresh compatibility, published hosting volume/cost/latency/retention, coherent migration/rollback, actual inbox delivery, independent devices and computer-off operation remain external acceptance. The historical Gateway4 exhausted receipt and revision14 pause remain unchanged; later model policies remain UNAPPROVED with flags unset.
