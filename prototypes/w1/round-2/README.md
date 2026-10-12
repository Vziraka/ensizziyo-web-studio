# W1 round two — eight original studio previews

## Question and scope

Which structure introduces the studio's websites, systems, practical automation and AI, and marketing support clearly, while showing design range and keeping navigation effortless?

Ensizziyo requested eight original previews after reviewing A. Before building, the plan was presented in chat: literal service headings, sans-serif type, separate About/Services/Work pages, Explore work and Let's talk actions, restrained motion and depth, and expressive demonstrations within Work. No direction has been selected. This round remains on `feature/w1-design-prototypes`; production is unstarted.

The October 12 positioning revision broadens the copy to the four service areas in BRIEF.md while retaining all eight structures, typography, spacing, colors, motion and separate pages. Let's talk becomes the primary hero action; Explore work is secondary. The inquiry asks what the owner wants to improve. This content revision does not select a layout or authorize production.

The original checkout was clean on main `c7f8e5a15b45e6224c713024c7321a4b64897b84`, matched to origin after fetch. The positioning revision continued from a clean `feature/w1-design-prototypes` at `d7d67c5b57539894bd0abad860c376765b14e6c1`, matching its remote; a fresh fetch confirmed main was unchanged and current. Existing A/B files and evidence are preserved. This directory is a separate experiment, not a production package.

## Directions and tradeoffs

| Preview | Structure | Question |
| --- | --- | --- |
| 1. Studio | Centered introduction and asymmetric work grid | Is a calm, familiar studio hierarchy the strongest default? |
| 2. Focus | Service copy alongside overlapping project surfaces | Does depth make the capability tangible without distracting? |
| 3. Index | Typographic introduction and full-width project rows | Can a compact, browsable portfolio establish authority? |
| 4. Gallery | Dark canvas and selectable large project stage | Does a gallery express range while retaining clarity? |
| 5. Frame | Broad architectural composition and one large project | Can a single strong example carry the first impression? |
| 6. Ledger | Persistent desktop sidebar and compact content canvas | Is direct page navigation worth the less familiar layout? |
| 7. Surface | Live website/interface/product concept tabs inside the hero | Does an immediately usable sample make the interface idea clear? |
| 8. Common | Warm, quiet asymmetry and direct studio introduction | Can a more personal tone still feel precise and premium? |

All previews share the same proposed service areas; each project needs an agreed scope and feasibility check. Work examples are labelled original fictional concept studies, not completed client work. They demonstrate local interface interactions, not working business-system connections, automation or AI. The review area is a visible content placeholder; the proof strip uses only facts about the three concepts, with no invented client testimonial or metric. The public name and founder biography still need approval. Forms use invented details and simulate success without transport or persistence.

## Run

Reuse the W1 server from the repository root:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory prototypes/w1
```

Gallery: http://127.0.0.1:4173/round-2/

Full preview: http://127.0.0.1:4173/round-2/preview.html?variant=1

Each preview has distinct page views for About, Services, Work, a design study, and Let's talk. Query parameters keep the experiment buildless and shareable. Browser Back/Forward works; navigation changes the page rather than scrolling to a section. These experimental URLs do not prescribe production routing.

No installation, external runtime asset, live inquiry destination, analytics, data storage, or hosting is required. Stop only the server you started with Ctrl+C when design review is over.

## References and adaptation

- [NexStudio](https://nexstudio.demos.tailgrids.com/) was read and visually inspected: direct work/contact actions, separate page navigation, work previews, service breadth and compact reviews. No assets, brand, copy, client claims, or distinctive composition were copied.
- Earlier Bright Matter, Bitnomial, and Clarvos references remain quality context, subject to the user's more specific feedback.
- TOOLKIT.md routed the comparison to [Matt Pocock's prototype guide](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md) and [UI reference](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/UI.md). Read October 12, 2026. The user's explicit eight-preview request overrides its smaller default/cap. Each direction has a different hero and work arrangement; shared supporting pages keep the scope proportional.
- For the positioning revision, re-read those prototype references and consult [Humanizer](https://github.com/blader/humanizer/blob/main/SKILL.md) through TOOLKIT.md. Adapted clear service descriptions, concrete problems and restrained claims. No upstream skill or software was installed.
- [Scrollcraft](https://github.com/nateherkai/scroll-craft/tree/main/plugins/nateherk-design/skills/scroll-craft), its taste reference, and hero-depth guidance were read as upstream reference only. Adapted deliberate spacing, offset shadows/overlap, fast transform/opacity transitions, visible controls, and mobile composition. Its engine, cinematic page prescriptions, generated-video workflow, automation, and installation were not adopted.
- Existing Sites local-preview guidance and Ponytail guide the buildless experiment and proportional checks. Existing DM Sans font and original renovation illustration are reused with their prior provenance/licenses. Arc and Forma are original HTML/CSS interface studies with local demo state.

## Recommendation

Start with **1, Studio**. It gives the first audience a familiar, clear service introduction and immediate work/contact actions. **7, Surface** is the strongest alternative for making the interface concepts tangible; it puts more information and interaction into the opening. A possible final combination uses Studio's calm hierarchy and Surface's interactive work presentation on Work. This is a design judgment, not a conversion measurement. W2 still awaits the user's choice.

Focus makes depth visible but needs more room. Index is fast to scan but shows less of each project. Gallery has a strong portfolio presence but depends on strong project material. Frame gives one study room to breathe but can imply a renovation specialization. Ledger offers persistent desktop navigation at the cost of canvas width and familiarity. Common feels personal but delays the interactive concepts. The gallery includes these tradeoffs alongside each preview.

## Draft copy and page structure

The base homepage message is **Websites & business systems.** Supporting text: “Websites, landing pages, business systems and integrations. Practical automation, AI and marketing support for small businesses.” Variants use equivalent literal service headings. **Let's talk** is the primary action; **Explore work** is secondary. The wordmark descriptor is Digital Studio; the internal project name remains unchanged.

About explains the broader scope and direct review relationship without claiming experience, team size or a biography. The Services page and every homepage explain four areas through concrete problems:

- Websites and landing pages: unclear service information, difficult navigation or a campaign needing its own page.
- Business systems and integrations: customer details copied between enquiry forms, bookings and spreadsheets.
- Practical automation and AI: repeat admin, follow-up reminders, draft summaries or replies with human review.
- Marketing support: a new service or campaign needing content, creative, a destination and measurement.

Systems, integrations and AI require feasibility, tool/data access and scope checks; no delivered capability, time saving, leads or revenue is claimed. Hosting, website care, advertising spend and subscriptions remain separately agreed. Work contains Fieldwork (service website), Arc (fictional enquiry interface) and Forma (product campaign page), each explicitly a concept study. No extra AI or integration project was fabricated to imply experience.

The primary inquiry asks for name, email and a short required answer to **What would you like to improve?** Concrete examples help an owner describe the problem. The optional service choice defaults to **Not sure yet** and covers all four areas, Several areas and Agency partnership. Native required/email validation, simulated confirmation, input clearing and Try again remain; all seven service options are valid option elements.

The proof strip counts the three studies in this experiment and names the website/interface and desktop/mobile scope. It does not present client-delivery, revenue or rating figures. The compact review area says an approved quote/attribution will appear there and explicitly claims no client review. Remove the empty area from a public build until genuine feedback is supplied.

## Executed verification — positioning revision

Checks used the existing in-app Chromium browser, existing Node/Python and invented inquiry inputs. No packages or software were installed. All current captures were refreshed for this copy revision. The comparison tiles are browser screenshots, not live embedded pages; the labelled full previews are interactive. Full Services and inquiry captures use the existing `embed=1` option to hide the comparison dock so it does not cover the content.

| Check | Result |
| --- | --- |
| Homepages | Passed: all eight recaptured at 1440 × 1100 and 390 × 1100 CSS viewports, with no horizontal overflow and all images loaded. Each renders four service areas and Let's talk as the primary hero action. Both hero actions fit above 452 CSS pixels on the 390-pixel layouts. |
| Narrow and tablet | Passed: all eight revised homepages at 320 and 768 pixels, without horizontal overflow. The original Surface, footer and Work-grid overflow fixes are retained; styles are unchanged by this revision. |
| Supporting pages | Passed 88 layouts at 1440 and 390: About, Services, Work and Contact in all eight directions, plus all three concepts in Studio/Gallery/Ledger/Surface. No horizontal overflow or unloaded images. Each Services page renders four areas; each inquiry has seven service options and a required improvement answer. |
| Page navigation | Passed through visible mobile controls: About, Services and Work replace the page and focus main at the top. Browser Back/Forward returns to Work/the selected study. |
| Work filters | Passed: Interfaces shows only Arc, with the selected control and live concept-study count. |
| Study controls | Passed: Arc Schedule activated with Enter and displayed the three sample follow-up rows. Gallery switches to Arc/Schedule; Surface switches to Forma/Fieldwork; Forma Ink updates its material; Fieldwork toggles its crop and pressed state. The direction dock cycles Gallery to Frame with the correct URL. |
| Inquiry validation | Passed: missing name, malformed email and missing improvement answer prevent submission. Valid invented input succeeds with the service left at Not sure yet; confirmation explicitly says nothing was sent or saved. Inputs clear; Try again restores the form and focuses name. Practical automation & AI can also be selected. |
| Keyboard focus | Passed: Tab from the service select focuses submit with a visible 3px outline; Enter submits; route changes focus main. Direction selection uses native controls and does not intercept input arrow keys. |
| Comparison | Passed: eight unique preview links, both screenshot modes load all eight captures, no overflow at desktop or a 390-pixel outer viewport. |
| Motion | Page/control/section transitions inspected during use. CSS respects `prefers-reduced-motion` by removing animation and transitions; initial content is visible without an observer or animation. OS preference emulation was not available and was not performed. |
| Syntax / console | Both scripts pass `node --check`. No error/warning entries were returned by the final preview's browser log check. |
| Inquiry boundaries | Source inspected: submit is prevented, no network/persistence/analytics API is used, and user input is never inserted into HTML. |

Desktop evidence: [comparison](evidence/comparison-desktop.jpg), [Studio](evidence/1-desktop.jpg), [Focus](evidence/2-desktop.jpg), [Index](evidence/3-desktop.jpg), [Gallery](evidence/4-desktop.jpg), [Frame](evidence/5-desktop.jpg), [Ledger](evidence/6-desktop.jpg), [Surface](evidence/7-desktop.jpg), [Common](evidence/8-desktop.jpg).

Mobile evidence: [comparison](evidence/comparison-mobile.jpg), [Studio](evidence/1-mobile.jpg), [Focus](evidence/2-mobile.jpg), [Index](evidence/3-mobile.jpg), [Gallery](evidence/4-mobile.jpg), [Frame](evidence/5-mobile.jpg), [Ledger](evidence/6-mobile.jpg), [Surface](evidence/7-mobile.jpg), [Common](evidence/8-mobile.jpg).

Journey evidence: [Services desktop](evidence/services-desktop.jpg), [Services mobile](evidence/services-mobile.jpg), [inquiry desktop](evidence/inquiry-desktop.jpg), [inquiry mobile](evidence/inquiry-mobile.jpg), [full Studio mobile page](evidence/studio-mobile-full.jpg), [review placement](evidence/studio-mobile-reviews.jpg), [Arc schedule](evidence/arc-mobile-interaction.jpg), [Surface product control](evidence/surface-mobile-product.jpg), [keyboard focus](evidence/contact-mobile-focus.jpg), [demo confirmation](evidence/contact-mobile-confirmation.jpg), [gallery on a phone](evidence/gallery-mobile-ui.jpg).

To repeat: open a preview, use Menu on mobile, visit About/Services/Work, filter to Interfaces, open Arc and choose Schedule. Use header Let's talk, submit empty, then with an invalid email, then `Alex Example` / `alex@example.com` and an empty improvement answer. Add an invented problem description and leave the service at Not sure yet; submit with Enter. Confirm explicit simulated success, cleared inputs and Try again. In Surface, select Product campaign and Ink, then Service website and View room detail. Refresh resets local state. No server-side test data needs cleanup.

Limitations: these are eight homepage structures with shared supporting-page implementations styled by direction, not eight finished production sites. No real client quote/metric, delivery, persistence, production stack, hosting or security boundary is implemented. Safari, Firefox, real devices, screen readers and an actual reduced-motion preference remain unverified. Keep this branch unmerged and obtain the design choice before production.

## Initial comparison review passes

Both passes reviewed the same feedback change: base `e86bef0c6259b1eb97014a159a151574df5fec94` to runnable snapshot `3c924e69f18bb2c91e68f8158d8ee01f4a824668`. The main base remains `c7f8e5a15b45e6224c713024c7321a4b64897b84`; the earlier A/B passes are in their historical record. This later record changes documentation only.

**Requirements pass:** Checked the annotations, original-preview answer, amended brief/tasks, gallery and actual browser layouts. All eight explore different hero/work arrangements; copy explains the service and audience directly. About/Services/Work are separate views, contact language is inviting, and the removed motifs do not appear in this round. Review placement, service breadth, expressive work studies, desktop/mobile evidence, tradeoffs and a recommendation are supplied. No choice, client claim, installation or production work is assumed. No outstanding requirement blocks review.

**Engineering-quality pass:** Examined both scripts, their HTML callers, styles, breakpoints, asset paths, route/history state, control semantics and form boundaries against the recorded browser checks. Confirmed the three overflow fixes in their original scenarios. Route/project inputs are selected from fixed lists; rendered HTML contains only authored content; inquiry input is cleared and never interpolated or transported. Separate local-reference checks covered 48 document links, all 16 direction screenshots and shared assets, with no missing target. Syntax, browser-log and Git whitespace checks passed. The implementation remains deliberately buildless and isolated; real delivery, production verification and the documented browser/device limitations remain future work.

## Positioning revision review passes

Both passes reviewed base `d7d67c5b57539894bd0abad860c376765b14e6c1` to runnable snapshot `fbbf6f9c17c61db8a8d9475d87b224788f639685`. This review append and task completion record change documentation only; the checked prototype files and captures remain at that snapshot.

**Requirements pass:** Compared the latest request with the revised brief/tasks, all authored page content, the comparison and current browser evidence. All eight structures and separate About/Services/Work views remain. Every homepage names all four areas and uses Let's talk as primary; Services connects the scope to owner problems. The inquiry accepts an improvement description without a chosen service or technical brief. Work is visibly labelled concept material, and neither the examples nor the broader scope imply delivered integrations, AI or measured outcomes. No real reviews/results, selected layout, installation or production work is claimed. No requirement blocker found.

**Engineering-quality pass:** Read the complete runnable studio script, preview markup and gallery caller at the same head, then compared the affected document/content diff and browser checks. Native required/email validation and all seven valid service options work; the improvement hint is associated with its field. Existing route whitelists, history/focus behavior, filters and concept controls are retained. Authored content is the only HTML source; inquiry input is cleared and never interpolated, sent or stored. Styles, dependencies and the historical A/B source are unchanged. Syntax, whitespace, console and 43 local documentation-reference checks pass; all 16 comparison captures and shared assets exist. The 32 homepage checks and 88 supporting layouts have no horizontal overflow. No engineering blocker found within this isolated design-review scope. Real delivery, device/browser coverage and reduced-motion runtime limits remain as documented above.
