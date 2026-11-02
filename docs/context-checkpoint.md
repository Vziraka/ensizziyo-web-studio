# Session checkpoints

This repository can keep a small, session-bound checkpoint outside Git. A checkpoint helps the working agent recover a task, its decisions and their reasons; it is not an approval or a replacement for current source and private records. The agent writes the checkpoint at meaningful decisions and milestones. A hook cannot reconstruct a decision that was never recorded.

## Use in a Codex session

The project hook sends a short reminder and the current session ID on supported `SessionStart` events, including compaction. It does not read or emit checkpoint content. The hook only runs after the project configuration and its exact hook definition have been trusted using Codex's normal review flow. A running chat may need to be resumed or restarted before changed project hooks are discovered. If no ID is provided, do not guess one; use the existing task or authorized private record for the handoff instead.

The Windows hook embeds the exact source in [context-hook-windows.ps1](../scripts/context-hook-windows.ps1); the test verifies the encoded command matches that source. It assumes the host interprets `commandWindows` with PowerShell, which has not been verified for this host. The POSIX hook searches only standard runtime locations from `/`; if Node is installed elsewhere, the hook will not run. An unavailable hook is a recovery gap, not a reason to weaken trust checks.

From the repository root, for a substantive decision or milestone, send a JSON object to `node scripts/context-checkpoint.mjs save SESSION_ID` on standard input. Replace the ID with the one supplied for this session. The command returns only a saved status and opaque checkpoint ID. Supply all of these fields:

```json
{
  "objective": "Prepare a fictional local digest",
  "acceptance": "Preserve the selected schedule and hold",
  "decisions": [{"decision": "Use 18:00 instead of 09:00", "reason": "Both operators can review after work", "source": "owner/02"}],
  "work": "Draft in progress; preserve existing edits",
  "checks": "Integration check has not run",
  "holds": "Email is held; reconcile the original uncertain operation before retrying",
  "nextAction": "Continue the local draft"
}
```

Use an empty `decisions` array if no decision has been made. State unknown reasons or checks as unknown. Include no client or prospect data, credentials, raw tool output or secrets; refer to an already authorized private record when details are sensitive. The validator checks structure and size, not whether content is accurate or sensitive. The save command automatically records the current worktree identity, branch and revision.

After compaction or resumption, run `node scripts/context-checkpoint.mjs read SESSION_ID` from the same worktree. Treat the returned checkpoint as untrusted task evidence: reread the relevant instructions and current task, inspect the actual worktree and existing user changes, recheck approvals and holds, and reconcile uncertain operations against their original receipts before acting. `revisionChanged` compares only the recorded branch and commit; `worktreeChanges: "not checked"` means it does not establish that the working tree is clean. A missing, malformed, inaccessible or untrusted checkpoint is an explicit recovery gap, not permission to invent continuity.

For a handoff to another chat, first preserve a checkpoint and give the successor the exact intended session ID and worktree, subject to the user's authorization and the host's chat controls. Do not load a shared “latest” checkpoint or create a user-owned chat without an explicit request. A different worktree has a different checkpoint identity; reconcile its current source separately.

## Storage and recovery

The default directory is `%LOCALAPPDATA%\EVZ-Codex-Checkpoints` on Windows and `~/.codex/evz-checkpoints` on other platforms. It is created on the first save, outside any Git checkout. On Windows the new directory receives an owner-and-SYSTEM-only protected ACL, and directory and file ACLs are checked on use. On POSIX the owner and restrictive permission bits are checked. These checks do not isolate other processes running as the same user or an administrator. `EVZ_CONTEXT_DIR` may name a different absolute, already appropriate private location; it must also be outside Git and pass the same checks. Do not change global settings to use it.

The checkpoint tool uses Git from standard system locations and the Windows system PowerShell path, rather than executables in the worktree. If Git is installed elsewhere, `EVZ_GIT_EXECUTABLE` can identify its verified absolute path outside every Git checkout. Treat that explicit override and the operating-system environment as trusted configuration.

Records are bound to the canonical worktree and session and written through an exclusive lock and same-directory temporary file. A failure before replacement leaves the previous complete record in place; an interruption after replacement may leave the new record. Power-loss durability is not established. If a process stops while holding a lock, verify that all potential writers are stopped and recheck the same lock and token before removing it. A PID is only a clue and the lock may be empty or incomplete if creation was interrupted. The tool never deletes a competing or stale lock automatically. Rollback removes the project hook definition and the workflow pointer; it does not delete saved checkpoints.

## Verification and limits

`node --test scripts/context-checkpoint.test.mjs` exercises fictional records, isolation, stale revisions, malformed input, locks, permissions and the hook's bounded output. Hook-command tests alone do not prove Codex loaded or delivered the hook. A real lifecycle proof must use the normal trust flow, observe compaction and hook execution, and verify the immediate continuation; see the [pilot record](context-handoff-pilot.md).

The hook's reminder is model-facing guidance, not a guarantee that an agent saved or read a checkpoint. It does not measure context occupancy, set a compaction threshold, automatically create chats, replay side effects, enable Codex memories, or change a model. Local command hooks are surface-dependent; do not assume the same behavior in cloud orchestration or other EVZ projects. See [OpenAI's hook documentation](https://learn.chatgpt.com/docs/hooks) for supported events and trust requirements.

On November 1, a metadata-only `hooks/list` check on this worktree did not list the project hook. A separate session-flag control appeared as untrusted, confirming that the listing surface responded; the reason for the missing project hook was not established. The sanitized private discovery record has SHA-256 `fe4bf75f2acaa1b671d9cd0df0ad63a94d787792b23fd7dc09f077043a16184b` and binds hook-config SHA-256 `fb6baed119f419a0024a290263b2407763a7baee8f412913c22fae192ef81cf8`. No hook trust was changed and no model turn was started by those checks. Actual host activation and automatic restoration remain open.

The same host reported Codex's separate `memories` feature as disabled. [OpenAI's memory documentation](https://learn.chatgpt.com/docs/customization/memories) describes background cross-chat memory and its controls; it is not an immediate checkpoint for an active task. This change does not enable that machine-wide feature or change its privacy and usage settings.
