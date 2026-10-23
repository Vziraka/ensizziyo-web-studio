# Private asset references and approved versions

The **Assets** view keeps studio-wide and project-linked file references in the existing private lifecycle state, outside Git. Project references can be added at any sales stage. The index records metadata and operator choices; it does not copy or fetch file contents.

Use a Google Drive file ID as `drive:<file-id>` or a path relative to the authorized private storage root as `private-path:<relative-path>`. Do not paste sharing tokens, credentials, absolute computer paths, or file contents. Give each version a distinct reference. The app cannot verify that a Drive item is immutable or that the referenced file still exists.

Registering a new version never replaces the approved baseline. Either signed operator can approve an uncontested version, and that approval takes effect immediately. A new approval clears the other operator's older selection from the current view; the append-only event history retains it, but it cannot count as a current objection.

Use **Flag disagreement** when an operator explicitly objects to a different version. The last approved baseline stays active while the disagreement is open. Each operator must make a fresh choice within that disagreement; when both current choices match, that version becomes the baseline. A selection from before the disagreement does not count toward its resolution. Event IDs and revision checks preserve attribution and reject stale writes. These are internal asset-reuse decisions, separate from client approval of a proposal or delivery.

This is a reference index, not connected retrieval: no Drive read, permission check, file hash, or cross-device synchronization is performed. Remote authentication, shared hosting, and automatic asset retrieval remain open acceptance criteria.

`asset-index.test.mjs` covers studio and project scope, unilateral approval, stale-choice reset, explicit disagreement, joint resolution, reference validation, and stage independence. `lifecycle-server.test.mjs` covers attributed owner/friend asset decisions over the authenticated API.
