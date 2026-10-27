# Project authoring and held companion email

## Disabled hosted authoring storage and caller

The same continuation workflow has a persistent hosted source adapter behind the **unset** `EVZ_OPERATIONS_PROJECT_AUTHORING=fictional-node-v1` flag. It accepts only the existing execution-disabled fictional Deploy Preview namespace. D2 production-shaped records retain their read/private-note allowlist; authoring, transfers and hosted backup remain closed there. No seed, model/provider call, schedule, rasterizer or uploaded executable is added.

The pinned Blobs SDK stores immutable content-addressed 1 MB chunks with strong reads and one immutable job/name manifest. Source and trusted `node-pdf-v1` runtime upload separately as canonical JSON, including all hash-registered font/image/template bytes. Existing limits apply: 4 MB source, 36 MB encoded runtime, the renderer's resource caps, and sixteen separate actual PNG pages up to 16 MB each. Reserve/chunk/complete verifies chunk and whole-file hashes before granting file authority. Transfers cannot name scripts, filesystem paths or arbitrary blob keys. Only the pinned repository Node renderer executes. Existing source/runtime/raster/output manifests and approved original history cannot be overwritten.

Use the signed interactive Node caller from `pipeline`:

```js
import {connectSharedAuthoring} from './hosted-authoring-client.mjs';
import {hash} from './lifecycle.mjs';
const desk = await connectSharedAuthoring({
  origin: process.env.STUDIO_SHARED_DESK_ORIGIN,
  key: process.env.STUDIO_SHARED_OPERATOR_KEY
});
const job = await desk.begin('Exact existing company', 'website-concepts');
// Read its named installed skill, context and exact original PDFs first.
await desk.render(job.id, authoredSource, trustedPortableRuntime);
const pdf = await desk.download(job.id, 'output.pdf');
const receipt = JSON.parse(await desk.download(job.id, 'export.json'));
// Separately rasterize this exact PDF and inspect every actual PNG page.
const raster_review = await desk.rasters(job.id, {
  pdf_sha256: receipt.pdf.sha256,
  rasterizer: 'Exact separately used rasterizer and settings',
  pages: actualInspectedPNGBuffers
});
await desk.complete(job.id, {
  export_sha256: hash(receipt), pages: receipt.pages, raster_review,
  requirements: true, visual_design: true, export: true, notes: 'Actual findings'
});
const held = await desk.inspect(job.id);
await desk.backup('/absolute/private/portable.json');
```

Hashes/layout metadata and successful uploads cannot establish visual inspection. Reviewers must inspect the exact retained PNGs. Both signed operators can retrieve current/retained job files in bounded chunks. Use the existing original client for registered source PDFs; editable-source references identify exact downloadable `authored.json` files. Inspect includes the unapproved version and exact held attachment; baseline approval and sending remain separate.

Fresh requests reopen adapters. Existing context, assignment, baseline, quote and CAS checks protect rendering/publication. Competing/stale output holds and partial files never index a version. After a lost response call `inspect(job.id)` first; `resume(job.id)` verifies the existing export without rendering again. Inspect and explicitly retain partial attempts using `revise(job.id, reason)` before claiming another. Exact completed review retries return the saved result; differing reviews cannot replace it. Commands/effects are never automatically retried.

Hosted backup runs G1's full dependency inventory against originals, editable/context/input/runtime/resources/export/layout/actual-review PNGs and held attachments. A content-bound manifest supplies signed 1 MB reads; `backup` independently validates dependencies before writing the standard schema-2 JSON plus `.files/` sibling. Restore keeps execution disabled. Changed snapshots, missing/corrupt required dependencies or unfinished attempts without an explicit recovery disposition hold complete hosted backup. This bounded reader revalidates the whole inventory per chunk; actual latency/volume/bandwidth/cost and production retention remain unproved.

### Explicit incomplete-attempt recovery

Both signed operators can inspect `await desk.recovery(job.id)` for a current or retained attempt. The preparing operator can close that exact observed attempt:

```js
const observed = await desk.recovery(job.id);
await desk.reconcile(job.id, {
  snapshot: observed.snapshot,
  disposition: 'close-publication',
  reason: 'Interrupted fictional transfer; preserve available evidence and use a new claim.'
});
// If it is still the current Ready attempt:
await desk.revise(job.id, 'Reload context and prepare a corrected attempt.');
```

`Reconciled` closes publication authority for this attempt. It never means the renderer stopped, the export is usable or a design is approved. An original Rendering state is retained as `prior_status`, with `execution: not-attested-stopped`; an operator cannot substitute a stop assertion. A failed `resume` with an incomplete receipt retains uncertain Rendering ownership rather than changing it to Held. Late render/resume/review paths cannot regain authority. Published Review attempts cannot be reconciled. Current assignment/context and all ordinary claim/review guards still govern the new attempt.

The observation covers the closed sidecar allowlist, published/candidate immutable manifests and every expected chunk, with available, absent-at-observation, partial or corrupt dispositions. Available bytes, including attempted source/runtime, output and raster chunks, are copied unchanged into immutable hash-named `.bin` evidence. Candidate manifests alone grant no file authority. The recovery record and state closure use one captured transaction timestamp across awaited evidence writes, so storage latency cannot invalidate an unchanged observation. The workspace and dependency observation hash must still match at closure; a CAS conflict leaves the attempt open and requires fresh inspection. An exact lost-response retry returns its saved closure; a changed reason/snapshot fails. Evidence written before a failed CAS grants no lifecycle authority. An already issued storage write may finish after observation/closure; its outcome stays explicitly uncertain and cannot become a published export. No deletion, cleanup, provider effect or automatic rerender occurs.

G1 includes the exact recovery disposition and all declared evidence bytes and validates them again on restore. This is a complete backup of known incomplete work, with missing/uncertain dependencies explicitly retained. It does not make a partial export suitable for review/approval. Incomplete evidence stays inert under `project-authored/JOB/recovery-HASH.bin`; restore never reconstructs file/export authority or executes it. A new claim needs deliberate trusted runtime binding and the existing original/context checks. Missing/corrupt evidence declared available, every required published original/export/source/review dependency and held attachments still fail closed. No general orphan discovery/garbage collection or remote retention service is introduced.

This closure caller requires the disabled fictional hosted source or the separately disabled exact-bound shared project source. Local CLI backups validate/retain an already reconciled package, but no new local CLI reconciliation command is added. Malformed immutable manifests, unavailable storage and oversized evidence still hold recovery; this is bounded attempt reconciliation rather than universal damaged-storage repair.

Run `node --test hosted-authoring.test.mjs` for real pinned SDK/signed owner-friend fresh-instance, multi-MB resource, actual Node PDF, interruption/context/concurrency/corruption, portable restore and protected-refinement checks. Automated raster-boundary tests explicitly substitute PNGs; private loopback HTTP evidence separately uses actual inspected PDF page exports. Actual remote Netlify execution/storage/timeout/cost, independent devices, computer-off operation, production migration and client acceptance remain unverified. No remote state/configuration or activation changed.

The existing held companion package now has a [disabled exact-message caller](GOOGLE-EXACT-MAIL.md) with a separate signed send approval, exact archived-PDF retrieval and same-intent sender readback. Authoring/export/scope-price approvals still do not authorize sending. No Google grant or real delivery is enabled.

The existing caller executes actual composition for `website-concepts`, `website-refinement` and `client-proposal` Ready items. It consumes saved context, verifies original references and renders a new PDF. The local Python route also rasterizes it; the explicit [Node route](#portable-node-renderer) retains canonical layouts and requires separate actual raster review. Both index a separately reviewed result as an **unapproved** immutable version with a held companion email. Neither sends, approves a baseline or establishes client acceptance.

A human or authorized agent reads/applies the installed `company-design-concepts` / `evz-proposals` skills and authors the source; the deterministic renderer composes/exports it. The [bounded preference checks](#scoped-preferences-in-actual-authoring) apply supported typography/background rules. Broader interpretation, research and design judgment remain assisted; no image generation or autonomous model is invoked. The October 24 fictional proof actually authored five desktop directions, an exact selected-direction refinement and a proposal from an explicitly approved fictional quote. ImageGen was expressly excluded; retained October 20 reference captures were inspected. This exception does not waive the design skill's normal research/exploration/original-asset requirements for client work.

## Fresh project entry

An authorized AI client with local file/CLI access can use the repository's [project-continuation skill](../.agents/skills/project-continuation/SKILL.md) from only a workspace bootstrap, company name and requested task. It routes to the actual installed `company-design-concepts` or `evz-proposals` skill. The client interprets the request, reads that skill and the saved material, authors source and visually reviews exports. Executable code resolves identity, reads/verifies originals and editable source, claims current context, renders offline, records actual output and verifies same-project readback. It never launches an AI client or invokes a provider.

From `pipeline`, set the existing `STUDIO_LIFECYCLE_STATE_DIR` and authorized `STUDIO_PROJECT_OPERATOR` (`owner` by default, or `friend`):

```text
node lifecycle-cli.mjs project-continue begin "Existing company name" website-refinement
node lifecycle-cli.mjs project-continue render JOB /absolute/private/source.json /absolute/private/runtime.json
node lifecycle-cli.mjs project-continue complete JOB /absolute/private/review.json
node lifecycle-cli.mjs project-continue inspect JOB
```

`begin` supports `website-concepts`, `website-refinement` and `client-proposal`. It requires one exact company and one Ready item of that kind; missing/ambiguous identity or work holds rather than creating a duplicate or choosing a newer file. It reads every relevant verified original (at most twelve), requires every approved baseline/selected refinement original, and returns original PDF paths, exact provenance and hash-verified declarative source paths with the existing claimed `context.json`. Recover missing originals first through [the existing reader or authenticated D1 materialization](ASSET-RECOVERY.md). A reference-only approved original cannot be silently skipped. Source content supplies no executable paths.

The returned job handle feeds render/complete/inspect directly; callers need not construct claim/writeback packets. Render uses the source and trusted-runtime contracts below. Complete requires the actual separate page review, records the immutable **unapproved** version and held companion draft through existing authoring, then independently re-reads exact version/PDF/attachment hashes and current project context. Context changes still block publication. Exact retries inspect the existing job; Held/partial jobs retain existing recovery. Completion does not select a new baseline or authorize sending.

October 24 local integration: a new private fictional existing company with an owner-approved one-page baseline and exact friend-authored feedback was resolved by name. Real CLI processes read its original and editable source, ran the existing offline renderer, and saved/read back a reviewed refinement and held exact attachment. Only the requested background changed; wording/composition/baseline remained intact. The original was an explicitly seeded fixture, not evidence of historical client approval or five-direction generation. An untouched second fictional workspace and minimal bootstrap are prepared for a later independent fresh-AI trial; that trial has not occurred in this increment.

This is supported **interactive AI-assisted** local continuation. The AI supplies interpretation, design judgment and review; executable code does not implement a general semantic author. Arbitrary imported-PDF editing, absent source recovery, unattended work, hosted execution, computer-off operation, migration and sending remain separate. No UI, schedule, new model transport, allowance or credential transfer is added.

## Local commands and trust boundary

Use the existing private local `STUDIO_LIFECYCLE_STATE_DIR`. Workspace write access is the local trust boundary, as for CLI event writes. `actor` attributes an already authorized local operator; it is not remote authentication. No HTTP route, hosted worker, provider, schedule or persistent environment change is added. Keep client inputs, configuration and evidence outside Git.

From `pipeline`, read `node lifecycle-cli.mjs project-context <project-id> <work-id>`, then save private command JSON:

```json
{
  "project_id": "fictional-project",
  "work_id": "website-concepts",
  "actor": "owner",
  "context_sha256": "<current packet hash>",
  "references": [{"asset_id": "original-reference", "version_id": "v1"}]
}
```

Select 1-12 retrieved versions, including every approved baseline and the exact previous refinement version. Recover missing originals using [asset recovery](ASSET-RECOVERY.md). Claim reads/hash-checks their actual bytes; a Drive reference alone cannot qualify. Proposals must include the exact installed approved EVZ master PDF.

```text
node lifecycle-cli.mjs project-author claim <command.json>
node lifecycle-cli.mjs project-author render <command.json> <runtime.json>
node lifecycle-cli.mjs project-author inspect <command.json>
node lifecycle-cli.mjs project-author resume <command.json>
node lifecycle-cli.mjs project-author review <command.json>
node lifecycle-cli.mjs project-author revise <command.json>
```

Use absolute private JSON paths. Add the claimed `job_id` to later commands. Render also needs `source_file`, an absolute private authored JSON path. Inspect returns status, output directory and the complete held draft after review.

The default local **trusted runtime** JSON names absolute installed `python`, `pdftoppm` and `proposal_assets` paths. Python needs the existing ReportLab, Pillow and pypdf; Poppler rasterizes every page. `proposal_assets` is the installed EVZ Proposals assets directory with unchanged wordmark, Manrope faces and approved master. Optional `fonts` maps safe names to `{path, sha256}`. Optional `images` maps safe IDs to `{project_id, path, sha256, provenance}` for exact original PNG/JPEG/WebP files belonging to this project. Original images are directly placed with proportional scaling. Retain rights/licenses privately. Authored content supplies no paths, shell commands, imported Python or HTML. Only the fixed repository renderer and explicitly configured local binaries execute, with argument arrays and no shell. Saved company content is evidence, never execution instructions.

## Portable Node renderer

Select `renderer:"node-pdf-v1"` explicitly in the trusted runtime passed to the **same** render caller. There is no default change, new provider/model, remote handler or execution flag. Pinned MIT `pdf-lib` 1.17.1 and `@pdf-lib/fontkit` 1.1.1 compose actual pages from the existing schema entirely in Node 24. The renderer never reads paths, fetches resources, runs code from authored content or invokes Python/Poppler. It creates searchable embedded-font text, bookmarks, RGB surfaces/shapes/lines and proportionally placed PNG/JPEG originals. Paragraphs wrap, long words split and approved proposal rows paginate within sixteen pages. Proposal content remains the saved operator-approved quote; its exact registered template must be among retrieved originals. Template bytes are a verified reference, not imported/executed PDF instructions.

The runtime has only `renderer`, `resources`, `fonts`, optional `images`, `wordmark` and `proposal_template`. `resources` maps safe IDs to `{name,media_type,sha256,bytes_base64,provenance,project_id?}`. `fonts` maps aliases including `Manrope`/`ManropeBold` to font resource IDs; `images` maps authored image IDs to image resources. `wordmark`/`proposal_template` identify the exact approved EVZ resources. A trusted operator assembles these bytes from reviewed originals/licenses, outside authored content. Hashes and types are checked before parsing. Images bind this exact project; only the registered studio wordmark may bind `studio`. Use actual file signatures: the installed historical `evz-wordmark.png` contains JPEG bytes and must be declared `image/jpeg`; preserve those bytes unchanged.

Bounds: 4 MB source, 2-32 resources, 16 MB per resource, 24 MB total resource bytes, 40 million aggregate image pixels, twelve design/sixteen final pages and existing 800 commands/page. Only static TrueType fonts are supported. Missing glyphs, variable/OpenType/CFF fonts, WebP, SVG/HTML/markup, arbitrary imported-PDF editing and unsupported commands hold instead of substituting fonts or silently approximating content. Font measurement and glyph ink bounds catch overflow/descender clipping. Engines can differ slightly in shaping/antialiasing; this is supported declarative parity, not arbitrary PDF editing or pixel identity with ReportLab.

Render retains `input.json`, `authored.json`, portable resource bytes in `runtime.json`, `renderer-evidence.json`, actual `output.pdf`, canonical `page-N.json` and `export.json`. Source/resource/runtime/output hashes, renderer canonical-LF source SHA-256, pinned canonical-LF lockfile SHA-256 and actual Node/dependency versions are retained. The source/lock fingerprint module is checked against both files in tests. Fixed metadata and pinned dependencies make the same inputs byte deterministic under the same tested runtime. Rendering validates in memory and writes the export receipt last; partial writes never index a version. A Rendered job is still **unreviewed**, with no companion draft or baseline approval.

October 26 protocol dependency adoption changed the whole project lockfile without changing the renderer or its six resolved PDF dependency entries (`pdf-lib`, fontkit, standard-fonts, upng, pako and tslib). The canonical-LF lock fingerprint was rebound to that reviewed lock; source/lock assertions and byte-for-byte rendering checks remain mandatory. Any future project lock change requires the same review and fingerprint refresh, including additions unrelated to PDFs. This records runtime provenance rather than changing saved PDF bytes or granting old jobs new execution authority.

**Canonical JSON cannot satisfy visual acceptance.** Rasterize the actual PDF with an independently available local PDF tool, inspect every page, then save a private manifest `{pdf_sha256,rasterizer,pages:["/absolute/private/page-1.png",...]}`. Retain it through:

```text
node lifecycle-cli.mjs project-continue rasters JOB /absolute/private/raster-manifest.json
```

Add the returned object as `raster_review` in the existing review JSON, alongside exact canonical receipt `pages` and separate requirements/visual/export attestations. Complete refuses missing, mismatched or altered actual PNGs; exact raster bytes remain `review-page-N.png` dependencies. This command stores supplied exports and never executes a rasterizer or proves their quality automatically. A host without reviewed raster exports remains unreviewed/held; no hosted rasterizer is installed here.

For a bounded source rehearsal, an existing **controlled fictional** `StudioLifecycle.fromStore` may receive injected `app.originalStore` and `app.authoringStore`. The latter supplies `get(job_id,name) -> Buffer|null` and immutable `put(job_id,name,Buffer)` (throw `EEXIST` on an existing name). Reads/writes use a closed sidecar-name allowlist and exact hash readback. The same claim/context/original checks and atomic lifecycle writeback apply. `beginContinuation` returns context/source objects when paths are unavailable; `renderContinuation` takes the same declarative source as an object; `retainContinuationRasters` takes actual PNG Buffers. This is an internal injected adapter, with no HTTP/auth surface or installed remote sidecar service. Inert D2 and production stores reject it. No canonical migration, shared hosted backup or activation is implied.

October 24 private verification used a **new fictional workspace**, preserving earlier source/output originals. Actual five-direction content retained the reference text/page geometry and registered fonts; inspected raster differences were below 0.36% of pixels, principally shaping/antialiasing. A selected approved direction changed only seven heading-font properties; its baseline stayed approved and the new version stayed unapproved. The five-page proposal retained exact saved scope/terms and $1,500 / $750 / $750 amounts. All eleven real PNG pages were inspected; exact index/held-attachment readback and complete portable backup/restore passed. A bundled Node 24 process with restricted filesystem access, no subprocess permission and network rejected completed the existing conditional-store caller with injected fictional sidecars/originals; its PDF bytes equalled the reviewed five-direction PDF. This proves local host-compatible packaging only. Actual Netlify authoring execution/storage, volume/latency/cost, independent device access, hosted raster QA and computer-off operation remain open.

Verify with `node --test project-authoring-node.test.mjs project-authoring.test.mjs project-continuation.test.mjs lifecycle-backup.test.mjs`, `npm run check` and the full serial suite. Test raster bytes are explicitly substituted unit boundaries; the private proof supplies actual PDF raster/visual evidence. Roll back by omitting `renderer` to keep the default local route; preserve all existing immutable outputs/receipts, with no state rewrite or automatic send.

## Author and inspect

Read `project-authored/<job-id>/context.json` and the originals using the named skill. Source requires `schema_version:1`, exact `kind` and `context_sha256`, `author`, `requirements_review`, `visual_premise`, `limitations` and `questions`. Ask at most three essential questions with `judgment_option:true`; unresolved questions hold rendering. Set `questions:[]` when resolved.

Concept source adds five `directions` with unique safe `id`, `name`, `premise`, `tradeoff` and two or three supporting `sections`. Each direction needs a corresponding actual desktop page. Include recommendation/selection/comparison notes separately from the website composition. Source `pages` contain `title`, `direction`, `width` (1000-1800), `height` (1400-3400), optional RGB `background` and `commands`. Compose independent layouts: the renderer supplies no shared hero or page design. Coordinates have a top-left origin.

| `op` | Fields besides `x`, `y` |
| --- | --- |
| `rect`, `ellipse` | `w`, `h`, RGB `color` |
| `line` | `x2`, `y2`, optional `weight`, RGB `color` |
| `text` | Plain `text`, configured `font`, `size`, RGB `color` |
| `paragraph` | Plain `text`, `w`, configured `font`, `size`, optional `leading`, RGB `color` |
| `image` | Project-owned configured `image_id`, `w`, `h` |

Plain text is escaped before paragraph composition. Out-of-bounds text, unsupported operations, unknown fonts/images, excessive dimensions/counts and changed resource hashes fail. Up to twelve design pages / sixteen final pages, searchable text and direction bookmarks are supported. Inspect original-asset fidelity and actual composition; geometry checks cannot establish creative quality.

Refinement source binds `selected_direction`, `previous_asset_id`, `previous_version_id`, exact `feedback`, `preserves_direction:true` and its actual pages. The existing lifecycle consumes the first free round, requires a specific one-round exception thereafter, prevents direction changes, and separates quoted revision rounds. The author/reviewer must inspect actual design fidelity; a flag cannot establish it.

Proposal source binds `quote_sha256`. The renderer uses the **saved approved quote**, never freeform source overrides: exact scope, deliverables, exclusions, timing, completion, ownership, USD amounts/installments, revisions, changes, cancellation and support. It preserves the EVZ typography, wordmark, margins and investment treatment. Approved `client_inputs` / `third_party_costs` are included; legacy absence is shown as needing confirmation, never an invented vendor price. Either operator's exact scope/price approval qualifies; preparation assignment does not change that identity. Pagination follows content. Client acceptance remains separate.

Run the PDF skill's artifact-operation marker before actual authoring. Render saves `output.pdf`, `page-N.png`, editable `authored.json`, `runtime.json`, retained exact `renderer.py` and final `export.json`. Inspect **every** final PNG. The receipt appears only after PDF parsing, searchable-page checks and complete rasterization; it hashes PDF/pages/resources. Review command JSON adds `review` with `export_sha256` (lifecycle `hash` of parsed receipt), exact receipt `pages`, `requirements:true`, `visual_design:true`, `export:true` and useful `notes`. These are separate inspection attestations, not automatic aesthetic approval.

Review rechecks files/originals/current context, then atomically saves the unapproved asset version, result, provenance and held draft. It requires the preparing operator's configured name and usable project email. The draft binds recipient, branded sender/body, attachment asset/version/hash/size, source reply/quote and preparer. No native draft/send action is created; existing information/native/sent/uncertain history is preserved. Exact human send approval and a supported attachment delivery path remain separate future work.

## Scoped preferences in actual authoring

`asset_feedback_added` retains the exact quoted text, signed actor, source version, source project when available, resolved scope, selection/reason and the baseline/approval identity observed when saved. The current context adds `source.design_preferences`: interpreted feedback, active constraints, unresolved conflicts and repeated suggestions. **Automatic** (`scope:"auto"`, also the omitted-scope API default) applies feedback to the current project unless it is an unqualified supported whole-sentence **Always use** or **Never use** direction; those establish studio-wide standards visible in other projects. Either operator can establish a standard. An explicit `scope:"project"` or `scope:"studio"` selection always wins. The Assets form shows these choices and the saved scope rationale. An automatic request may name its source project even when the resolved rule is shared; an explicit studio request must omit `project_id`. No repetition promotes anything or changes model weights. Earlier saved scopes are never reinterpreted or rewritten. Existing feedback lacking the saved baseline identity is retained as stale for review.

The intentionally small whole-sentence grammar is case-insensitive, with optional final period:

```text
Always use "Syne" for heading font.
Never use "Manrope" for body font.
Use "#F5ECD9" for page background.
Maybe use "Mono" for body font.
```

Supported targets are `heading font`, `body font`, and `page background`. Font values must be configured safe font names; backgrounds require an exact six-digit RGB color. Quoted values are required. `Use`/`Always use` are explicit positive instructions; `Never use` is a constraint checked against the actual authored commands. `Maybe use`, unrecognized language, multi-sentence comments and general judgments such as “less generic” remain tentative. Two matching tentative comments in the same scope suggest a possible standard, with source event IDs, but do not become active instructions. The author reads the actual comment and records `preference_review:[{feedback_id,decision,notes}]` for every tentative/stale item; decisions are `defer`, `applied by author`, or `preserved baseline`. That record is an attributed interpretation, not machine evidence of semantic understanding or approval.

Only the supported unqualified Always/Never grammar gets automatic shared scope. Entire quoted client sentences, attributed client text and project-bound prose such as `For this project, always…` remain tentative and project-scoped under Automatic. Wider natural-language scope interpretation remains open; this grammar does not claim general understanding.

Render applies positive rules to **actual page/command properties** before composing the PDF. Text/paragraph commands must have author-assigned `role:"heading"` or `role:"body"` whenever typography rules apply. Negative constraints reject a forbidden result rather than choosing an arbitrary alternative. The original submitted `input.json` is retained beside the transformed `authored.json`. Its `preference_application` binds the current plan hash, exact evidence and baseline comparison; review recomputes the same checks before indexing it in provenance. Font loading, text bounds and every-page visual inspection still apply. Role classification, creative quality, hidden/overpainted content and external image fidelity need author/reviewer judgment.

Both operators have equal authority. Incompatible rules preserve the last approved property until **both** give fresh matching directions after the conflict. A newer direction by just one operator cannot clear it. A studio rule conflicting with a project rule holds the property until their scopes are explicitly reconciled. Latest positive instructions supersede that actor's earlier positive instruction in the same scope/target; multiple distinct negative constraints remain active. An explicit opposite instruction for the same value supersedes that actor's earlier constraint; the other actor's conflict remains protected. Attempting to approve a different asset version while scoped conflicts remain enters the existing two-operator dispute flow, retaining the baseline until both freshly choose the same version.

For a refinement of an **approved locally authored mockup**, the selected source must be the current approved version. The CLI hash-verifies its retained declarative source, selects the exact direction, and compares actual pages: wording, geometry, images, command order and every property except the supported explicitly reopened properties must remain identical. Conflicting properties are restored from the baseline; an open asset dispute preserves the entire approved page. A missing/ambiguous source or nonuniform conflicting property holds output. Imported PDFs without a verified declarative source cannot use this automatic comparison; recover/review their source before changing an approved mockup. This bounded CLI does not infer approval to reopen arbitrary wording/layout from prose. Other referenced approved assets still rely on verified originals and the explicit human visual review, rather than a claim of automatic pixel comparison. The manual output-registration form remains an operator export attestation and does not run the local renderer checks.

Changed feedback, notes, approvals, assignment, source or stops invalidate an in-flight claim through the existing exact-context guard. A new baseline makes earlier project feedback stale for review. Explicit studio standards remain active across source-version changes, with that change visible in the packet; an artifact approval does not silently revoke a shared standard. Ask at most three consequential unanswered design questions, with “Use your judgment”; this never supplies approval or resolves an operator conflict. No questions are necessary for a fully specified fictional refinement.

The separate October 24 F5 private rehearsal re-rendered retained fictional direction source into a new workspace, approved its baseline, then executed an actual CLI refinement with Syne/Outfit and the requested background. It checked exact unchanged wording/composition and held attachment hashes, project isolation, explicit studio scope, repeated suggestions, conflict/fresh agreement and stale-context rejection. Initial label corrections and an unused stale claim were retained. It did not alter previous proof files or establish general natural-language semantics, unattended authoring, hosted execution or client acceptance.

## Recovery and preservation

One work/context/attempt has one durable claim. Exact claim/review retries read back the saved result. `Rendering` reserves execution first; another render call inspects instead of duplicating output. After a lost response, establish the owned process has ended, then resume from the complete receipt. Missing/partial/corrupt files become Held and never silently rerender. Changed context, replies, stops, assignment or baselines block publication after rendering too.

To correct an inspected layout or recover a Held attempt, revise requires a reason and retains the old attempt before a new claim. It rejects published Review output and still-Rendering jobs. Reload current context; the new attempt uses a new directory/ID. Published refinements use the existing selected-version lifecycle. No original/baseline is overwritten. Authenticated project-asset reads verify new PDFs from `project-originals/SHA256.pdf`. The [standard local backup package](LIFECYCLE.md#complete-local-backup-package) now retains declared original PDFs, context/input/editable source, complete export receipts/PDF/pages and configured original images. Source/runtime/resource/provenance hashes and held drafts remain bound to the same versions. It excludes executable scripts and trusted tool binaries: restored `renderer-evidence.json` retains the original renderer digest, while immutable `runtime.json` is historical evidence. Complete exports can be inspected/resumed without executing old code. Before a new render, explicitly supply newly trusted Python, Poppler, installed proposal assets/fonts and image paths; restored image bytes are under `project-authored/JOB/image-ID.EXT`. No hosted/production migration is implied.

## Verification and limits

Run `node --test design-preferences.test.mjs project-authoring.test.mjs project-work.test.mjs project-assets.test.mjs`, `npm run check` and the full serial lifecycle suite. State tests explicitly substitute the renderer boundary and cover claims, source gates, restart/readback, partial files, stale evidence, corruption, quote approval, exact output/email hashes and uncertain-history preservation. Run `python project-authoring-render.test.py <absolute-private-runtime.json>` with the configured document Python to check actual PDF/PNG/original-image output, literal text, clipping, unsupported operations and changed resource hashes; temporary test files are removed automatically. The separate offline proof really invoked CLI/ReportLab/pypdf/Poppler, inspected every final page and retained corrected attempts. This proves local agent-assisted composition, not unattended semantic authoring, external sending, responsive behavior or real client acceptance. No UI changed.

## Disabled shared production-shaped continuation

The separate [shared project capability](SHARED-PROJECT-CONTINUATION.md) connects exact production-shaped records to this existing interactive Node workflow. It requires a fresh workspace/deployment/namespace/manifest binding and a distinct disabled Node flag. It does not widen the original fictional authoring gate, inert notes-only source or manual-call source. Typed authoring transitions replay exact whole-state changes at the bound store and independently check immutable witnesses; original/reference, context/actor, quote, baseline, raster and held-output protections remain mandatory.

Complete hosted backups now transport state snapshots above 3 MB through exact 1 MB state chunks; small backup manifests retain their existing wire form. The authoring client verifies both forms and writes the same strict portable G1 package. This changes transport only; incomplete attempts still need explicit observation/reconciliation, and every published dependency remains required.

The separately disabled [bounded refinement source-generation candidate](REFINEMENT-GENERATION.md) uses a new exact capability and the same authoring/CAS/recovery authority. Old profiles retain provider denials. Generation stops at Rendered; actual raster and human semantic/design review remain required, and no real policy/model/allowance is approved.
