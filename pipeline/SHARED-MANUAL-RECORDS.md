# Shared manual call records

The explicitly prepared operations-desk [existing-PDF opt-in](OPERATIONS-EXISTING-PDFS.md) adds only signed source registration, exact retained-original transfer/inspection and baseline review on its new immutable manual binding. Earlier profiles and operations manifests without that declaration keep transfer denial. Complete exports for this opt-in read verified originals from canonical chunks; partial transfers remain held and resumable.

This is a separately disabled source capability for signed owner/friend collaboration on production-shaped saved records. It records the operator's attestation of a completed human call, not authorization to place a call or independent evidence that one occurred. It introduces no provider, microphone, model, scheduler or email-send route. Original `inert-shared-v1` remains read/private-notes only; the default fictional preview keeps its existing contract.

## Exact binding and caller

`shared-manual-records-v1` requires a newly reviewed manifest and separate `evz-manual-shared-<8–40 lowercase letters/digits/hyphens>` namespace. The exact workspace ID, run ID, `production` mode, state schema, site ID, deployment ID and HTTPS origin are bound to the manifest SHA256. The server checks trusted deployment/site context. Nothing auto-seeds an empty destination. Existing inert or fictional bindings cannot opt into this authority.

Future setup would require `EVZ_OPERATIONS_DESK_ENABLED=shared-manual-records-v1`, `EVZ_OPERATIONS_MANUAL_BINDING` with the complete reviewed `{scope,manifest_sha256}`, the matching existing origin/namespace settings and separate operator sessions. These are field names, not an approved setup or activation instruction. No real package, remote data or environment setting was changed by this increment.

`prepareManualWorkspace({backup,sourceConfig,scope})` reads a validated local complete G1 backup, uses the existing fresh execution-disabled configuration and retains its dependency inventory. Only display names and the existing finite transcript cap/reserve cross from source configuration. Follow-up preparation is enabled solely to retain held previews. All research/call/outreach/connector/runtime/operations/AI flags stay false, both releases stay revoked, and the configuration hash is immutable. `installManualWorkspace(store,packet)` defaults to validation-only without accessing storage; explicit `commit:true` is a separate future import operation into an empty, exactly bound destination. No HTTP import/setup route exists.

The existing signed `POST /desk/api/event` takes `{revision,event:{id,prospect_id,type,at,data}}`. Both operators have equal ordinary authority. An exact current revision is required; the server derives the actor from its signed session. Unknown event/data fields and fictional call assertions are rejected. The event ID and signed actor fingerprint preserve exact retries after response loss.

| Event | Permitted data and behavior |
| --- | --- |
| `note_added` | Bounded nonempty `note` on an existing record. |
| `call_logged` | Unique `call_id`, explicit `outcome` and ordered `performed_at`; `manual_attested:true` and `desk:true` are required. Existing production simulation identity is retained (`simulated` absent or false as appropriate). Optional bounded `note`, supported `focus`, connected `intent` and exact `callback_at` use the existing reducer. `skipped` is excluded because no completed call is attested. |
| `call_claimed` | Empty data. Existing eligible/unassigned-or-owned restrictions apply. |
| `follow_up_handed_off` | `to` names the other operator. Only the assigned operator can hand off. Existing call/email task and Ready project-work assignments follow the handoff; approvals and artifacts do not change. |
| `contact_stopped` | Explicit `reason` of `decline` or `do_not_contact`. Either signed operator can stop work immediately. |

Callback timing is part of `call_logged` with outcome `callback`, not a separate reschedule or contact authorization. Exact agreed times remain promises, including already overdue ones. No agreed time produces only an internal 9am America/New_York next-business-day reminder, including DST handling. Busy and callback results prepare no sales email. Cold calls retain the two-attempt cap and ten-business-day limit; requested callbacks remain separate. New researched/imported businesses retain the shared 25/day ceiling; logging callbacks does not import a business or consume a new-research slot. No discovery/import event is allowed here.

## Mutation and execution invariants

The existing lifecycle in-memory reducer is the single authority for call cadence, campaign caps, restrictions, first-caller ownership, callback timing, held follow-up content and handoffs. The manual path precedes only the normal production *call-execution release* check in `apply`; it does not change `requireCallRelease` or the local production path. A restored local production workspace still requires that release before logging through the ordinary path. The manual caller attaches a durable `operator-reported-completed-call` attestation with `provider_verified:false` and `execution:disabled`.

The conditional store independently replays exactly the allowed signed event against the original state/configuration, then compares the entire expected state to the proposed write. This preserves every unrelated record, existing event/call, asset, budget, AI attempt, provider request, runtime/lease and configuration byte except the existing reducer's explicit changes. Changes include the target record, one append-only event/revision, local call/callback cancellations or scheduling, stop holds and explicit handoff assignments. Unrelated project preparation, notification generation and operations-cycle refresh are omitted in this mode. New local actions carry an execution hold. There is no generic worker write or config-edit escape hatch.

Strong reads and ETag conditional writes cover one complete workspace object. Stale/concurrent decisions fail without rerunning a reducer or external effect. Committed response loss reconciles the exact event fingerprint; an uncommitted uncertain outcome retains the event ID for readback/retry. Replay cannot change the outcome or actor.

`pauseCold` cancels purely local queued future contact work. Pending sends become Uncertain; prior uncertain requests/effects remain evidence, and provider tasks can only acquire a cancellation request. An existing sequence may gain a held local suppression task, never a provider call. The view and responses explicitly say **external suppression unverified**. Neither a local stop nor the imported reconciliation manifest claims that historical external work stopped.

Eligible follow-up content retains the existing outcome/focus/email/campaign checks. The manual capability forces every newly prepared follow-up to Held and creates no new email action. The second unanswered call's final-email timing remains the existing three-business-day rule. Historical email actions/statuses and uncertain deliveries remain visible without replay. Audio, dictation, calling sessions, authoring, booking, OAuth, provider execution, AI, research controls and hosted backup are inaccessible in this capability, including when unrelated future flags are supplied.

## Interface and recovery

The existing Calling desk and Businesses forms expose completed-call time, explicit attestation, callback promise/reminder choice, claim/handoff, private note and immediate DNC. They show execution disabled and human-report provenance. Shared modes expose saved histories instead of audio, transcript, correction/undo, booking or sending controls. Phone/email values remain readable without initiating links. Other permitted views are held email previews, client notes and exceptions; unsupported decision forms are unavailable. Default local/fictional behavior is unchanged.

`exportManualBackup(app,localDependencies,output)` uses the current shared state and the existing complete G1 dependency validation. D1 original chunks alone do not prove complete hosted backup; the operator must provide the full validated local dependency set. Restore targets a new private directory, preserves calls/handoffs/held drafts and dependencies, disables execution, and retains uncertain external effects under the existing restore rules. It does not recreate a reviewed shared binding or activate a host.

## Verification and limits

Run `node --test shared-manual-records.test.mjs inert-shared-workspace.test.mjs lifecycle-store.test.mjs hosted-desk.test.mjs lifecycle.test.mjs` from `pipeline`, then its normal `npm run check` and `npm test`. New fictional production-shaped fixtures use the pinned Blobs 11.1.6 SDK with strong-read/conditional-write wire requests and fresh signed owner/friend handlers. Cases cover exact call data/time/order/caps, held follow-up timing, busy/callback no-email, owner/handoff, stop interruption/uncertainty, stale/concurrent/replayed/response-loss writes, provider/config/budget/history denials and updated G1 original recovery. Existing inert/default regression suites retain their distinct contracts.

The private `shared-manual-call-records-handoff-20261024.json` owns exact source, two review passes and proof paths. The new local browser rehearsal uses a real local HTTPS handler and pinned SDK over a real local HTTPS fixture, independent owner 1440×1050 and friend 390×844 browser contexts, and fictional records only. It exercises a call, handoff, callback and stop; screenshots, no-overflow/console checks and final stored state are retained privately. Browser plugin was unavailable, so installed bundled Playwright was used.

Local tests do not prove actual Netlify compatibility, latency/cost, independent devices, production import/migration, live call occurrence, provider suppression/delivery, semantic quality or computer-off operation. Actual owner-reviewed setup, complete hosted dependency storage, other shared lifecycle events, scheduling and all execution acceptance remain separate and unfulfilled. No real record was imported and the capability stays inactive.
