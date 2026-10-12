# W1 round two — eight original studio previews

## Question and scope

Which structure combines a clear service offer and effortless navigation with enough visible design range to establish a premium studio?

Ensizziyo requested eight original previews after reviewing A. Before building, the plan was presented in chat: literal service headings, sans-serif type, separate About/Services/Work pages, Explore work and Let's talk actions, restrained motion and depth, and expressive demonstrations within Work. No direction has been selected. This round remains on `feature/w1-design-prototypes`; production is unstarted.

The checkout was clean on main `c7f8e5a15b45e6224c713024c7321a4b64897b84`, matched to origin after fetch. Existing A/B files and evidence are preserved. This directory is a separate experiment, not a production package.

## Directions and tradeoffs

| Preview | Structure | Question |
| --- | --- | --- |
| 1. Studio | Centered introduction and asymmetric work grid | Is a calm, familiar studio hierarchy the strongest default? |
| 2. Focus | Service copy alongside overlapping project surfaces | Does depth make the capability tangible without distracting? |
| 3. Index | Typographic introduction and full-width project rows | Can a compact, browsable portfolio establish authority? |
| 4. Gallery | Dark canvas and selectable large project stage | Does a gallery express range while retaining clarity? |
| 5. Frame | Broad architectural composition and one large project | Can a single strong example carry the first impression? |
| 6. Ledger | Persistent desktop sidebar and compact content canvas | Is direct page navigation worth the less familiar layout? |
| 7. Surface | Live website/interface/product tabs inside the hero | Does an immediately usable sample explain advanced capability? |
| 8. Common | Warm, quiet asymmetry and direct studio introduction | Can a more personal tone still feel precise and premium? |

All previews share the same actual service scope. Work examples are original fictional design studies, not completed client work. The review area is a visible content placeholder; the proof strip uses only facts about the design studies, with no invented client testimonial or metric. The public name and founder biography still need approval. Forms use invented details and simulate success without transport or persistence.

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
- [Scrollcraft](https://github.com/nateherkai/scroll-craft/tree/main/plugins/nateherk-design/skills/scroll-craft), its taste reference, and hero-depth guidance were read as upstream reference only. Adapted deliberate spacing, offset shadows/overlap, fast transform/opacity transitions, visible controls, and mobile composition. Its engine, cinematic page prescriptions, generated-video workflow, automation, and installation were not adopted.
- Existing Sites local-preview guidance and Ponytail guide the buildless experiment and proportional checks. Existing DM Sans font and original renovation illustration are reused with their prior provenance/licenses. Arc and Forma are original HTML/CSS interface studies with local demo state.

## Recommendation

Start with **1, Studio**. It gives the first audience a familiar, clear service introduction and immediate work/contact actions. **7, Surface** is the strongest alternative for making interface capability tangible; it puts more information and interaction into the opening. A possible final combination uses Studio's calm hierarchy and Surface's interactive work presentation on Work. This is a design judgment, not a conversion measurement. W2 still awaits the user's choice.

Focus makes depth visible but needs more room. Index is fast to scan but shows less of each project. Gallery has a strong portfolio presence but depends on strong project material. Frame gives one study room to breathe but can imply a renovation specialization. Ledger offers persistent desktop navigation at the cost of canvas width and familiarity. Common feels personal but delays the advanced work examples. The gallery includes these tradeoffs alongside each preview.

## Draft copy and page structure

The base homepage message is **Web design & development.** Supporting text: “Custom websites and landing pages for service businesses. Clear information, considered design, and a straightforward way to get in touch.” Variants use equivalent literal service headings. The actions are **Explore work** and **Let's talk**.

About explains the direct scope/design/review relationship without claiming experience, team size or a biography. Services explains custom websites, focused landing pages, separately scoped interfaces/integrations and optional website care. Hosting, subscriptions, advertising and custom systems remain distinct scopes. Work contains Fieldwork (service website), Arc (digital interface) and Forma (product experience), each explicitly a fictional original design study. The primary inquiry asks for name, email, project type and optional context.

The proof strip counts the three studies in this experiment and names the website/interface and desktop/mobile scope. It does not present client-delivery, revenue or rating figures. The compact review area says an approved quote/attribution will appear there and explicitly claims no client review. Remove the empty area from a public build until genuine feedback is supplied.

## Executed verification

Checks used the existing in-app Chromium browser, existing Node/Python and invented inquiry inputs. No packages or software were installed. The comparison tiles are browser screenshots, not live embedded pages; the labelled full previews are interactive.

| Check | Result |
| --- | --- |
| Homepages | Passed: all eight inspected/captured at 1440 × 1100 and 390 × 1100 CSS viewports, with no horizontal overflow and all images loaded. Both hero actions fit above 484 CSS pixels on the 390-pixel layouts. |
| Narrow and tablet | Passed: all eight at 320 and 768 pixels. Reproduced and fixed Surface's aspect-ratio/min-height overflow; reran those exact widths and the full set. |
| Supporting pages | Inspected 56 layouts: About, Services, Work, Contact and all three studies, in Studio/Gallery/Ledger/Surface at 1440 and 390. The Work grid initially overflowed on mobile; fixed its intrinsic minimum tracks and rechecked all four families at 390 and 320. Other supporting layouts passed their first check. |
| Sidebar layout | Reproduced desktop overflow from an overly broad width rule affecting the footer. Scoped the rule to page sections and confirmed the same 1440-pixel scenario fits. |
| Page navigation | Passed through visible mobile controls: About, Services and Work replace the page and focus main at the top. Browser Back/Forward returns to Work/the selected study. |
| Work filters | Passed: Interfaces shows only Arc, with the selected control and live result count. |
| Study controls | Passed: Arc Board/Schedule changes the content; Gallery switches studies; Surface switches to Forma/Fieldwork; Forma Ink updates the material; Fieldwork toggles its detail crop and pressed state. Keyboard Enter activates the controls. |
| Inquiry validation | Passed: missing name and malformed email prevent submission; valid invented input shows “Your demo inquiry is complete. No message was sent or saved.” Inputs clear; Try again restores the form and focuses name. |
| Keyboard focus | Passed: Tab from context focuses submit with a visible 3px outline; Enter submits; route changes focus main. Direction selection uses native controls and does not intercept input arrow keys. |
| Comparison | Passed: eight unique preview links, both screenshot modes load all eight captures, no overflow at desktop or a 390-pixel outer viewport. |
| Motion | Page/control/section transitions inspected during use. CSS respects `prefers-reduced-motion` by removing animation and transitions; initial content is visible without an observer or animation. OS preference emulation was not available and was not performed. |
| Syntax / console | Both scripts pass `node --check`. No error/warning entries were returned by the final preview's browser log check. |
| Inquiry boundaries | Source inspected: submit is prevented, no network/persistence/analytics API is used, and user input is never inserted into HTML. |

Desktop evidence: [comparison](evidence/comparison-desktop.jpg), [Studio](evidence/1-desktop.jpg), [Focus](evidence/2-desktop.jpg), [Index](evidence/3-desktop.jpg), [Gallery](evidence/4-desktop.jpg), [Frame](evidence/5-desktop.jpg), [Ledger](evidence/6-desktop.jpg), [Surface](evidence/7-desktop.jpg), [Common](evidence/8-desktop.jpg).

Mobile evidence: [comparison](evidence/comparison-mobile.jpg), [Studio](evidence/1-mobile.jpg), [Focus](evidence/2-mobile.jpg), [Index](evidence/3-mobile.jpg), [Gallery](evidence/4-mobile.jpg), [Frame](evidence/5-mobile.jpg), [Ledger](evidence/6-mobile.jpg), [Surface](evidence/7-mobile.jpg), [Common](evidence/8-mobile.jpg).

Journey evidence: [full Studio mobile page](evidence/studio-mobile-full.jpg), [review placement](evidence/studio-mobile-reviews.jpg), [Arc schedule](evidence/arc-mobile-interaction.jpg), [Surface product control](evidence/surface-mobile-product.jpg), [keyboard focus](evidence/contact-mobile-focus.jpg), [demo confirmation](evidence/contact-mobile-confirmation.jpg), [gallery on a phone](evidence/gallery-mobile-ui.jpg).

To repeat: open a preview, use Menu on mobile, visit About/Services/Work, filter to Interfaces, open Arc and choose Schedule. Use header Let's talk, submit empty, then with an invalid email, then `Alex Example` / `alex@example.com`. Confirm explicit simulated success and Try again. In Surface, select Product experience and Ink, then Service website and View room detail. Refresh resets local state. No server-side test data needs cleanup.

Limitations: these are eight homepage structures with shared supporting-page implementations styled by direction, not eight finished production sites. No real client quote/metric, delivery, persistence, production stack, hosting or security boundary is implemented. Safari, Firefox, real devices, screen readers and an actual reduced-motion preference remain unverified. Keep this branch unmerged and obtain the design choice before production.

## Separate review passes

Both passes reviewed the same feedback change: base `e86bef0c6259b1eb97014a159a151574df5fec94` to runnable snapshot `3c924e69f18bb2c91e68f8158d8ee01f4a824668`. The main base remains `c7f8e5a15b45e6224c713024c7321a4b64897b84`; the earlier A/B passes are in their historical record. This later record changes documentation only.

**Requirements pass:** Checked the annotations, original-preview answer, amended brief/tasks, gallery and actual browser layouts. All eight explore different hero/work arrangements; copy explains the service and audience directly. About/Services/Work are separate views, contact language is inviting, and the removed motifs do not appear in this round. Review placement, service breadth, expressive work studies, desktop/mobile evidence, tradeoffs and a recommendation are supplied. No choice, client claim, installation or production work is assumed. No outstanding requirement blocks review.

**Engineering-quality pass:** Examined both scripts, their HTML callers, styles, breakpoints, asset paths, route/history state, control semantics and form boundaries against the recorded browser checks. Confirmed the three overflow fixes in their original scenarios. Route/project inputs are selected from fixed lists; rendered HTML contains only authored content; inquiry input is cleared and never interpolated or transported. Separate local-reference checks covered 48 document links, all 16 direction screenshots and shared assets, with no missing target. Syntax, browser-log and Git whitespace checks passed. The implementation remains deliberately buildless and isolated; real delivery, production verification and the documented browser/device limitations remain future work.
