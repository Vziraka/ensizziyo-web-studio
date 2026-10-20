# Change review

## Public release review

The owner approved the final preview and directly authorized publication on October 20. Rebased the reviewed branch on 9ad53d4, resolving only the overlapping WORKSPACE.md introduction and retaining the existing owner-email/task-sync checkpoint verbatim. The website, scripts and CI source remain byte-identical to the approved de0dc39 revision; the release update records authorization and the verification/rollback recipe. Both requirements and engineering conclusions below still apply. Required checks run on the updated head before merge, and the [PR117 release record](https://github.com/Vziraka/ensizziyo-web-studio/pull/117) owns deployment and public readback evidence.

## Follow-up requirements pass

Reviewed the follow-up against 74f6181: the owner asked for the orb to flow continuously and supplied the clipped entry-dialog screenshot. The main visual now renders moving particles with a flowing wave, retaining the selected monochrome spherical character and original layout. The static artwork remains available for reduced motion or unavailable Canvas. Native voice/text controls and attribution are visible in the corrected dialog. No provider, agent, prompt, voice, recording or production change is included.

Actual pinned-widget checks reproduced both buttons as clipped before the fix and fully visible afterward at 1280 × 720, 390 × 844 and 320 × 800. The dialog has no horizontal overflow. Keyboard Tab reaches the two native controls and Escape restores the opening action. The local fictional call still shows the latest exchange, reveals the enquiry only after ending and resets correctly.

## Follow-up engineering pass

Reviewed the same follow-up diff separately for drawing bounds, frame scheduling, hidden-page/content pause, reduced-motion changes, resize and page restoration. Browser Canvas and existing browser APIs suffice; no package or external animation service is introduced. The obsolete image animation and background-class listener were removed. Ten tests pass, including deterministic particle movement/bounds and animation lifecycle checks. All 32 module syntax checks, fixture syntax, site build and route/asset/header checks pass.

The dialog fix uses the pinned widget's existing overlay-padding variable and supported placement attribute; no shadow-root style injection or consent bypass is involved. The actual native layout is checked separately from the provider fixture, which cannot reproduce that CSS regression. Successive browser captures differ only within the moving orb; 26,139 pixels in that region changed by more than ten channel levels. Actual-page and fictional-call consoles are clear. Original agent instructions, MP3, deployment configuration and microphone-header generation have no diff against the follow-up base.

Both passes have no blocking findings. A physical-device/OS preference change and fresh spoken conversation remain unperformed; the lifecycle tests simulate preference/visibility changes and the call rehearsal uses fictional callbacks. Public release remains separate.

## Initial implementation review

Reviewed against base 9d1ee0da3238071e20d6e37b6980119f46fc7847 on feature/voice-demo-ui. This document accompanies the reviewed source; CI identifies the committed head.

## Requirements pass

The selected centered white design, dotted waveform, larger typography, immediate live-demo entry, quiet recording alternative, subtle animation and mobile SVG arrows are implemented. The latest actual exchange leads during a call, full transcript remains available, and enquiries stay hidden until disconnect. Booking is the strongest after-call action, email secondary, details below. No-capture outcomes do not show a fabricated lead.

The interface uses the same public agent and pinned embed. Agent prompt/voice/settings, existing recording, calendar destination, deployment configuration and microphone header generation have no diff. Original modified checkout and operational prospect state were not touched. No required behavior or unrequested production mutation was identified.

## Engineering pass

Reviewed lifecycle races, cancelled late connections, original widget callback preservation, tool-field bounds, text-only DOM rendering, transcript ordering, text-send recovery, mode cleanup, focus, relative/public asset paths, mobile overflow and reduced motion. A text-send failure now retains the draft and reports the issue; user text is added before a synchronous callback can reply.

Eight account-free tests pass, covering the existing inquiry service plus bounded demo fields, callback arguments/context/results, stale-session cleanup, unchanged tool/settings bindings and native fallback. Browser rehearsal exercises the actual page module through a separate fictional custom element; the production build never includes it. Site generation, all route/assets and existing microphone-header assertions pass.

The module uses the repository's .mjs convention so the existing Node syntax checks parse imports correctly. The external widget remains exactly 0.20.0; observing its session callback object is a documented, pin-specific compatibility seam. No dependency installation or agent API update is required. A fresh acoustic/live-provider check and physical-device/OS reduced-motion exercise remain release checks, without being claimed by the local fixtures.

No blocking findings remain in either pass.
