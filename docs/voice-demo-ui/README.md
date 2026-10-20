# Voice demo UI

Owner-selected design: [approved screenshot](approved-design.png), October 20, 2026.

The opening keeps the selected centered white/Manrope layout, large readable type, dotted waveform, Talk to Evan action and recorded-example alternative. Motion is subtle and respects reduced motion. During a live conversation the latest real exchange leads, with the full transcript available. A captured enquiry appears only after disconnect, with booking primary and email secondary. An ended call without capture says so. Mobile uses the studio's SVG arrows.

Scope is website UI only. Preserve Evan's agent ID, voice, instructions, server-side tools/settings, allowed hosts, conversation/usage limits, retention, existing recording and booking destination. The existing widget owns terms and microphone permission. No agent update, prompt/voice override, new provider, API key or new SDK is introduced.

The pinned widget 0.20.0 exposes the session through the existing creation callback but overwrites message/lifecycle callbacks supplied in the call event. The small session observer preserves its original callbacks and observes that exact pinned session's callback object. If the contract is absent, the native widget stays visible. Replace this compatibility seam when the widget supplies public lifecycle events; test it before changing the pin.

## Assets

- The transparent waveform was prepared with built-in Image Generation from the exact selected screenshot; no code drawing substitutes for the artwork.
- Manrope and its existing license are reused from studio assets.
- The diagonal arrow is the existing homepage SVG packaged as an image, avoiding mobile emoji rendering.
- The microphone is Lucide 0.468.0 at commit f12b0de177fbc2a6795e99be065887e72b237123, with the existing ISC license copied beside it.

## Local verification

Run from the repository root:

    node --check site/studio/demos/voice/demo.mjs
    node --test scripts/inquiry.test.mjs scripts/voice-demo.test.mjs
    node scripts/build-site.mjs
    node scripts/verify-site.mjs
    node scripts/prepare-voice-rehearsal.mjs
    python -m http.server 4218 --bind 127.0.0.1 --directory dist

The ready message identifies port 4218. Stop only this server with Ctrl+C in its terminal. The actual page is /studio/demos/voice/; the separate /__voice-ui-qa/ route uses an explicitly fictional widget fixture, without microphone, network conversation or provider usage. Rebuilding removes it. CI builds only site/, so this rehearsal is never published.

Check ready, recording/transcript, local call/latest exchange, text entry, no premature enquiry, after-call capture/booking, no-capture outcome, cancel/delayed connect, retry, keyboard, mobile overflow and reduced motion. These local checks do not establish a fresh acoustic test or production microphone headers; the agent, recording and generated header scope remain unchanged.

Implementation and local checks passed. See the root design-qa.md for same-frame visual comparisons and the separate review.md for requirements/engineering passes. Eight tests, route/assets/header verification, desktop/mobile call rehearsals, recording completion and console checks passed. The original recording and agent instruction file have no diff. Live spoken testing on the published allowed domain remains a release check; no agent setting or public deployment was changed.
