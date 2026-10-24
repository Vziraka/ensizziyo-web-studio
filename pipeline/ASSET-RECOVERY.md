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

The hosted desk supports name resolution and context/event routes under `/desk`. The separately disabled shared-original candidate below connects the same asset/version records to private chunk storage. Drive recovery remains local; no Drive dispatcher or credential transfer is added to the host. Actual hosted original execution, computer-off operation and production migration remain unfulfilled.

## Verification

Run `node --test project-assets.test.mjs app-connectors.test.mjs`, `npm run check` and `npm test` from `pipeline`. Tests cover identity ambiguity, signed reads/writes, source/account/hash/size binding, stale context/revision, scope, missing/corrupt files, symlinks and URL/redirect guards. No UI controls change in this increment. Original-byte reads and writeback are exercised over the real authenticated local HTTP server.

October 24 real proof: the business Drive connection and deterministic dispatcher retrieved an existing revision-3 client PDF; all 30,591,178 bytes matched its previously inventoried local SHA-256. Poppler verified 13 pages and the recovered opening page was visually inspected. A separate fresh process given authenticated bootstrap + company name resolved existing IDs, read those bytes, and saved/read back exact notes and version-scoped feedback in a new private workspace. Nine existing PDF versions were indexed/eight archived. The 79 MB historical PDF stays reference-only under the 64 MB limit. Owner-approved proposal scope/price, pending client acceptance and pending design selection remain distinct. This proves isolated recovery, not production migration, hosted originals or authoring. Private redesign evidence owns per-version hashes, source mappings, process proof and review.


## Disabled shared original candidate

The existing `@netlify/blobs` 11.1.6 store holds immutable PDF chunks in the same explicitly fictional namespace as its 2 MB conditional workspace. No second database or project index is introduced. `project-assets.mjs` now accepts an original byte-store adapter while retaining its local filesystem archive. The default deployed desk does not enable this route. In addition to the existing exact HTTPS origin, separate signed operator sessions, CSRF, `deploy-preview` context and `fictional-preview` controls, every shared-original operation requires `EVZ_OPERATIONS_SHARED_ORIGINALS=fictional-chunks-v1`. This task sets no environment variable. Production and non-fictional state still fail closed.

Netlify currently documents a [6 MB buffered request/response limit, effectively about 4.5 MB for binary requests, and a 20 MB streamed response limit](https://docs.netlify.com/build/functions/configuration/). A known 30,591,178-byte original cannot use one such request or response. The candidate therefore transfers **1,000,000-byte chunks**, at most 64 chunks within the existing 64,000,000-byte PDF bound. Completion and manifest responses are small JSON; no PDF is encoded into workspace state. Each function invocation remains subject to the platform's 60-second execution limit. Completion sequentially verifies at most 64 stored chunks and publishes one small manifest; actual Netlify latency/capacity and included credits are unproven. A timeout or lost completion response needs exact readback/retry, never an assumed success.

The [Blobs documentation](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) defines strong reads and conditional creation. Chunks and the byte manifest use `onlyIfNew`, followed by exact readback after a lost acknowledgement or an existing key. Only the existing workspace CAS grants an original to a registered version; storage keys alone grant no retrieval. No mutable chunk counters or additional lock database are used. The namespace is site scoped, so a later approved candidate must retain its explicit fictional isolation; it must never point at production data.

Both operators retain equal project visibility. Every route checks the registered project/asset/version scope before resolving internal storage keys. Clients cannot supply a blob key, path, public link or bearer download URL. Every response is private `no-store`, including Netlify CDN control. Reads require the same signed operator session and origin checks as the desk; writes additionally require its signed CSRF cookie/header. The standalone Node client bootstraps and signs in using its own separately provisioned operator key, keeps its cookies only in memory and rejects redirects. It does not copy browser cookies or local Drive credentials.

For exact IDs `PROJECT/ASSET/VERSION`, the interface is:

- `POST /desk/api/project-original/PROJECT/ASSET/VERSION/reserve`: current `context_sha256`, normalized source provenance and manifest (`format: project-original-chunks-v1`, whole `sha256`, `bytes`, `chunk_size: 1000000`, ordered chunk hashes).
- `POST .../chunk/INDEX`: exact chunk bytes as `application/octet-stream`, plus `X-Studio-Transfer` from the reservation.
- `POST .../complete`: the exact `transfer_id`. All chunk lengths/hashes, PDF signature and whole-file hash must match before `verified_original` is registered through the existing archive contract.
- `GET .../VERSION`: registered verified-original provenance and bounded byte manifest.
- `GET .../chunk/INDEX`: at most 1 MB, with `X-Content-SHA256`. The client independently checks every chunk and the final original hash before returning bytes.

A reservation is bound to the selected IDs, source reference, expected whole hash/size, ordered chunk hashes and current project context. Repeated exact uploads and completions are idempotent; either operator can resume the same transfer after reconnect. A changed project context holds further chunks/completion until a fresh current-context reservation of those same bytes. Conflicting bytes for that version require a new registered version. Missing/corrupt/wrong-size chunks or a wrong whole hash never create a new verified original. A final CAS loss can leave unreachable immutable storage; it cannot approve a draft or change a baseline. Incomplete immutable files remain in the fictional namespace for deliberate later cleanup; no automatic deletion or quota reclamation is implemented. Source provenance is the signed operator's retained exact source claim, not a fresh verification of Drive access.

An already verified version retains its original recovery attribution and provenance. A shared upload verifies storage availability without replacing it. The supported CLI uses the authorized local workspace's existing exact records:

```powershell
# Separately provision these through environment configuration; never save keys in Git.
$env:STUDIO_SHARED_DESK_ORIGIN='https://EXACT-APPROVED-PREVIEW-ORIGIN'
# STUDIO_SHARED_OPERATOR_KEY is this operator's separately provisioned key.
node lifecycle-cli.mjs shared-original push PROJECT_ID ASSET_ID VERSION_ID
node lifecycle-cli.mjs shared-original pull PROJECT_ID ASSET_ID VERSION_ID
node lifecycle-cli.mjs project-asset PROJECT_ID ASSET_ID VERSION_ID
```

`push` reads and independently rechecks the existing local original, then uses the current shared context and exact source metadata. `pull` uses a fresh authenticated client to download and verify the whole original before storing `project-originals/SHA256.pdf`. It requires the local registered version to retain the same reference/hash/size; project-record migration is a separate boundary. It changes no project records or approvals. A Node caller without a local workspace can use `connectSharedOriginals` from `shared-originals-client.mjs` to `resolve`, load `context`, and `download` exact existing IDs. The existing standard local backup then includes materialized original bytes and fails if any required dependency is absent. Shared storage is not itself a complete backup of authoring sidecars or a production migration mechanism.

October 24 verification is **local equivalent/emulator evidence only**: real loopback HTTPS and separate fresh owner/friend CLI processes transferred a valid ReportLab PDF of exactly 30,591,178 bytes in 31 chunks, downloaded through the supported client, materialized it, read it with the existing CLI and restored its complete portable original package. Independent pypdf text/Poppler rendering checks passed. No request/response exceeded 1 MB in that rehearsal. Handler/storage tests cover missing/corrupt chunks, whole-file mismatch, stale context during verification, scope/guessed version, CSRF/origin/session rejection, disabled/production guards, concurrent reservations, immutable retries and lost state acknowledgements. No browser UI changes require a new visual flow check. No real Netlify original upload, remote credits test, real client migration, independent-device login or computer-off execution occurred.

The next integration boundary is a separately reviewed, coherent project-record/dependency migration and bounded fictional hosted storage/cost/latency proof, plus independent fresh-AI validation of the supported [project continuation entry](PROJECT-AUTHORING.md#fresh-project-entry) (G3). Existing original metadata alone must never be treated as proof that the shared chunks exist. Unattended semantic execution, delivery, all Gateway allowances and production activation remain separate and disabled.

## Disabled direct Drive original source

The existing shared-original client can now request one bounded read of an exact registered allowlisted business Drive PDF into this same D1 authority. The [direct Drive contract](GOOGLE-DRIVE-ORIGINALS.md) owns the separate future owner read-only consent profile, signed caller, metadata/version/range checks, durable resume, immutable chunks and remaining live/hosted limits. Default and D2 remain closed; historical connector recovery above is preserved.
