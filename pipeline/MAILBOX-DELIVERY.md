# Shared mailbox delivery

The `shared-mailbox-delivery-v1` profile adds explicit exact-message delivery to the canonical inbox/work/clock workspace. Old profiles remain unable to send. Content approval and send approval are distinct; AI proposals grant neither.

## Authority and persistence

Preparation retains the exact source sender and mailing address and binds account, grant, site, deploy, origin, expiry, recovery generation and finite limits in the immutable manifest. Delivery starts paused with no allowance. Signed operators review included usage, record a finite send allowance and resume explicitly. Each assigned operator reviews the complete message and PDF hashes before approving an individual send or selected scheduled outreach packages.

Dispatch rereads current source, ownership, approvals, pause, allowance and expiry before provider effects. Exact MIME is retained in immutable 1 MB chunks outside the 20 MB canonical state, then a permanent intent is reserved and claimed before the Gmail POST. Concurrent calls and lost acknowledgements cannot create another claim. Uncertain outcomes require original Sent readback; there is no resend button or automatic retry. Verified means exact sender-side evidence, not recipient inbox delivery. Replies retain their original thread; attachments retain original bytes, with a combined 20 MB PDF bound.

Backups contain the exact MIME manifest/chunks. Recovery pauses delivery and invalidates old approvals; a changed deployment cannot dispatch old intents. Claimed historical intents can be reconciled read-only with the original account and grant, including after policy expiry. A different account or grant is rejected. Missing or corrupted MIME fails closed before import writes.

## Hosting and operation

`EVZ_MAILBOX_DELIVERY_RUNTIME=shared-mailbox-delivery-v1` enables the signed dispatch/readback routes only on the exact protected published binding. The separate minute scheduler additionally requires `EVZ_MAILBOX_DELIVERY_CLOCK_RUNTIME=shared-mailbox-delivery-v1`; build uses `CONTEXT=production` and `EVZ_MAILBOX_DELIVERY_CLOCK_BUILD=shared-mailbox-delivery-v1`. Default/preview builds are disabled. Run `node scripts/build-desk-assets.mjs` from the repository root to emit the function entry.

Each scheduled invocation selects at most one due, separately approved outreach package inside its 60-second recipient-local slot and has a 25-second budget. It does not perform intake, make approvals or recover uncertain sends automatically. Mailbox intake remains the sole history cursor authority. New-business ceiling remains 100/day, with previously called businesses additional and one follow-up after seven days. A missed slot requires renewed review; no backlog burst. Multiple recipient timezones or overlapping additional slots can leave a shortfall, rather than sending extra messages later.

Commercial outreach requires a verified real mailing address in the exact policy and footer. The owner has no address; retain this hold without requesting it again. Finite allowances are reviewed limits, not live hosting/provider balance meters. Turning pause on prevents new effects and invalidates prior approvals; disabling the generated schedule via an inert publication stops recurring platform invocations. Preserve canonical records and original MIME during rollback.

## Verification and remaining release gates

Run from `pipeline`: `node --test mailbox-delivery*.test.mjs mailbox-mime-store.test.mjs lifecycle-backup*.test.mjs shared-manual-records.test.mjs outreach-review.test.mjs`, then `npm run check`, build and full CI. Tests use actual conditional storage and Google adapter code with external token/network boundaries injected. They cover duplicate calls, lost durable acknowledgements, source/pause/deadline races, original PDFs, exact Sent readback, old-profile denial, backup recovery and default-disabled scheduling.

Browser recipe: isolated fictional delivery workspace, synthetic provider, one valid PDF, signed owner and teammate sessions. Inspect PDF, approve content, save one-send allowance, resume, inspect complete send package, approve separately, send, reload and verify saved receipt and exactly one synthetic POST. Pause as teammate and inspect narrow layout. Stop only the fixture process created for the check.

Local desktop flow completed November 1: 895-byte PDF inspected, separate approvals and one synthetic POST, durable Verified receipt after reload. Native Work independently inspected a fictional PDF and saved an unapproved proposal earlier. Neither proves real delivery, received DKIM, unattended capacity, two-person identity or computer-off operation. Hosted activation, real controlled received-message proof, notifications and daily summary delivery, sustained public research and reserve measurements remain release work. Commercial outreach remains held. Final independent review and CI are recorded on the delivery PR.
