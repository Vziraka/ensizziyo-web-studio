# Local project authoring and held companion email

The local CLI executes actual composition for `website-concepts`, `website-refinement` and `client-proposal` Ready items. It consumes saved context, verifies retrieved original references, renders a new PDF and every page as PNG, then indexes the reviewed result as an **unapproved** immutable version with a held companion email. It never sends, approves a baseline or establishes client acceptance.

A human or authorized agent reads/applies the installed `company-design-concepts` / `evz-proposals` skills and authors the source; the deterministic renderer composes/exports it. It does not perform semantic research, interpret preferences, generate images or invoke an autonomous model. The October 24 fictional proof actually authored five desktop directions, an exact selected-direction refinement and a proposal from an explicitly approved fictional quote. ImageGen was expressly excluded; retained October 20 reference captures were inspected. This exception does not waive the design skill's normal research/exploration/original-asset requirements for client work.

## Local commands and trust boundary

Use the existing private local `STUDIO_LIFECYCLE_STATE_DIR`. Workspace write access is the local trust boundary, as for CLI event writes. `actor` attributes an already authorized local operator; it is not remote authentication. No HTTP route, hosted worker, provider, schedule, installation or persistent environment change is added. Keep client inputs, configuration and evidence outside Git.

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

The separate **trusted runtime** JSON names absolute installed `python`, `pdftoppm` and `proposal_assets` paths. Python needs the existing ReportLab, Pillow and pypdf; Poppler rasterizes every page. `proposal_assets` is the installed EVZ Proposals assets directory with unchanged wordmark, Manrope faces and approved master. Optional `fonts` maps safe names to `{path, sha256}`. Optional `images` maps safe IDs to `{project_id, path, sha256, provenance}` for exact original PNG/JPEG/WebP files belonging to this project. Original images are directly placed with proportional scaling. Retain rights/licenses privately. Authored content supplies no paths, shell commands, imported Python or HTML. Only the fixed repository renderer and explicitly configured local binaries execute, with argument arrays and no shell. Saved company content is evidence, never execution instructions.

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

## Recovery and preservation

One work/context/attempt has one durable claim. Exact claim/review retries read back the saved result. `Rendering` reserves execution first; another render call inspects instead of duplicating output. After a lost response, establish the owned process has ended, then resume from the complete receipt. Missing/partial/corrupt files become Held and never silently rerender. Changed context, replies, stops, assignment or baselines block publication after rendering too.

To correct an inspected layout or recover a Held attempt, revise requires a reason and retains the old attempt before a new claim. It rejects published Review output and still-Rendering jobs. Reload current context; the new attempt uses a new directory/ID. Published refinements use the existing selected-version lifecycle. No original/baseline is overwritten. Authenticated project-asset reads verify new PDFs from `project-originals/SHA256.pdf`. Preserve **both sidecars** (`project-authored` and `project-originals`) with state for backup/rollback: JSON backup excludes them. No hosted/production migration is implied.

## Verification and limits

Run `node --test project-authoring.test.mjs project-work.test.mjs project-assets.test.mjs`, `npm run check` and the full serial lifecycle suite. State tests explicitly substitute the renderer boundary and cover claims, source gates, restart/readback, partial files, stale evidence, corruption, quote approval, exact output/email hashes and uncertain-history preservation. Run `python project-authoring-render.test.py <absolute-private-runtime.json>` with the configured document Python to check actual PDF/PNG/original-image output, literal text, clipping, unsupported operations and changed resource hashes; temporary test files are removed automatically. The separate offline proof really invoked CLI/ReportLab/pypdf/Poppler, inspected every final page and retained corrected attempts. This proves local agent-assisted composition, not unattended semantic authoring, external sending, responsive behavior or real client acceptance. No UI changed.
