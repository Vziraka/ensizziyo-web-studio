# Recover originals from a fresh context

Give each new client/tool a private bootstrap containing the repository location, authorized state directory and exact company name. For Drive recovery supply the selected business account link/email through environment configuration. A new chat must read this contract and load current state; it does not automatically see another chat's history. Keep client bootstraps, account bindings, originals, private notes and evidence outside Git. Local CLI access relies on authorized OS access to the state directory; it is not remote authentication.

From `pipeline`, with `STUDIO_LIFECYCLE_STATE_DIR` pointing to the authorized workspace:

```powershell
node lifecycle-cli.mjs project-resolve 'Exact existing company name'
node lifecycle-cli.mjs project-context PROJECT_ID
node lifecycle-cli.mjs project-asset PROJECT_ID ASSET_ID VERSION_ID
```

Resolution normalizes Unicode, case and whitespace, then requires one exact name. Missing or ambiguous matches hold for clarification; lookup never creates a duplicate company. Use the returned existing IDs. Context contains all versions alongside approved baselines, disputes and source-linked directions. A proposal file or historical scope approval must not become client acceptance or a selected design. Retain exact approval evidence in existing private notes/source records; this workflow does not synthesize historical approval.

For a registered `drive:FILE_ID` PDF, verify the expected original hash from independent retained evidence, then explicitly recover it:

```powershell
$env:STUDIO_DRIVE_ACCOUNT_LINK='link_SELECTED_BUSINESS_ACCOUNT'
$env:STUDIO_DRIVE_ACCOUNT_EMAIL='business@example.invalid'
node lifecycle-cli.mjs recover-drive-asset PROJECT_ID ASSET_ID VERSION_ID EXPECTED_SHA256
```

This uses the existing deterministic `AppConnectors` dispatcher and saved ChatGPT app connection, with no model turn or inference allowance. Its Drive allowlist is read-only: profile, exact metadata and raw fetch with `include_base64:false`. The profile must match before file reads. The authenticated top-level stream is materialized with HTTPS/provider-host restrictions, no redirects, bounded size and exact hash. Do not print or retain bearer stream URLs; expired streams need a new authorized fetch. Changed context, mismatched source/size/hash or unavailable access fails closed. An original must be an actual PDF, at most 64 MB. Larger files and editable sources remain explicit references until a separately supported bounded reader is implemented.

`verified_original` on an exact version records source identity/reference, account, modified time, MIME, size, SHA-256, recovery time and operator. Every local original read rechecks size and hash. File verification never selects a baseline or implies client acceptance. All versions, including drafts and older files, appear in project context with explicit internal-baseline status. No newest-file or design-selection inference is made. A missing `verified_original` means reference only; an archived copy does not prove current Drive access.

The local archive stores files only as `project-originals/SHA256.pdf` inside the workspace. It never interprets a reference as an arbitrary local filename. Symlinked archive directories/files, unknown versions, cross-project reads and corrupt/missing files fail. All operators retain the agreed project visibility; project assets must belong to the requested project, while studio assets are shared. The [standard local backup package](LIFECYCLE.md#complete-local-backup-package) now includes these exact verified bytes and validates them before restore. Legacy JSON-only backups claiming verified originals are incomplete and must be regenerated from the intact source workspace. No production import or hosted upload is implied.

Authenticated local HTTP clients use `GET /api/project-resolve?name=...`, existing `GET /api/project-context/PROJECT_ID`, and `GET /api/project-asset/PROJECT_ID/ASSET_ID/VERSION_ID`. File responses are attachments with no-store headers and `X-Content-SHA256`; hash them independently. Sign in through the existing bootstrap/login flow with a separately provisioned operator key. Reuse `/api/event` for bounded `note_added` or `asset_feedback_added` events with current revision, same-origin CSRF token, stable event ID and signed attribution. Read context back to verify exact saved text and source version; stale revision fails. This does not apply feedback semantically or authorize new design/quote approvals.

The hosted desk supports name resolution under `/desk`, followed by its existing authenticated context/event routes. It has no local archive or Drive dispatcher transport. Actual connected recovery is Windows-local; another client needs its own authorized transport/bootstrap. Hosted original storage/retrieval, computer-off operation and production migration remain unfulfilled. Do not copy local credentials or browser cookies into a cloud worker.

## Verification

Run `node --test project-assets.test.mjs app-connectors.test.mjs`, `npm run check` and `npm test` from `pipeline`. Tests cover identity ambiguity, signed reads/writes, source/account/hash/size binding, stale context/revision, scope, missing/corrupt files, symlinks and URL/redirect guards. No UI controls change in this increment. Original-byte reads and writeback are exercised over the real authenticated local HTTP server.

October 24 real proof: the business Drive connection and deterministic dispatcher retrieved an existing revision-3 client PDF; all 30,591,178 bytes matched its previously inventoried local SHA-256. Poppler verified 13 pages and the recovered opening page was visually inspected. A separate fresh process given authenticated bootstrap + company name resolved existing IDs, read those bytes, and saved/read back exact notes and version-scoped feedback in a new private workspace. Nine existing PDF versions were indexed/eight archived. The 79 MB historical PDF stays reference-only under the 64 MB limit. Owner-approved proposal scope/price, pending client acceptance and pending design selection remain distinct. This proves isolated recovery, not production migration, hosted originals or authoring. Private redesign evidence owns per-version hashes, source mappings, process proof and review.
