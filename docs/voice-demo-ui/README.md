# Voice demo UI

Owner-selected design: [approved screenshot](approved-design.png), October 20, 2026.

The opening keeps the selected centered white/Manrope layout, large readable type, dotted waveform, Talk to Evan action and recorded-example alternative. The owner's follow-up replaces the original image pulse with continuously flowing dots. Motion stays subtle and respects reduced motion. During a live conversation the latest real exchange leads, with the full transcript available. A captured enquiry appears only after disconnect, with booking primary and email secondary. An ended call without capture says so. Mobile uses the studio's SVG arrows.

Scope is website UI only. Preserve Evan's agent ID, voice, instructions, server-side tools/settings, allowed hosts, conversation/usage limits, retention, existing recording and booking destination. The existing widget owns terms and microphone permission. No agent update, prompt/voice override, new provider, API key or new SDK is introduced.

The pinned widget 0.20.0 exposes the session through the existing creation callback but overwrites message/lifecycle callbacks supplied in the call event. The small session observer preserves its original callbacks and observes that exact pinned session's callback object. If the contract is absent, the native widget stays visible. Replace this compatibility seam when the widget supplies public lifecycle events; test it before changing the pin.

The native entry controls previously clipped: the 140-pixel host minus the widget's 32-pixel padding on each edge left only 76 pixels for its 104-pixel card. The host now provides 180 pixels with 12-pixel overlay padding and supported bottom-center placement. Keep the real widget's controls and attribution visible when changing the dialog or widget pin; the local call fixture does not reproduce the provider's layout.

## Assets

- The transparent waveform was prepared with built-in Image Generation from the exact selected screenshot. It remains the reduced-motion/unsupported-Canvas fallback and widget avatar.
- Following the owner's motion request, wave.mjs draws the main waveform with browser Canvas: moving dots, a flowing equatorial wave and slightly stronger movement while Evan speaks. Rendering is capped at 30 frames/second and pixel density 2, stops for hidden pages/content, and switches to the static artwork for reduced motion. No animation library is added.
- Manrope and its existing license are reused from studio assets.
- The diagonal arrow is the existing homepage SVG packaged as an image, avoiding mobile emoji rendering.
- The microphone is Lucide 0.468.0 at commit f12b0de177fbc2a6795e99be065887e72b237123, with the existing ISC license copied beside it.

## Local verification

Run from the repository root:

    node --check site/studio/demos/voice/demo.mjs
    node --check site/studio/demos/voice/wave.mjs
    node --test scripts/inquiry.test.mjs scripts/voice-demo.test.mjs
    node scripts/build-site.mjs
    node scripts/verify-site.mjs
    node scripts/prepare-voice-rehearsal.mjs
    python -m http.server 4218 --bind 127.0.0.1 --directory dist

The ready message identifies port 4218. Stop only this server with Ctrl+C in its terminal. The actual page is /studio/demos/voice/; the separate /__voice-ui-qa/ route uses an explicitly fictional widget fixture, without microphone, network conversation or provider usage. Rebuilding removes it. CI builds only site/, so this rehearsal is never published.

Check ready, recording/transcript, local call/latest exchange, text entry, no premature enquiry, after-call capture/booking, no-capture outcome, cancel/delayed connect, retry, keyboard, mobile overflow and reduced motion. Also open the actual page's dialog without starting a call: both native buttons must be fully visible at 1280 × 720, 390 × 844 and 320 × 800, with no horizontal dialog overflow. Tab from Close reaches Start voice demo, then Try text instead; Escape returns to Talk to Evan. Compare successive ready-state screenshots to confirm actual particle movement. These local checks do not establish a fresh acoustic test or production microphone headers; the agent, recording and generated header scope remain unchanged.

Implementation and local checks passed. See the root design-qa.md for visual comparisons and follow-up motion/dialog evidence, and the separate review.md for requirements/engineering passes. Ten tests cover the original checks plus waveform bounds/movement and animation pause/resume/reduced-motion behavior. Route/assets/header verification, desktop/mobile checks and the local call/enquiry/reset rehearsal passed. The original recording and agent instruction file have no diff. Live spoken testing on the published allowed domain remains a release check; no agent setting or public deployment was changed.
