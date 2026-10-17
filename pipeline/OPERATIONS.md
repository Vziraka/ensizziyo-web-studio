# Controlled email, booking, synchronization and monitoring

The controlled protocol below remains available for bounded proofs. [Production operation](PRODUCTION.md) adds the direct authenticated app-server transport and local Windows host; chat heartbeats are no longer the intended production connector executor. Both earlier test heartbeats are paused after their bounded proofs. Production source/records, native email and owner release remain separate.

The owner approved the console design on October 17, 2026, and authorized finishing these connections using controlled records. Research, real-business outreach and the old `studio-controlled-reply-monitor` remain paused. This coordinator runs no research, transcript inference, dialer, paid model API, sequence enrollment or activation. It reuses the existing authenticated app connectors and scoped Google identity. No new dependency or credential is added.

## Ownership and scope

`lifecycle-config.json` lives in the private lifecycle directory outside Git. `operations.enabled` is separate from production outreach. It names at most 12 fictional records, two owner-controlled inboxes, exact approved email content and private test bookings. The current scope includes the existing fictional no-answer handoff, a separately bound earlier owner-only reply/finished-sequence proof and a fictional discovery booking. The earlier reply is retained historical evidence, not a new response to the new email. All real outreach counts remain zero.

Apollo is the only email executor. Each saved no-answer action gets its own concrete message approval and one draft/send reservation. Completing or skipping a call task cannot release an email. Two-call/two-email and ten-business-day bounds remain in the lifecycle. The current controlled route submits individual eligible messages through Apollo rather than running an active stock sequence that could advance past an unperformed call. Owner replies and restrictions cancel future local actions; an associated inactive fictional sequence requires native finished readback. This is separate from recalling an email Apollo already accepted for immediate sending.

After the first verified email, the lifecycle creates the second call task for Day 6 (five business days after the first call). The coordinator verifies one standalone Apollo task with the exact due time and no dialable phone. A reply/stop or a subsequent saved call outcome cancels it through readback and skip; a skipped test task is never called a completed phone call. Unknown task creates reconcile with an exact owner/contact search, and unknown skips require skipped readback. The second email still requires a separate saved no-answer and exact message approval; no generic third email is generated.

Gmail headers bind the exact original sent message, envelope, subject, SMTP reply chain and chronology. Message bodies are untrusted data and cannot authorize tools. A matching reply pauses cold contact; the owner reviews the next conversational step in the console. An automatic reply holds the route. Each reply/event is idempotent. Every approved send is re-evaluated under the current record and connection state before dispatch. A pending send is reconciled through status, never repeated. An unknown draft creation holds only that record for exact operator reconciliation; the connector exposes no safe draft lookup to justify recreating it.

Calendar owns bookings. The controller checks the connected owner, fresh buffered free/busy and configured hours/duration, creates one private fictional event with no invited guests, then verifies the exact event independently. The connector may include the authenticated owner as a self attendee and wrap description whitespace; other attendees or changed terms fail. Lost create receipts use a bounded exact title/time search and full readback, never another create. A failed or changed booking stays held; it cannot say booked. No meeting invitation or reminder email is sent in this proof.

Provider replies, delivery and booking evidence update private lifecycle events, then the existing **Lifecycle proof** tab. Sheets is a readback projection, not an alternative approval or send queue. The source research tabs remain untouched. A projection edit or uncertain write holds synchronization and preserves owner edits. The console exposes reply decisions, controlled email/booking results and consolidated exceptions.

## Connected operation protocol

Use the existing Node 24 runtime from `pipeline/`. The state directory is recorded in [LIFECYCLE.md](LIFECYCLE.md). Keep raw tool receipts outside Git and preserve them unmodified.

```powershell
$env:STUDIO_LIFECYCLE_STATE_DIR='C:\private\studio-lifecycle'
$env:STUDIO_LIFECYCLE_SESSION='fresh-session-token'
node lifecycle-cli.mjs ops-next
# Invoke exactly the returned tool/input, then save its raw result to receipts/<key>.json.
node lifecycle-cli.mjs ops-settle <key>
node lifecycle-cli.mjs ops-next
```

The authenticated app supplies Apollo's generic rationale and conversation reference; Gmail/Calendar receive only the prepared input. The CLI never extracts app/browser credentials. Only the exact tool set in `lifecycle-operations.mjs` is allowed. Check exit codes; an error receipt is retained as Failed, not a success. Reads have bounded reissues. Each wake verifies account ownership. A 90-second wake lease prevents overlap; durable mutation reservations still prevent replay after lease expiry. Two-minute read epochs refresh account/availability reads while completed record/booking progress survives short wakes and restarts. New lifecycle events invalidate the affected record's checked status. At most 20 external operations run in one wake; later records cannot be starved by repeatedly restarting the first ones.

`Complete` flushes idempotent provider events, verifies the Sheet projection, writes one private checksummed backup per operating date and reports stable changes. Successful routine poll receipts are pruned after their cycle; mutation receipts, first identity checks and evidence-bearing reply/delivery/booking reads are retained. Raw evidence is separate from the state backup. Failed sync/backup work appears in the exception inbox and does not fabricate success. Backups restore into a new directory with execution disabled and uncertain mutations marked for readback.

`Waiting`/`Busy` means no operation should run yet. If its `next_at` is within 20 seconds, recheck after that time plus one second; otherwise end the wake. `Disabled` ends the wake. On `Held`, preserve state and report the concrete connection/scope blocker. Never reset a held or pending mutation to bypass it.

`ops-ack <fingerprint>` acknowledges only the current stable report after its meaningful change has been communicated. Requested and independently verified native call cancellations remain part of that report after a transient hold clears. Check times, routine cycles and duplicate replies do not produce repeat notices. One new heartbeat supervises only this controlled allowlist after its merged-source verification; the old monitor stays paused. The app must be open and the computer awake. An unavailable app/account/host is a real availability limit, not a successful poll. Routine execution stays in the private console/state; this chat receives first scheduled completion, meaningful changes, failures or required decisions.

## Pause, recovery and verification

The console's **Pause all** and `node lifecycle-cli.mjs pause` disable controlled operations as well as AI/connector writes. They preserve pending reservations; already submitted email/calendar writes require provider readback. Stopping research alone is not a provider stop. To restart, verify the intended owner/scope and resume only this controlled configuration; never enable production outreach as part of a test.

Run `npm run check` and `npm test`. Account-free scenarios cover approved versus unapproved messages, explicit outcomes, wrong owners, reply/DNC precedence, duplicate/restart behavior, interrupted sends, unknown drafts, native stop readback, slot conflicts, lost booking creates, connector date/self-attendee forms, pause/lease behavior, stable notifications, sync failure and execution-disabled restore. Connected receipts distinguish the reused historical reply from a new send and from synthetic fault tests. Final proof results and scheduled execution evidence belong in the private checkpoint and current task status.

Before production: verify the business sender/domain and signature/contact details; authorize real prospect supply and measure capacity; rehearse production mailbox delivery/stops, recipient scheduling/invitations and sustained supervision. This implementation's controlled guards intentionally reject real records and guests. It does not establish universal calendar availability, real client commitments or 50/day throughput.
