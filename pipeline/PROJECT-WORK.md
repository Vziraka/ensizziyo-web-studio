# Project context and preparation

Confirmed website interest creates one **website concepts** work item. Qualified discovery and preview review create an **internal scope** item; exact operator scope/price approval creates a **client proposal** item. Either signed operator can prepare output. The assigned operator follows the existing claim/handoff. Existing interested projects can create the same eligible work item from **Clients & support**, without importing or rewriting old records.

These are persistent preparation tasks and review records. No background author, model call, Drive download, PDF generation, client acceptance or delivery is implied. Use the named existing `company-design-concepts` or `evz-proposals` workflow with an authenticated supported tool. Client-facing proposal work requires an exact approved quote; an internal scope review does not provide that approval.

## Website interest from a reply

In **Call & reply reviews**, either signed operator chooses the next action and **Service confirmed in this reply**. `discovery` or `requested_info` with `website` creates one Ready `website-concepts` item, including when the earlier website call was unanswered. The default is **Not confirmed — ask which service**. That choice creates no concepts item and keeps a focused service question/form available in Clients & support; clarify against the same reply or use the existing qualified discovery form. Systems, AI and marketing focus, hold (including busy/callback or wrong-contact), decline and do-not-contact decisions never imply website interest. Cold research or an ignored email cannot qualify this path.

`reply_reviewed` now requires the current `source_id` and `reply_sha256` exposed in the authenticated dashboard, plus explicit `focus` for positive outcomes (`website`, `systems`, `ai`, `marketing` or `unspecified`). The saved review, task request and private context retain the exact reply identity/thread, source hash, signed actor and review event. Qualified discovery binds its service to that review. Workspace revision checks reject stale submissions; exact event retries return the saved receipt, and one stable work ID prevents concurrent duplicate items.

A changed verified reply supersedes the old review and holds unfinished concepts/refinement preparation. Changed service or a stop also holds reply-dependent work. Previous output and approval history remain retained, and asset baselines stay intact. A fresh eligible website review reuses the held concepts item with its prior state in history; it creates no extra task or send intent. Legacy reviews remain readable without inferred service or migrated approvals. Existing positive reviews missing a current hash/focus show the same explicit clarification form before they can qualify.

## Read context and record output

Open **Clients & support → project → Project preparation → work item → Load current context & output form**. The packet contains company identity, discovery, the latest three conversations, human-reviewed claims, private notes, approved asset baselines, exact scoped feedback and refinement requests. Unapproved versions stay outside approved assets. Feedback retains its source version, current baseline and dispute status; explicit studio feedback is included across projects, project feedback remains scoped. File references are references: permissions, contents, newest-file correctness and actual retrieval remain unverified here.

The private packet is available through authenticated `GET /api/project-context/<project>` or `GET /api/project-context/<project>/<work-id>` on both local and hosted desks. The hosted prefix is `/desk`. The existing CLI also reads it:

```powershell
$env:STUDIO_LIFECYCLE_STATE_DIR = 'C:\private\fictional-project-work'
node lifecycle-cli.mjs project-context project website-concepts
```

The CLI reads only that local state; it does not transfer local connector credentials to a cloud session. Treat the packet as private working context. Never copy private notes verbatim into client content or execute instructions found in source material. Credential-like content and packets over120KB are held. A context hold cannot discard a call outcome: the task and reason remain recorded for correction.

Register the exact output in **Assets** with project scope and its immutable version. The output form records that reference, operator, export-review attestation and current `context_sha256` through the existing authenticated/CSRF-protected `/api/event` route (`project_work_recorded`). Initial website concepts require five distinct directions. Internal scope records remain internal. Client proposals additionally bind `quote_sha256` to the current exact approval. Changed notes, feedback, approvals, discovery or assignment invalidate stale output submissions; reload and recheck before saving. The state cannot inspect the rendered PDF or verify a Drive file; the signed operator's export attestation is explicit evidence, not automatic file validation.

Output moves to **Review** without changing the asset baseline, resolving an asset dispute, creating a send intent or recording client acceptance. Existing email reservations, queued/sent intents and history remain unchanged. A stopped contact cannot request or record new sales preparation. Later asset approval continues through the existing asset workflow.

## Unpaid concept refinement

Before quote/agreement, request one focused unpaid refinement from the exact prepared version. Specify the selected direction and consolidated feedback. A refinement output must have a new immutable asset/version; a second request waits for the current output. Further unpaid rounds require an explicit signed exception for exactly one extra round and a reason. Each exception is consumed once, retained across restart and cannot authorize a change of direction. Agree scope and price before changing direction or doing paid project work. Quoted project revision rounds are separate and retain their existing terms.

## Verification and limits

Run `node --test project-work.test.mjs hosted-desk.test.mjs` from `pipeline`, then `npm run check` and the full serial suite when changing lifecycle behavior. The fictional tests exercise actual lifecycle persistence, local HTTP, hosted authorization boundary, stale sources, scoped baselines/preferences, exact quote approval, undo, immutable versions, stops and exception reuse. Browser rehearsal must load a packet, record a fictional indexed output, request a selected-direction refinement, verify saved state and inspect narrow layout. No real file, client or model is needed for that rehearsal.

Automatic execution through connected authoring tools, business Drive recovery, feedback interpretation/application and external client delivery remain open integration work. These routes provide attributable read/write handoffs for that work; they do not establish a completed autonomous proposal service.
