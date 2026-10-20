# Voice demo design QA

The earlier operations/email QA is preserved in the [base-revision report](https://github.com/Vziraka/ensizziyo-web-studio/blob/9d1ee0da3238071e20d6e37b6980119f46fc7847/design-qa.md). This report covers the current voice-page change.

final result: passed

## Current follow-up: particle flow and dialog clipping

The owner requested actual continuous flow after learning that the original orb only pulsed, and supplied a screenshot of clipped native controls. The main orb now uses animated dots while retaining the centered monochrome spherical form and quiet visual hierarchy. The original artwork remains the static/reduced-motion fallback and widget avatar. This requested motion change supersedes the initial raster-only asset constraint below.

- Captured successive ready frames: docs/voice-demo-ui/qa/flow-frame-a.jpg and flow-frame-b.jpg. Both are 1486 × 1066 full-page captures from a 1486 × 1059 CSS viewport at density 1. Their difference bounds are (600,448)–(888,736), entirely inside the orb; 26,139 pixels there differ by more than ten channel levels. The surrounding layout stays still.
- The actual pinned widget initially clipped both Start voice demo and Try text instead. Its 140-pixel host minus 32-pixel padding on both edges left 76 pixels for a 104-pixel card. A 180-pixel host, 12-pixel overlay padding and bottom-center placement now contain both controls. No shadow-root CSS injection.
- Corrected native dialog evidence: dialog-fixed-desktop.jpg, dialog-fixed-390.jpg and dialog-fixed-320.jpg in the same qa directory; before evidence: dialog-clipped-before.jpg. DOM geometry confirms both buttons fully visible and no horizontal dialog overflow at 1280 × 720, 390 × 844 and 320 × 800.
- Mobile opening evidence: flow-mobile.jpg. Tab from Close reaches Start voice demo, then Try text instead. Escape returns focus to Talk to Evan. No native conversation was started.
- Ten tests pass, including particle movement/bounds and reduced-motion, hidden-page/content, resize and page restoration. Rendering is capped at 30 frames/second and density 2. The local call/enquiry/reset check and actual-page console checks pass. Physical-device and real OS-preference checks remain unperformed.

No blocking visual or interaction findings remain in this follow-up. The moving particle pattern changes over time, so the original static screenshot comparison remains an initial-layout baseline rather than an exact frame match.

## Initial layout comparison and evidence

- Source visual truth: docs/voice-demo-ui/approved-design.png, owner supplied and selected October 20, 2026.
- Final implementation: http://127.0.0.1:4218/studio/demos/voice/
- Final screenshot: docs/voice-demo-ui/qa/desktop-final.jpg.
- Ready state, white theme. Source and final capture are both 1486 × 1059 pixels; the final CSS viewport is 1486 × 1059 at devicePixelRatio 1. No final density normalization is needed.
- Full comparison: docs/voice-demo-ui/qa/compare-desktop-final.jpg. Both source and browser capture were opened in the same comparison image.
- Focused waveform/control comparison: docs/voice-demo-ui/qa/compare-detail-final.jpg, also opened together.
- Supporting captures: mobile-final.jpg, mobile-call.jpg, mobile-result.jpg, mobile-320.jpg, call-active.jpg and call-result.jpg in the same qa directory. The call captures use explicitly fictional local provider callbacks; a rehearsal-only status at the bottom is outside the product UI.
- The early tab was at 110% zoom. Early v1/v2 comparisons normalized the source to the 1351 × 963 capture. Those checks were followed by the final same-density comparison above; cropped calibration captures were discarded.

## Findings and iteration history

1. Initial full/focused comparison found a P2 scale mismatch in the central artwork and primary control: the extracted transparent artwork occupied less of its canvas than the mock, and the microphone/control looked smaller.
2. Increased the desktop image canvas from 340 to 360 pixels, balanced its margin, set the main control to 310 pixels and its microphone to 30 pixels. Kept the independent mobile sizing.
3. Recaptured and compared v2, then repeated at the final native 1486 × 1059 frame. No actionable P0/P1/P2 differences remain.

P3 polish: the isolated generated waveform has slightly different dot placement and a less pronounced ground shadow than the static mock. Its monochrome character, fold, silhouette and visual prominence are retained. The real Manrope font has minor shape/width differences from generated lettering. No further iteration is required for these small differences.

## Required fidelity surfaces

- Typography: the existing Manrope files are reused; light tightly tracked two-line headline, larger supporting text and readable controls. Mobile body text remains 17–20 pixels with smaller secondary disclosures. No clipped heading or controls in the tested layouts.
- Spacing/layout: centered white stage, generous spacing, pill action, quiet alternative and footer. Compared at full frame and in the artwork/control region. At 390 × 844 the primary button ends at 593 CSS pixels, within the opening screen.
- Colors/tokens: white, #202020 ink, #606060 supporting text, #dadada lines. No olive surfaces or emoji arrows.
- Asset fidelity: a real transparent raster derived from the approved artwork, existing fonts, the actual homepage arrow and licensed Lucide microphone. No drawn asset substitutes. SVG arrows loaded on mobile.
- Copy/content: selected opening wording, Talk to Evan primary, recording secondary, latest exchange during a call, and booking/email/enquiry hierarchy afterward. Fictional details and human confirmation stay explicit.

## Interaction and accessibility checks

- Actual pinned widget loaded its native voice/text controls without starting a live call. Existing terms/microphone steps remain native.
- Fictional local call: latest exchange and full transcript, text send, literal HTML-looking text, recoverable send failure retaining the draft, hidden enquiry during the call, captured result after disconnect, empty/no-capture result, retry and delayed-connect cancellation passed.
- Existing recording played and reached the recorded-example result naturally. The original MP3 and agent instructions are unchanged.
- Programmatic result focus goes to the heading; the next Tab reaches booking. Native dialog focus and close behavior checked. Controls have labels and visible focus styles.
- 390 × 844 and 320 × 800 layouts had no horizontal overflow. Phone conversation and result layouts were visually inspected. No physical-device claim.
- Default subtle animation is present. The final reduced-motion CSS disables animations/transitions; an actual OS preference change was not exercised.
- No console errors in the final actual page or local rehearsal.

## Implementation checklist and limits

- [x] Selected ready layout and responsive presentation.
- [x] Readable call, transcript and after-call states.
- [x] Existing recording, provider/agent ID, booking URL and privacy scope preserved.
- [x] Eight focused tests and site build/asset/header verification.
- [x] Requirements and engineering review, recorded in docs/voice-demo-ui/review.md.
- [ ] Fresh spoken conversation on the published allowed domain, after release. No new live conversation, microphone permission, booking, agent setting change or public deployment was performed for this UI check.

The observer deliberately targets the inspected pinned widget's session callbacks, retaining native UI if the expected object is absent. Its maintenance boundary is documented; fixtures do not establish acoustic or future SDK compatibility.
