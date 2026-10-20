# Change review

Reviewed against base 9d1ee0da3238071e20d6e37b6980119f46fc7847 on feature/voice-demo-ui. This document accompanies the reviewed source; CI identifies the committed head.

## Requirements pass

The selected centered white design, dotted waveform, larger typography, immediate live-demo entry, quiet recording alternative, subtle animation and mobile SVG arrows are implemented. The latest actual exchange leads during a call, full transcript remains available, and enquiries stay hidden until disconnect. Booking is the strongest after-call action, email secondary, details below. No-capture outcomes do not show a fabricated lead.

The interface uses the same public agent and pinned embed. Agent prompt/voice/settings, existing recording, calendar destination, deployment configuration and microphone header generation have no diff. Original modified checkout and operational prospect state were not touched. No required behavior or unrequested production mutation was identified.

## Engineering pass

Reviewed lifecycle races, cancelled late connections, original widget callback preservation, tool-field bounds, text-only DOM rendering, transcript ordering, text-send recovery, mode cleanup, focus, relative/public asset paths, mobile overflow and reduced motion. A text-send failure now retains the draft and reports the issue; user text is added before a synchronous callback can reply.

Eight account-free tests pass, covering the existing inquiry service plus bounded demo fields, callback arguments/context/results, stale-session cleanup, unchanged tool/settings bindings and native fallback. Browser rehearsal exercises the actual page module through a separate fictional custom element; the production build never includes it. Site generation, all route/assets and existing microphone-header assertions pass.

The module uses the repository's .mjs convention so the existing Node syntax checks parse imports correctly. The external widget remains exactly 0.20.0; observing its session callback object is a documented, pin-specific compatibility seam. No dependency installation or agent API update is required. A fresh acoustic/live-provider check and physical-device/OS reduced-motion exercise remain release checks, without being claimed by the local fixtures.

No blocking findings remain in either pass.
