# W1 — homepage message and design comparison

October 12, 2026. Throwaway experiment on `feature/w1-design-prototypes`, based on main `c7f8e5a15b45e6224c713024c7321a4b64897b84`. Main was fetched and matched the clean checkout before editing. There was no application or existing user change to preserve.

**Historical first round.** Ensizziyo's annotated feedback requested a new exploration, not a selection of A. [Round two](round-2/README.md) and its [eight-preview comparison](http://127.0.0.1:4173/round-2/) supersede this recommendation. The original source and captures below are retained as evidence of the first review.

## Decision being tested

Which hierarchy best introduces a custom website service to owner-operated local businesses in Fairfax and the DMV and makes the first inquiry clear: an offer-led split layout, or an example-led panorama?

**Selection: pending Ensizziyo's choice. Recommendation: A.** W1 supplies the comparison; W2 records the actual choice and production approach. Do not merge this experiment into main or promote these files directly to production. Preserve this branch as the experiment reference and implement the chosen direction separately after the design decision.

## Run and review

From the repository root, using the existing Python installation:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory prototypes/w1
```

Open [the comparison](http://127.0.0.1:4173/review.html), [A](http://127.0.0.1:4173/?variant=a), or [B](http://127.0.0.1:4173/?variant=b). The server exposes only the prototype directory and binds only to this machine. It needs no environment variables, accounts, packages, build, or external delivery service. A 200 response with the W1 title confirms the expected preview. Stop the instance you started with Ctrl+C in its terminal; do not stop unrelated Python processes.

The comparison's desktop/mobile controls set actual iframe widths to 1440/390 CSS pixels. Desktop frames scale visually to fit the side-by-side review. Scroll inside either frame; use “Open full preview” to read and interact at full size. Each full preview also has a labelled A/B switcher. Left/right arrow keys switch directions when focus is outside interactive controls. The variant is shareable in the query string; switching variants or reloading resets the demo. Section navigation preserves the current interaction state.

All submissions are simulated in memory. Use only invented details such as `Alex Example` and `alex@example.com`. There are no fetches, delivery calls, cookies, analytics, storage APIs, or external embeds. Successful demo submissions clear the form and explicitly say that nothing was sent or saved. These checks do not establish production delivery.

## What differs

| | A — The local studio | B — The digital atelier |
| --- | --- | --- |
| First impression | Warm ivory and green; serif headline beside a compact concept specimen | Dark canvas and lime; large central headline followed by a panoramic concept |
| Information hierarchy | Service and audience → compact example → service details → process → founder → FAQ → inquiry | Brand statement → explorable example and inquiry → process explorer → founder → guided brief |
| Supporting section | Expandable service rows explain the website, landing-page, and optional-care offer | A large concept demonstrates the path to inquiry; process controls explain scope/design/build |
| Primary inquiry | Short native modal, available from the header and hero; name, email, project type, context | Inline two-step brief; project choice first, then name, email, context, with a back control |
| Mobile behavior | Copy first, specimen beneath; direct CTA visible before the example | Left-aligned type, stacked panorama and caption; longer route to the inline brief |
| Strength | Quickly explains what is offered and feels approachable to a small business owner | Makes the design ambition tangible and invites exploration |
| Cost of the choice | Less of a portfolio statement; founder story and the eventual real demonstration must carry credibility | More scrolling, a more abstract headline, extra form step, and greater dependence on strong project material |

Recommend A for the first audience and outreach cycle: the service is explicit near the start and the inquiry is easy to reach. B is a credible alternative if Ensizziyo wants the studio's visual work to lead. This is a design judgment, not a measured conversion result. The palettes, type pairing, and image treatment can be refined after choosing the hierarchy.

## Homepage copy draft

All copy is for review. The public business name, founder wording, commercial terms, and price remain unapproved. There are no invented clients, testimonials, years of experience, or performance figures. The renovation category is an illustrative design subject, not the chosen outreach niche.

### Shared message

- **Audience:** Owner-operated and small local service businesses in Fairfax and the DMV. Agency development partnerships are a secondary conversation.
- **Offer:** Custom websites and focused landing pages that explain the service clearly and make the inquiry step easier.
- **Primary next step:** Tell me about your project. A few details are enough to begin a scope conversation.
- **Boundaries:** Ongoing care, subscriptions, hosting, advertising, and custom integrations are scoped and priced separately. No guaranteed lead or revenue outcome.

### A: hero

**Good work deserves a better website.**

Custom websites for local service businesses. Make what you do clear, and make it easy for people to get in touch.

Primary action: **Tell me about your project.** Secondary: **See what that could look like.**

Clear scope. Thoughtful design. A site you can own.

### B: hero

**Make your business the obvious choice.**

Websites and landing pages for local service businesses. A clear offer, considered design, and an easier way to inquire.

Primary action: **Start a project.** In-page action: **Let's build your next chapter.**

### Services

**A website that does its job.** Your customers should understand what you do, where you work, and how to take the next step.

**Custom websites.** A clear message, a design that fits your business, and a usable path from the first visit to an inquiry. Built for phones and desktops.

**Focused landing pages.** One service, campaign, or offer, explained on a focused page with one clear next step. Advertising spend and campaign management are separate.

**Care when you need it.** Optional updates and ongoing website care, with the tasks, response times, and price agreed separately from your build.

### Concept demonstration

**Good design makes the next step feel natural.** An illustrative renovation website: show the service, let the work speak, and give visitors a clear place to inquire.

Visible label: **Concept only. Fictional business. Illustrative image. No client results.** “Fieldwork” and its renovation inquiry are invented example content. The image does not depict delivered client work.

### Process

**A clear plan. Room to get it right.**

1. **Start with your business.** Talk through your services, customers, and what the site needs to do. Agree a written scope before a quote.
2. **See it before it goes live.** Review the message and design in a working preview. Make the important decisions together.
3. **Leave with a usable site.** Check the agreed inquiry journey, mobile experience, and keyboard access. Document ownership and handover.

### Founder introduction

**A small studio. A direct conversation.**

I'm Ensizziyo. This studio starts with a simple idea: local businesses deserve websites that explain their work with care. We'll begin with your business, agree what's needed, and review the design together.

This is a proposed introduction, labelled as draft in both directions. Confirm preferred public name, voice, biography, and any portrait before production; no experience claims were added.

### FAQ and agency route

**What does a project cost?** The early planning range is $1,500–$2,000+, depending on scope. This is a draft price hypothesis, not a quote. Pages, content, integrations, and revisions are agreed before pricing. Hosting, subscriptions, and ongoing care are separate.

**Will a new site guarantee more leads?** No. A clearer website can make the next step easier, but results also depend on the offer, traffic, market, and follow-up. No lead or revenue guarantee is included.

**Can you work with an agency?** Yes, agency development partnerships are a separate conversation. Share the project, delivery needs, and responsibilities so we can assess the fit.

Secondary action: **Agency project? Let's talk.** In A it opens the same inquiry with “Agency partnership” selected; B includes that choice in the brief.

### Closing and confirmation

A: **Your work is worth a closer look.** Tell me about your project. A few details are enough to start a conversation.

B: **Let's give your work a home.** Tell me a little about your business and what you have in mind. We'll use that as the starting point for a scope conversation.

Prototype notice: **Prototype only. Use made-up details; nothing is sent or saved.**

Demo confirmation: **Your demo inquiry is complete. No message was sent or saved.** In production, confirm only after delivery to the agreed destination succeeds; define failure handling in W2/W3.

## References consulted, without installation

Design references were read and visually inspected on October 12, 2026:

- [Bright Matter](https://brightmatterdesign.com/): generous editorial typography, restrained color, and breathing room informed A's tone.
- [Bitnomial](https://bitnomial.com/): disciplined alignment, spacing, and clear section structure informed both layouts.
- [Clarvos](https://www.clarvos.com/): dark/light contrast and concrete visual explanation informed B's example-first presentation.

The layouts, mark, copy, and imagery here are original; no reference assets, brand marks, testimonials, or distinctive page composition were copied.

TOOLKIT.md routed this task to [Matt Pocock's prototype skill](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/prototype/SKILL.md) and [UI reference](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/prototype/UI.md), and [pstack's prototype playbook](https://github.com/cursor/plugins/blob/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def/pstack/skills/poteto-mode/playbooks/prototype.md). These were read as guidance: define a design question, isolate disposable code, compare real structural alternatives behind a switcher, stub mutations, and verify in the browser. The project requires two directions rather than upstream's default three. No upstream orchestration, package, plugin, skill, canvas, or browser CLI was installed.

Existing session capabilities used: Sites local-preview guidance, Ponytail for minimal source/dependencies, the available browser tools for runtime checks, Google Drive read access for the linked operating plan, and built-in ImageGen for an original illustrative asset. No cloud files were edited, Site registered, or application published.

## Assets

- `assets/mark.svg`: original temporary geometric E mark; public identity remains undecided.
- [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans) and [Instrument Serif](https://github.com/google/fonts/tree/main/ofl/instrumentserif): self-hosted font assets, with their SIL Open Font License files retained beside them. Downloaded as design assets; no font or software installation.
- `assets/renovation-concept.png`: original illustrative asset generated with the built-in ImageGen tool. It is shared by the two directions to keep the content comparison fair. Saved in this prototype directory; no runtime dependence on the generator's original output path.

Final ImageGen prompt:

> Use case: photorealistic-natural. Asset type: original photograph used inside a fictional home-renovation website concept, not a real completed client project. Create a high-end architectural editorial photograph of a thoughtfully renovated modest Northern Virginia home kitchen: natural white oak lower cabinets and tall cabinetry on left, creamy limewash walls, a large central light beige stone island, a couple of simple stools, brushed metal fixtures, large windows on right looking onto soft green garden, calm afternoon sunlight creating diagonal shadows. Lived-in small touches: ceramic bowl, branch in a vase, folded linen. Modern but attainable, restrained material palette of cream, warm oak, forest green exterior. Wide landscape framing, 1536x1024 composition, eye-level architectural photography, realistic material texture and natural photographic grain. The island and cabinets must read beautifully when cropped to a wide 2:1 landscape or a central square. No people, logos, lettering, text, watermark, interface, or rendered website.

## Verification evidence

Browser checks use the available in-app Chromium browser and invented inputs. The desktop captures show a 1440 × 1200 CSS viewport; mobile overview captures use 390 × 1400 to show more of the composition. Normal phone interactions were also checked at 390 × 844, with narrow-layout checks at 320 × 740 and an additional 768-pixel layout check. The comparison uses actual iframe widths, not screenshots presented as live pages.

| Check | Result / evidence |
| --- | --- |
| Server health and correct page | Passed: HTTP 200 for `/` and `/review.html`, expected W1 titles |
| JavaScript syntax | Passed: `node --check prototypes/w1/prototype.js` |
| Desktop layouts and assets | Passed: both directions inspected, no horizontal overflow, all images loaded |
| Mobile / narrow layouts | Passed: both directions at 390 and 320 CSS pixels; no horizontal overflow or controls outside the viewport |
| Live comparison | Passed: real 1440/390 iframe viewports and both device controls; repaired the desktop grid's intrinsic iframe overflow and verified the review page fits |
| A inquiry | Passed: missing name and invalid email block submission; valid invented details produce the explicit demo confirmation; reset works |
| A keyboard | Passed: Tab enters the labelled form with a visible outline; Escape closes the native modal and returns focus to its trigger |
| B inquiry | Passed: no project choice blocks Continue; radio arrow keys select a project without switching variants; Back preserves the choice; invalid email blocks; valid details produce the explicit demo confirmation |
| B concept and process | Passed: concept view switches, fake estimate request explains that nothing was sent, process controls update their copy, Enter activates the selected process button |
| Section-navigation state | Passed after repair: choosing Build and navigating to the inquiry retains Build; fragment navigation no longer rebuilds the variant |
| Reduced motion | CSS inspected: scrolling is immediate; transitions are disabled and the specimen rotation is removed under `prefers-reduced-motion: reduce`; OS preference emulation not performed |
| Transport / persistence | Source inspected: all forms use prevented browser submissions; no network or storage APIs exist in prototype scripts |

Review boards: [desktop comparison](evidence/comparison-desktop.jpg), [mobile comparison](evidence/comparison-mobile.jpg). Overview captures: [A desktop](evidence/a-desktop.jpg), [B desktop](evidence/b-desktop.jpg), [A mobile](evidence/a-mobile.jpg), [B mobile](evidence/b-mobile.jpg). Supporting/inquiry evidence: [A mobile service rows](evidence/a-mobile-support.jpg), [A mobile confirmation](evidence/a-mobile-inquiry.jpg), [B mobile confirmation](evidence/b-mobile-inquiry.jpg), [B concept interaction](evidence/b-mobile-concept.jpg).

Repeat the important journey checks through the visible controls: open A's inquiry, attempt it empty and with an invalid email, then submit invented valid details and close with Escape. In B, switch the concept view, submit a fictional concept request, explore the three process controls, and complete the two-step studio brief including Back and an invalid email. Refresh between directions when a fresh demo is needed. No server-side state needs cleanup.

This prototype has no production stack, build pipeline, test suite, live destination, persistent data, or deployed hosting. These belong to W2/W3 once the design is selected. Safari, Firefox, physical-device behavior, screen-reader behavior, actual reduced-motion preference emulation, production security, and real delivery remain unverified. Prototype source is a design reference, not production-ready code.

## Review passes

Both passes examined the same change, base `c7f8e5a15b45e6224c713024c7321a4b64897b84` to prototype snapshot `ce2a5c43b867ce928aa14614494fccec6fddf2ae`. This later documentation update records the results without changing the runnable source or assets.

**Requirements pass:** Compared BRIEF.md, W1's completion criteria, and the request with the copy and actual browser experience. Both directions contain the service/audience/next step, a distinct hero and supporting hierarchy, and a simulated primary inquiry. Desktop/mobile evidence, tradeoffs, and a recommendation are linked. Concept claims are labelled, the price and biography remain draft, installation was avoided, and production work waits for the user's choice. No W1 requirement is left outstanding.

**Engineering-quality pass:** Reviewed the HTML, event handlers, form state, CSS breakpoints, asset references, and preview boundaries. Browser checks confirmed the navigation-state repair, grid overflow repair, keyboard handling, and demo confirmations. User text is never inserted as HTML; there is no delivery or persistence boundary to expose. The preview binds to loopback and serves only the experiment directory. JavaScript syntax, local references, SVG parsing, and Git whitespace checks passed. No unresolved issue blocks design review; production verification remains a separate milestone.
