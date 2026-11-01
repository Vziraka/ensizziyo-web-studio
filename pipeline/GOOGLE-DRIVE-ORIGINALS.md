# Disabled direct Drive original reads

The hosted desk can retrieve an exact **already registered PDF** from a future new business Drive grant into the existing D1 original authority. It uses the same asset/version/reference, content-addressed immutable chunks, final SHA-256 verification, authenticated original reader and portable local backup. It does not approve an asset or replace an approved baseline. Default configuration, earlier shared profiles and the D2 inert source remain closed. The exact default-disabled [shared operations successor](SHARED-OPERATIONS-ORIGINALS.md) adds a separately bound production-shaped branch on the dispatch authority.

This is a bounded source increment. Only fictional injected Google HTTP, signed hosted handlers and local Blobs protocol have been exercised. Actual business consent, Google/Netlify compatibility, storage cost/latency, independently enrolled devices and computer-off acceptance remain open. No new permission, client, credential, flag, provider request or runtime migration was performed.

## Caller and authority

`connectSharedOriginals({origin,key}).readDriveOriginal({project_id,asset_id,version_id})` signs in as the individual owner/friend, loads current context and calls `POST /desk/api/project-original/:project/:asset/:version/drive-read`. The JSON body accepts **only** `context_sha256`; there is no caller URL, file ID, token, source metadata, upload or export input. Existing origin/session/CSRF checks apply.

Each explicit call retrieves at most one 1,000,000-byte range. Its small result contains `transfer_id`, `status`, `chunks_verified` and `chunks_total`. Call again deliberately while `Ready`; after all ranges, one additional invocation completes whole-original verification and returns `Verified`, SHA-256 and byte count. No timer, automatic loop, background dispatch or scheduler is installed. Interrupted claims require a fresh explicit invocation after 45 seconds. Concurrent claims and uncertain claim acknowledgements stop the losing caller before provider reads; only read-only GETs may repeat after expiry.

The existing workspace's **private configuration**, not request input, pins `google_drive_originals`:

```json
{
  "account": "ensizziyo@evzdigital.studio",
  "grant_id": "<separately-reviewed-new-drive-grant>",
  "sources": [{
    "project_id": "<registered-project>",
    "asset_id": "<registered-asset>",
    "version_id": "<registered-version>",
    "reference": "drive:<exact-existing-file-id>",
    "name": "<retained-original-name>.pdf",
    "mime_type": "application/pdf",
    "modified_time": "<retained-RFC3339-time>",
    "drive_version": "<retained-positive-integer-string>",
    "bytes": 30591178,
    "sha256": "<retained-64-character-lowercase-SHA256>",
    "etag": "\"<optional-retained-strong-ETag>\""
  }]
}
```

These are invalid placeholders, not a setup instruction or active policy. Maximum 64 exact entries and 64,000,000 bytes per PDF. A registered version with an existing original must keep its hash, size and source provenance. Configuration carries no credentials or resource keys. This task supplies no policy-edit or import API. Folder traversal/listing is absent: the exact registered file allowlist is narrower and sufficient for this task.

The transfer identity binds the private deployment/namespace, exact grant/account/source policy and project context. Progress is a bounded hash-only `state.drive_original_reads[<hash>]` receipt in the existing workspace CAS object (at most 64 receipts). This field does not enter project-content hashes. Claim replacement and final version publication use this same conditional authority; exact live-claim checks inside the lifecycle mutation prevent an expired older finalizer from publishing or overwriting its successor. It contains hashes, counters and claims; it never contains OAuth credentials, resource keys or provider URLs. Each downloaded chunk is conditionally created at the existing D1 content-addressed key. No new database, original index or alternative file authority is introduced. Only D1 completion publishes the verified original to the registered version. A lost completion acknowledgement reconciles through existing version/chunk authority rather than creating another event.

## Exact reads and failure behavior

Before every range, the server checks the independent grant's exact profile/scopes/account/ID/expiry, `about.user.emailAddress`, registered identity, retained PDF MIME/name/size/SHA-256 (when supplied by Drive), modified time, Drive's monotonically increasing version, and download permission. Native Docs, shortcuts, trashed/oversized/unlisted files, stale metadata and download restrictions hold. There is no export, redirect following, alternate account, newest-version substitution or abuse-acknowledgement bypass.

All provider GETs use the fixed `https://www.googleapis.com/drive/v3/` endpoint and one shared 40-second HTTP deadline per invocation. The application ignores `webContentLink`, export links and metadata resource-key values. An optional server-only `EVZ_DRIVE_RESOURCE_KEYS` JSON map can associate exact allowed file IDs with safe resource keys; keys go only into `X-Goog-Drive-Resource-Keys` on that fixed host. They are absent from shared state, replies, errors and portable backups.

Media must return 206, exact `Content-Range`/`Content-Length`, PDF content type, no compression, bounded bytes, the PDF signature on the first range, and the retained ETag when configured. Metadata/ETag are checked before and after every range, across resumed invocations and immediately before final publication. Drift holds the original without carrying approvals to a new version. A changed project or policy requires fresh context and a separately bound read. Network interruption retains a durable claim; missing/corrupt chunks or a wrong final hash hold without a verified original. Held transfers have no automatic reset or destructive cleanup route in this increment.

The final existing D1 completion still reads at most 64 stored chunks, verifies the whole SHA-256 and publishes the small manifest/version record with current-context/configuration CAS. The local proof establishes correctness, **not actual Netlify storage latency within its synchronous limit**. A timeout retains exact retry/reconciliation. Actual hosted latency/cost and any later bounded completion redesign require separate evidence.

## Explicit incomplete-original recovery

G1 holds unresolved `original_transfer` declarations and Reading/Ready/Held Drive receipts. A declared manual chunk is not proof of upload. Either signed operator can explicitly observe and close an exact original dependency through the existing fictional original caller, including on stopped or reassigned projects with fresh context. Earlier shared profiles still deny original POST operations. The separately bounded [shared operations successor](SHARED-OPERATIONS-ORIGINALS.md) adds exact signed reads/recovery without granting generic transfers.

`client.recovery(ids,{kind:'manual'|'drive',transfer_id})` loads current context and calls signed `POST .../recovery`. It binds the whole state/revision, registered project/asset/version/reference, configuration, exact prior transfer/receipt/claim and bounded actual named chunks. `client.reconcile(ids,{kind,transfer_id,context_sha256,snapshot,observed_at,reason,disposition:'close-publication'})` explicitly closes that observation within 45 seconds. Changed state/configuration/chunk observations or an expired observation hold; copying evidence cannot silently extend its lifetime. The closure uses one observed-state CAS and its captured transaction timestamp. Duplicate or lost-acknowledgement requests read back the same retained result without another observation or publication attempt.

Available and corrupt actual chunks are copied, under their observed hashes, to fixed inert `project-originals/recovery-<sha256>.bin` dependencies in the existing immutable store. Missing and read-unavailable chunks retain their exact dispositions without invented bytes. Unnamed Drive ranges are `uncertain-unobserved`, including a possible in-flight/unacknowledged next range. The exact prior receipt, hold, context/policy hashes and claim remain in recovery history, with actor, reason, `export_usable=false` and `execution=not-attested-stopped`. This does not enumerate unknown orphan writes or attest provider/process exit. Invalid or oversized required evidence keeps recovery held.

Closing Reading removes that exact claim's publication authority. Late token/body/chunk/finalization/error callbacks cannot append receipt progress, replace recovery or publish a verified original; immutable orphan writes can remain inert. Closed manual transfers reject upload/completion/re-reservation. A good independently verified original, its baseline, provenance and held attachments survive closure of an unfinished reader, including a lost archive acknowledgement. Completed transfer/Verified receipt metadata alone does not block healthy G1: the recorded chunk hashes must match the actual independently whole-file-verified PDF.

G1 validates observations, dispositions, identities, hashes, sizes and the fixed evidence paths before export and before restore writes. Legacy/schema-2 partial declarations without recovery reject. Local inert restore retains exact observations and bins, with fresh disabled configuration and no new original manifest, credential, lease or execution authority. The existing inert, manual-record, project and earlier dispatch profiles explicitly reject these partial-evidence packages in dry-run and commit before raw writes. Only the exact shared-operations-originals successor supports centrally validated bins through its inert-evidence import path. Bins never enter `originals.put`/publication. Mixed Python history remains retained and can independently block shared installation.

New Drive receipts record their exact registered target. A pre-repair receipt without it can be observed only when its retained policy hash resolves against the exact current fictional source policy; otherwise it remains held rather than acquiring a guessed target. Context-obsolete receipts with a known target remain recoverable.

Run `node --test original-recovery.test.mjs` from `pipeline`, then affected/full checks. Tests use actual signed handlers/CAS and the pinned Blobs SDK with injected fictional IO, including deferred callbacks, signed manual/project/incoming changes, evidence tampering, all four importers, inert restore and complete 31-range PDF preservation. No recovery UI was changed. Real Google/Netlify compatibility, hosted timing/cost, devices, migration and release remain unproved.

## Future new owner consent profile

The existing OAuth state machine accepts explicit `profile: 'drive-originals-readonly-v1'`. Its default Gmail profile, exact scope equality, binding/AAD format, credentials and existing sender/incoming callers are unchanged. The Drive profile has its own callback `/desk/api/google-drive-oauth/callback`, owner-only `/start`, `/callback`, `/disconnect`, and owner/friend metadata-only `/status`. It reuses one-use state, original owner session, PKCE, nonce, verified OIDC identity, encrypted credential storage, refresh claims and local disconnect. It requires a **new, separately reviewed owner consent** for exactly:

- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/drive.readonly`

Google documents `drive.readonly` as broad permission to view/download all Drive files. The exact file allowlist is an application restriction, **not a narrower OAuth folder scope**. `drive.file` alone does not authorize arbitrary existing files. Google app audience/admin classification, restricted-scope verification/security-assessment requirements, retention/privacy and actual grant lifetime must be reviewed before any new consent. External Testing retains the existing seven-day maximum refresh lifetime; no durable organization eligibility is assumed. See [Google's scope table](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [download restrictions/ranges](https://developers.google.com/workspace/drive/api/guides/manage-downloads), and [file metadata/version](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

Future placeholders only: `EVZ_OPERATIONS_GOOGLE_DRIVE_OAUTH=owner-drive-code-v1`, `EVZ_DRIVE_OAUTH_BINDING`, `EVZ_DRIVE_CREDENTIAL_NAMESPACE=evz-drive-credentials-<fresh-reviewed-namespace>`, `EVZ_DRIVE_CREDENTIAL_KEY_ID`, `EVZ_DRIVE_CREDENTIAL_KEY`, `EVZ_DRIVE_CLIENT_SECRET`; optional `EVZ_DRIVE_RESOURCE_KEYS`. Binding has the existing [business client/account/deployment fields](GOOGLE-OAUTH.md), with the distinct Drive redirect. Drive's fresh 32-byte AES key and namespace must be independent of Gmail and business records. The separate read capability would require `EVZ_OPERATIONS_GOOGLE_DRIVE_ORIGINALS=fictional-drive-read-v1` plus existing disabled D1/fictional preview guards. None was configured by this task. A Drive grant cannot satisfy the exact Gmail scope contract; a Gmail grant cannot satisfy this read contract. Existing connector credentials are never reused.

## Verification and remaining scope

Run `node --test google-drive-originals.test.mjs` from `pipeline`, then the existing full checks. The signed caller tests cover both roles, exact allowlist/context/grant/namespace isolation, real OAuth signature/state-machine wiring into Drive, private-key/resource-key isolation, redirects, 401/403, partial/missing/corrupt chunks, final hash, metadata/range/ETag drift, interruption/restart, concurrent claims/CAS conflict/lost acknowledgements, existing verified readback, baseline/history preservation and portable backup/restore. A local loopback HTTP test transfers 30,591,178 fictional bytes through 31 ranges, with a separate valid-PDF private proof. Fully intercepted desktop/narrow callback checks exercise the actual callback HTML/JS without external requests.

No Drive writes, uploads, permissions, sharing, delivery links, Calendar, outgoing email, new renderer, model call, scheduler, production import/activation or real original retrieval is included. Old proofs, canonical records, original Gateway policies and the primary checkout remain preserved. Rollback is source rollback with the new capabilities unset; incomplete immutable objects require deliberate separately reviewed cleanup. Completion is not consent or permission to begin a live provider proof.
