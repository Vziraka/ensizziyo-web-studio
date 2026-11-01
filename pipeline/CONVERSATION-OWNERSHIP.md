# Conversation ownership and personal writing style

Existing unassigned Reply review, Discovery and Information requested conversations can be claimed by a signed operator through `conversation_claimed`. Claims never take over another lead, change sales stage, release contact or rotate new inquiries. Existing assignments remain until the current lead uses the existing signed handoff. Claiming updates Ready project work and queued call/callback review work; prior email intents and receipts remain history and must pass their original current-source checks.

Each signed operator may save their own `operator_writing_style_saved` record at `operator-owner` or `operator-friend`. Exact fields are `role`, bounded `preferences`, bounded operator-written `examples`, `reason` and `expected_style_sha256` (null initially). The record retains version/hash/actor/time and prior versions. This is drafting guidance only: never client facts, tool instructions, send authority or a change to the EVZ Digital Team sender. Examples must contain no client information or credentials.

Local draft tasks require a client lead and include only that lead's current personal profile, or an explicit default. A separate style fingerprint fences task context, returned results and adoption when that lead's style changes. Another operator's style does not affect the task. Adopted drafts retain their reviewed wording and factual source fingerprint after style updates; handoff continues to invalidate affected authority without rewriting wording.

## Shared records

The existing composed operations records/mail authority may explicitly bind `conversation_records` to the exact version-1 claim/style schema in its immutable dispatch policy and manifest. These events use the existing typed `projectRecord` transition and independent complete-state replay. Historical policies/manifests without this schema keep their old allowed effects and reject the new events. Manual-only, project-only and inert profiles gain no authority. Binding this optional record schema does not enable any new provider operation or local agent task in hosted storage. Use the normal reviewed source preparation/rebinding process; do not mutate an installed policy in place.

The UI exposes Claim this conversation before local preparation and My email writing style for signed supported sessions. Shared controls appear only when their manifest declares these exact events. Style is personal; neither operator can save the other's profile. Both operators can read the selected lead's preparation context as their existing desk access permits.

Automatic alternating assignment for genuinely new inquiries is not implemented here. Registered incoming routes still cover existing conversations; replies preserve their current lead. Whole-inbox intake and duplicate-aware new-inquiry assignment remain separate acceptance work.

## Verification

Focused tests exercise signed claim races, stale revisions/retries, stopped/assigned conversations, self-profile authorization, relevant versus unrelated style changes, retained approved wording, task lead selection, and the actual composed shared handler/conditional-store replay including old-policy denials and unrelated-state rejection. No live model, mailbox, sending or deployment follows from these fixtures.
