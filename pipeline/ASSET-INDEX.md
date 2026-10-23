# Private asset references and approved versions

The **Assets** view keeps studio-wide and project-linked file references in the existing private lifecycle state, outside Git. Project references can be added at any sales stage. The index records metadata and operator choices; it does not copy or fetch file contents.

Use a Google Drive file ID as `drive:<file-id>` or a path relative to the authorized private storage root as `private-path:<relative-path>`. Do not paste sharing tokens, credentials, absolute computer paths, or file contents. Give each version a distinct reference. The app cannot verify that a Drive item is immutable or that the referenced file still exists.

Registering a new version never replaces the approved baseline. Each signed operator selects the version they approve for reuse. The baseline changes only when the current owner and friend selections point to the same version; if they differ, the last shared baseline stays in place. These are internal asset-reuse decisions, separate from client approval of a proposal or delivery.

This is a reference index, not connected retrieval: no Drive read, permission check, file hash, or cross-device synchronization is performed. Remote authentication, shared hosting, and automatic asset retrieval remain open acceptance criteria.

`asset-index.test.mjs` covers studio and project scope, version selection, conflict preservation, reference validation, and stage independence. `lifecycle-server.test.mjs` covers attributed owner/friend asset decisions over the authenticated API.
