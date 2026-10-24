# Protected shared-desk preview

This is an execution-disabled fictional proof of the existing desk on Netlify Functions and one strongly consistent conditional-write blob. The existing local runtime is unchanged. Production context always returns 503 for this endpoint; no production records, credentials, Drive files, connectors or workers are copied into it.

The function exposes `/desk/`, its UI assets, authenticated `/desk/api/state`, operator login/logout, lifecycle events and draft/history previews. The same event validation, operator attribution and approval rules are reused. Calling sessions and saved information drafts use their existing state-only callers. The separate [recording contract](CALL-RECORDING.md) adds authenticated new-only binary audio storage and private playback; its actual deployed-storage proof remains pending. Unsupported provider analysis, sending, booking, discovery and general file actions return an explicit disabled response; they never report simulated external success.

## Configuration and access

With absent, partial or invalid configuration, `/desk/` and all its API routes fail closed before storage access. The protected preview requires the following **preview-scoped** environment fields; values do not belong in Git or build output:

- Netlify's trusted `context.deploy.context` must be `deploy-preview`; the function supplies it internally. No client or manually set environment value can enable production context.
- `EVZ_OPERATIONS_DESK_ENABLED=fictional-preview`.
- `EVZ_OPERATIONS_ORIGIN`, the exact HTTPS preview origin without a trailing slash.
- `EVZ_OPERATIONS_BLOB_NAMESPACE`, a new name beginning `evz-redesign-proof-` with 8–44 lowercase letters/digits/hyphens after that prefix. Never use a production store.
- `EVZ_OPERATIONS_OWNER_KEY`, `EVZ_OPERATIONS_FRIEND_KEY` and `EVZ_OPERATIONS_SESSION_SECRET`: three different independently generated 32-byte base64url values. Test fixtures contain public fake values and must never be used as deployed secrets.

Netlify supplies its scoped Blobs connection to the serverless function. This proof does not require copying a personal Netlify token or local CLI login. Provisioning the above preview secrets is a separate concrete setup action; it has not been completed by source implementation. The existing preview's Netlify team gate remains in place. Application operator sessions do not bypass that gate or establish the friend's access from another computer without a separate supported hosting decision.

Observed Personal-plan UI limitation: selecting individual variable scopes requires an upgrade. Its secret import selects Builds, Functions and Runtime together, excluding post-processing. Functions-only scope is therefore not available on this plan. Keep deployment context restricted to Deploy Previews and obtain the owner's explicit approval of that concrete wider execution scope before entering/importing keys. No upgrade, production scope, branch/agent preview scope, local scope or permission change is authorized by the source proof.

Operator cookies are signed, HttpOnly, Secure, SameSite=Strict and expire after 8 hours. A signed same-origin CSRF cookie/header protects writes and login. Origin and fetch-site checks reject foreign origins. Responses and static shell contain no stored project payload; authenticated state is `no-store`. Keys are never returned in JSON. Rotate the session secret to invalidate both active sessions. Preview assets stay separate from the public site's `/studio/` paths.

A first-visit document navigation may load the empty public shell from another site. That exception does not permit cross-site API reads, writes or embedded private previews.

## Transaction boundary

`ConditionalLifecycleStore` implements the existing `snapshot/config/change` boundary with strong `getWithMetadata` and `setJSON(...,{onlyIfMatch:etag})`. Initial creation uses `onlyIfNew`. A stale writer fails rather than rerunning its callback. External effects must remain outside callbacks; the proof starts none. Every event has a caller-owned stable ID/fingerprint. If a mutation response is lost, a strong read reconciles that exact saved event. Otherwise the outcome stays uncertain; retain the same ID, read `/desk/api/events/<id>`, and replay the same event rather than creating another action. Concurrent retries converge on one saved event and one local email action.

The proof caps its complete envelope at 2 MB and refuses non-fictional or execution-enabled state. General adapter validation retains the existing 20 MB ceiling. A read-only size check found the installed operational state file is 13,415,305 bytes; it has not been uploaded. This exceeds a sensible whole-state browser response. The preview projects event metadata and email status rather than returning retained provider receipts/full event payloads, and contains only one fictional project. Production migration still needs response-size, latency, conflict and credit measurement with an inert authorized copy; the fictional proof does not establish capacity for the real record set.

## Verification and deployment boundaries

The hosted UI retains an uncertain event's exact input and fingerprint in that tab's session storage, never operator credentials. It attempts strong receipt readback after a lost HTTP response; another approval stays blocked until the pending action resolves. Check saved action reads without writing; Retry exact pending approval resubmits the same reviewed event, revision and actor. Reload retains the hold. A stale or rejected approval must be reviewed again; another operator cannot replay it. `event-request.test.mjs` exercises this client against the actual stateless handler, including committed/uncommitted response loss and reload.

Run `node --test lifecycle-store.test.mjs hosted-desk.test.mjs event-request.test.mjs lifecycle-server.test.mjs`. Tests exercise independent operator sessions and app instances, concurrent writes, exact event replay, a lost committed-write response, source validation, protected UI assets, CSRF/origin rejection and absent-config failure. The pinned SDK is also exercised at its substituted fetch boundary to verify quoted ETags, conditional write headers and strong-read routing.

Build with `npm ci --prefix pipeline --ignore-scripts` then `node scripts/build-site.mjs`. Netlify bundles the function and includes reusable desk UI assets and two browser-safe shared modules from the pipeline. Default deployment must show 503 at `/desk/` while public routes remain unchanged. After the reviewed preview fields are configured, verify separate owner/friend sessions, shared fictional readback and conflict/replay through the actual HTTPS preview. Record the resulting namespace, deployment and request evidence privately. No live hosted storage, authentication or computer-off proof is claimed before that verification.

The existing Personal plan and auto-recharge-off setting constrain costs; credits are shared with the public site. Use a small bounded fixture trial and inspect usage afterward. No schedule, background AI or unrestricted model endpoint is introduced. Scheduled/background functions and a possible included-credit AI Gateway are separate candidates, not verified workers. Removing the preview flag or secrets disables the endpoint; retain the fictional namespace for review rather than deleting or overwriting it blindly.

### Function UI packaging

The Netlify build runs `node scripts/build-desk-assets.mjs` before the public site build. It converts only the existing UI asset allowlist into the ignored `pipeline/hosted-assets.mjs`; the function imports that module so the bundler carries exact bytes without depending on a Lambda directory layout. Private state and environment configuration are never read by this build step. Missing internal UI files return a generic503. Verify with `node --test scripts/build-desk-assets.test.mjs` and an actual preview request; a local test does not establish a successful remote deployment.

The pure `lifecycle-assets.mjs` manifest is shared by the local server, hosted handler and build. The hosted handler never imports the local HTTP server or starts its research-service dependency; that service computes a filesystem-based version only for the installed local host.
