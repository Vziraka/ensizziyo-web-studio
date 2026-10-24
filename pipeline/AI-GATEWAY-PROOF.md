# Finite fictional Gateway proof

This is a disabled-by-default capability and cost-boundary proof in the existing protected Netlify Deploy Preview. It is separate from operational research, real transcripts, outreach, asset authoring and production activation. Checking capability performs no inference. Source/tests do not establish deployed capability or useful model quality.

## Current supported candidate

The current public Netlify catalog lists `gemini-2.5-flash-lite`. Google documents text/audio input and text output for this model. The proposed route uses the official pinned `@google/genai` SDK and `models.countTokens` followed by `models.generateContent`; no dedicated speech endpoint is assumed. Netlify's actual CountTokens and inline-audio pass-through still require a controlled runtime check. See [Netlify Gateway](https://docs.netlify.com/build/ai-gateway/overview/), [current public catalog](https://api.netlify.com/api/v1/ai-gateway/providers/detailed), [Google model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite) and [audio input](https://ai.google.dev/gemini-api/docs/generate-content/audio).

Netlify converts provider model usage at 180 credits per USD and shares that pool with the website. This is existing-plan usage, not a transferable chat subscription or a separate free API. The Gateway is outside the Agent Runner AI cap. [Billing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/pricing-for-ai-features/). No new account, provider key, recharge, credit pack or production deployment is needed for this preview proof.

## Exact finite approval

In Setup, **Check Gateway capability and saved proof** reads only authenticated runtime booleans, the exact policy hash and retained proof receipts. It exposes no credential values or URLs. The server requires Deploy Preview context, both injected provider/Gateway pairs with equal keys and HTTPS origins, and no conflicting Google/Vertex configuration. The explicitly validated SDK binding plus a strict two-endpoint fetch allowlist prevents a provider-default fallback or redirect. This explicit binding is a security constraint; ordinary SDK examples use injected defaults.

Before any actual invocation, review the deployed policy/hash and freshly inspect the plan balance and disabled auto recharge. Only the signed-in owner can configure the finite proof. Its same-origin CSRF request records that observation, an exact policy approval and an expiry 15 minutes after the observation. The balance must be at least the 900-credit hosting reserve plus the four-credit proof allowance. The observation may be at most two minutes old when configuring.

The reserve is based on a manually verified snapshot. The app cannot atomically reserve team credits against unrelated website activity. Compute/storage consume separate shared credits. Inspect usage before and after the bounded sequence; do not represent this as an account-wide hard spending limit.

The policy permits four fixed jobs total: a supported fictional opening, a separate review of that exact assessment, a dated-only weak-opening hold, and one short synthetic WAV transcript. No caller-supplied prompt, model, URL, tools, real recording or client context is accepted. The WAV was generated offline with Windows System.Speech, has no microphone/personal audio, lasts about 7.2 seconds and is pinned by SHA-256. It proves neither two-speaker capture nor real-call accuracy.

## Reservation and failure boundary

Each job reserves one model credit through the same shared CAS boundary before model network access. Four jobs/four model credits is a lifetime limit, so it also bounds any day or billing cycle. Reconfiguration cannot reset it; redeploy and restart retain it. There are at most four CountTokens requests and four generation requests, each one SDK attempt. Public catalog reads are separate metadata requests. There is no automatic retry, replay or refund of held/uncertain work.

CountTokens must return 1–4096 input tokens before generation. Output is capped at 1536 tokens, one candidate, zero thinking and no tools. Each job rechecks model availability and reviewed catalog price ceilings. The conservative calculation allows audio input at USD0.30/million and output at USD0.40/million; the current text input price is lower. At these caps even input counting plus generation is below the one-credit reservation. See [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) and [token counting](https://ai.google.dev/gemini-api/docs/tokens). No reservation is reduced based on estimates.

The SDK has a 20-second per-request timeout and one total attempt. A shared 40-second abort signal bounds the count/generation pair; aborting locally does not prove provider cancellation or zero charge. A lost reservation acknowledgement starts no generation. Strong readback shows Reserved; that job is never dispatched again. Reserved or Uncertain work blocks another job. Either operator's Pause all persists a stop without resetting reservations. The worker rechecks pause/expiry before counting and again before generation; an already-started provider request may still finish and be charged. The UI drops stale capability/receipt views after any state revision and requires fresh readback. Provider errors are stored as stable categories without raw credential-bearing messages.

Results retain input hashes, model/catalog identity, usage, conservative cost, status and bounded review output. Truncated, invalid or unbound results are held. Weak evidence must stay held; exact source/hash checks do not prove semantic relevance. The separate review binds the saved assessment; the audio fixture compares against its known offline phrase and retains uncertainty. No result imports a prospect, confirms a customer fact or sends anything.

## Verification and rollback

Run `node --test gateway-proof.test.mjs hosted-desk.test.mjs lifecycle-store.test.mjs` from pipeline, syntax checks and the generated UI bundle tests. Account-free tests cover SDK count/generate routing, no redirect/retry, strict configuration, roles/CSRF, concurrent dispatch, exact replay, changed pricing, unsupported count, usage/output holds and lost CAS acknowledgement across a new app instance. Substituted services are not real hosted inference proof.

The protected routes are GET `/desk/api/gateway-proof`, POST `/desk/api/gateway-proof/configure`, and POST `/desk/api/gateway-proof/run`. Setup preserves stable job IDs and reads receipts after failures; it never automatically invokes another job. Missing runtime/configuration and expired approval fail closed. Production context remains unavailable. Do not delete/reset the ledger to retry an uncertain job. Disabling preview configuration stops the endpoint while preserving its receipts for reconciliation.
