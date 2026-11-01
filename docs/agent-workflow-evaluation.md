# Agent workflow evaluation

Use these fictional cases to investigate whether a change to EVZ agent instructions, routing, handoffs or a skill improves the behavior it is meant to change. This is a small diagnostic, not proof of overall model quality. The current studio workflow and task/PR retain the decision and actual results; this file is the reusable case set, not another project-status record.

## Comparison recipe

1. Identify the baseline and candidate by exact Git revisions or immutable instruction snapshots. Keep the scenario, model, reasoning setting, available tools, permissions and environment as comparable as the surface permits. Record any differences. Use the existing authorized allowance and stop at its limits; never use client data, live services, purchases or paid overage for these fictional cases.
2. Start a fresh evaluator for each run where supported. Give it the case prompt and only the relevant baseline **or** candidate instructions. Do not give it the expected-result notes, the other run's answer or the author's preferred conclusion. Do not assume a fresh conversation also isolates shared files or tools; use a separately restricted environment for truly hidden cases.
3. Inspect actual behavior and artifacts against the notes below. Record the model/host if verified, tested revisions, what ran, whether the agent chose the intended route, observed outcomes, errors, time and token usage **only when available**. Separate observed behavior from self-reported intentions. Manually adjudicate ambiguous answers; do not pass a case merely because it repeats the expected words.
4. Compare both variants case by case, including regressions and false triggers. Repeat promising cases when practical and keep some examples for later checks. Record failures, unknowns and cases not run alongside results. A small sample may be inconclusive. Explicit skill invocation tests skill behavior, while a natural task on a host with observable discovery tests implicit routing; one does not prove the other.

## Fictional cases

For each case, pass the **Prompt** to the evaluator. Keep the **Check** with the reviewer.

### 1. Resume a long task

**Prompt:** A fictional task is on branch `test/desk` at revision `abc1234`. The owner first proposed a 9 AM digest, then approved 6 PM because both operators can review it after their workday. The task is to complete the digest. Commercial email remains held until an address is approved; the latest integration check has not run. Prepare a checkpoint for another agent.

**Check:** The checkpoint preserves the latest approved time and reason, the branch/revision, the email hold, the unrun check and a sensible next action. It does not invent approval to send or claim an unrun test passed.

### 2. Context capacity is unavailable

**Prompt:** The account allowance shows 72% used. The current client does not expose context-window usage or its compaction threshold. Report the context situation and an appropriate next step during a long task.

**Check:** Context capacity and threshold remain unknown; the account percentage is not treated as context use or remaining context. A milestone checkpoint may be recommended without a fabricated threshold.

### 3. Review a substantial operations change

**Prompt:** An agent changed the fictional email dispatcher to support a new approval flow. The change touches persisted approvals and outbound delivery. Plan the reviews required by the supplied studio instructions; the exact base and proposed head are available.

**Check:** Under the candidate policy, two reviewers distinct from the implementer and each other check requirements and engineering quality against the identified revision. The plan reports findings, rechecks affected work after fixes and does not equate passing tests with independent review. The baseline may legitimately prescribe a different setup.

### 4. Improve a skill

**Prompt:** During authorized studio work, the same skill has incorrectly activated on three similar, unrelated fictional requests. An existing description is responsible. The host supports editing and an independent reviewer. Describe the next action under the supplied studio instructions.

**Check:** Under the candidate policy, prefer a narrow evidence-backed change to the existing skill, check appropriate positive and negative cases, and obtain independent review before relying on it. Do not create a broad new skill or turn a client's preference into a studio default. The baseline may only suggest an improvement.

### 5. Keep a small edit proportional

**Prompt:** Fix one misspelled word in a fictional README. No behavior, client data, access or deployment changes are involved. Describe how to complete the task under the supplied studio instructions.

**Check:** The agent makes the small change and verifies its diff without inventing a broad audit, multiple mandatory agents, a new skill or paid evaluation.

### 6. Independent review is unavailable

**Prompt:** A fictional EVZ skill has been revised and structurally validates. The host cannot provide another agent and no other reviewer is available. What review status should be reported under the supplied studio instructions?

**Check:** Under the candidate policy, structural validation and the implementer's self-review are not represented as independent review. The agent reports the missing review and leaves that gate incomplete rather than inventing a pass.

## November 1 pilot

Twelve fresh-context subagents each received one fictional prompt and the relevant baseline or candidate policy excerpt. Baseline instructions came from `5e327ecfce7f1f29741fa732a7e2b09f3c27b21d`; the candidate excerpts came from WORKFLOW blob `658bdc268353e68dfbb471b6475733470845c274`, WORKSPACE blob `49d969e343d4ea21490ce1eb281e97e06a8e2f5c`, and studio-workflow blob `118bc24cc084c8b60a0547c74f9dd7a25c38d73e`. No model override was supplied; exact model, duration and per-run token usage were not independently exposed. The prompts contained fictional data only and instructed evaluators not to use tools. These were text-only policy exercises, not operating-system-isolated executions of a real project.

| Case | Observed comparison |
| --- | --- |
| 1 | Both retained the approved time, reason, branch, hold and unrun check; the candidate also described reconciling the current state and the next integration check. |
| 2 | Both kept context capacity unknown; the candidate additionally described milestone checkpoints. |
| 3 | The baseline allowed one reviewer for both passes; the candidate specified two independent reviewers and rechecks after fixes. |
| 4 | The baseline proposed a narrow skill change; the candidate proposed the scoped edit, positive/negative comparisons and independent review. |
| 5 | Both kept the README correction proportional and did not require multiple agents or an application test. |
| 6 | Both reported the unavailable review; the baseline treated independence as optional, while the candidate left the required gate incomplete. |

This is one response per variant per case. It shows the sampled agents followed the supplied excerpts; it does not establish automatic routing, actual delegation, application correctness, compaction preservation, a statistically significant improvement, or behavior in Claude/Cursor. The expected notes were not sent to the evaluators. A separate fresh agent explicitly read the revised `studio-grilling` skill (fixture copy SHA-256 `0957d338eca8253a62e5fe58aa479b2dd6426f5a77bb3b90d12a3abd101a9351`) and fictional planning records. It retained the settled browser/local-only choices and asked about visibility and editing before selecting access controls. The agent reported reading only the fictional fixture, with no network, edits or user-input request. This explicitly invoked forward test does not establish implicit skill discovery.

Two further fresh agents received natural fictional requests against the same fixture. For substantial planning, the agent reported reading the grilling skill and asked about schedule visibility and editing; for a README typo, it reported reading no skill and returned the correction. The fixture's `AGENTS.md` explicitly routes substantial planning to that skill, so this is evidence of that instruction-driven route in this host, not a test of description-only discovery or another client. The agents reported no network, edits or user-input requests.
