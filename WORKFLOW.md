# Development workflow

Updated October 12, 2026. This is a continuing project. The first website is an initial milestone, not a permanent feature ceiling.

## From request to reviewed change

1. Read the current brief, tasks, and affected code. For substantial work, record the user-visible outcome, acceptance criteria, unresolved decisions, dependencies, and verification method in the existing task or brief. Resolve observable facts through inspection or experiments; ask about consequential product/preferences unknowns. Do not re-interview settled decisions.
2. Start a short-lived `codex/<topic>` branch from current main, or the identified feature base when extending unmerged work. Inspect the working tree first and preserve existing changes. Reuse a suitable checkout; discussion/read-only chats do not need new worktrees. Isolate independently active writers when needed and state any stacked PR dependency.
3. Consult TOOLKIT.md. Read only the relevant skill or documentation, verify compatibility, and use the capability that fits the task. A link is not an installed tool.
4. Resolve uncertain design through the prototype process below. Before implementing integrations or data changes, define their caller-facing interface, data ownership, failure behavior, and relevant migration implications. Record meaningful alternatives and tradeoffs where they affect the choice.
5. Implement complete, demonstrable increments across the layers needed for each behavior. State which increments depend on others; verify each before building dependent work. Refactor when it improves the current design or supports an understood roadmap requirement. Scope size is determined by the requested outcome.
6. Run the affected tests and checks, inspect the actual browser experience, and perform the two review passes below. Fix confirmed failures before presenting completion.
7. Push the branch and open a PR explaining the problem, resulting behavior, verification evidence, and material limitations. Merge after review and required checks. Keep main releasable once application code exists.
8. Update relevant docs and task status in the same change. Record deployment and rollback instructions when hosting is introduced.

## Prototypes and production handoff

For substantial planning/design changes, load the portable [studio grilling skill](.agents/skills/studio-grilling/SKILL.md). Save settled decisions and their reasons through the existing task/client record; do not re-interview settled choices. [The studio workflow](docs/studio-workflow.md) owns optional reference/preference recall and the skill-improvement lifecycle. Check releases and actual model availability before substantial work using [studio model review](.agents/skills/studio-model-review/SKILL.md); it never changes defaults automatically.

State the question each prototype must answer. For visual exploration, compare two structurally different layouts using realistic copy and representative content; add another only when it explores a meaningful alternative. Make variants easy to compare in one preview with labelled controls or links.

Keep experimental code on a clearly named prototype branch or isolated scratch location. Use the simplest existing tools that show the idea, with stubbed submissions and no live customer mutations. Check each variant in the browser at desktop and mobile sizes, drive its interactions, and capture evidence. Visual quality must be sufficient to judge the direction; a prototype does not need production infrastructure or a test suite.

Present tradeoffs and a recommendation. Record the selected direction and why in the task/brief, with a branch/commit or artifact reference to the experiment. Build the chosen direction to the production acceptance criteria: real error handling, accessibility, appropriate tests, and integration verification. Keep losing variants and preview controls out of the production build. Preserve the experiment reference so the decision can be revisited.

## Test suite and CI

Select tests that fit the affected implementation and keep executable commands in README.md and CI. The controlled research runner uses Node's built-in test runner and syntax checks; see [pipeline/README.md](pipeline/README.md). Website checks follow its implementation stage.

- Static checks: formatting/linting, type checks where applicable, and production build.
- Unit tests: meaningful business rules, transformations, and validation.
- Integration tests: inquiry processing, external-service boundaries, persistence, and failure paths where implemented.
- Browser tests: critical journeys such as inquiry success and failure, navigation, and responsive behavior. Include accessibility checks alongside manual keyboard and visual review.
- Bug fixes: add a regression test when the behavior can be reproduced reliably.
- Security-sensitive changes: test authorization, inputs, and failure handling as relevant; use a focused security review in addition to normal checks.

Test behavior and outcomes. Do not add tests merely to match source structure or pursue an arbitrary coverage percentage. Keep external delivery checks in a controlled test destination. Document any manual checks and what automated coverage does not establish.

For inquiry validation, submission behavior, and reproducible bugs, work one behavior at a time: run a test that fails for the intended reason, implement the behavior or fix, then confirm it passes. Test through user-facing or caller-facing interfaces using independently determined expected results. Prefer real internal behavior; substitute external services at their boundaries when needed. Use a focused executable reproduction when a new test would require brittle or disproportionate scaffolding, and record the coverage gap.

For bugs, establish the reported symptom before choosing a fix, test a concrete cause, then rerun the original scenario. A passing nearby test does not prove the reported failure is fixed. Remove temporary debugging instrumentation afterward.

## Repeatable runtime verification

With the first runnable production implementation, document the actual verification recipe alongside the run/build/test commands in README.md. Split out a linked verification document only when the recipe becomes substantial. Include:

- Launch: exact commands, required environment variable names, safe fixtures, readiness signal, and how to stop the instance we started.
- Health check: confirm the expected app/build and test destination before driving it.
- User actions: important entry points and observable outcomes, including failure paths; prefer stable accessible names in automation.
- Evidence: commands/results and relevant screenshots or recordings. Verify delivery or stored state as well as the visible confirmation.
- Cleanup: remove test state and stop only processes created for the check; retain evidence in its recorded location, with secrets and personal data excluded.

Execute the recipe before calling it verified, and update it when behavior changes. Report checks as passed, failed, or not run/inconclusive with the reason. This is documentation and executable checks, not a requirement to install or generate a verification skill.

## Review and PR evidence

Review the same identified base/head change through two separate passes:

1. Requirements: compare against the task/brief; identify missing, incorrect, or unrequested behavior.
2. Engineering quality: check correctness, affected callers, maintainability, security, accessibility, and test quality as relevant. Confirm findings with concrete scenarios rather than speculative concerns.

For substantial operations changes and broad audits, use two distinct reviewers independent of the implementer: one for requirements and one for engineering quality. This includes consequential changes to live data, access, outbound delivery, deployment or multi-system operations; use judgment for the breadth and risk of other changes. A broad audit spans a repository or a substantial multi-component workflow. For a skill creation or change, obtain an independent review of the skill and its evidence. Routine work retains proportionate, distinguishable passes; it does not automatically need multiple agents.

When supported, start each independent agent without the author's conversation history and give it the original task, acceptance criteria, current constraints, authoritative sources, and exact base/head or immutable artifact—not the author's conclusion. In the Codex collaboration tool used for this project, `fork_turns: "none"` omits the parent history; other hosts may differ. Fresh context does not isolate shared files or permissions. Use one integration owner for shared files and separate worktrees for competing writers when needed. If independent reviewers are unavailable, report the missing review and leave that gate incomplete; a distinct human reviewer can satisfy a role. Do not silently substitute the implementer or claim an unperformed review.

Record each reviewer, scope, reviewed revision, findings and checks. For an implementation, fix confirmed findings, then have the affected review and checks reconsider the changed revision before completion. For a requested read-only audit, report findings without changing the audited code. The same model may be used by different reviewers; independence is not a guarantee of correctness.

The PR explains the problem, resulting behavior, verification evidence, and material limitations. Include before/after evidence when it helps assess the change, and describe affected behavior and rollback implications when material. Match verification claims to the reviewed revision; reassess affected checks after later changes. Documentation-only changes need document/diff checks, not an invented application test run.

## Context and long-running work

Use a real current-chat context or token signal only when the active surface exposes it; account allowance and cumulative usage are not the current context window. Codex's interactive `/status` or app-server token events may be available, but do not infer a percentage, compaction threshold, or automatic alert when they are not. Do not change model or compaction defaults merely to avoid summaries. Save a concise checkpoint at meaningful milestones and before a known handoff using [WORKSPACE.md](WORKSPACE.md#work-and-codex-handoff). Record confirmed decisions and their reasons when they occur, rather than relying on a later summary.

A checkpoint in the same chat does not reset context; a new chat or host handoff follows the current client's controls and user authorization. On resumption, reread the relevant current source and reconcile the branch, worktree, approvals and evidence; a checkpoint does not grant fresh authority. Compaction remains a normal safeguard. Never put client data, credentials, or raw sensitive tool output in repository checkpoints.

## Keeping instructions current

AGENTS.md contains stable working conventions; BRIEF.md describes product intent; TASKS.md tracks current work; TOOLKIT.md routes capabilities. Avoid duplicating their contents.

When requirements, commands, architecture, or integrations change, update affected documentation in the same PR. At milestone completion, remove obsolete instructions and reconcile proposed versus implemented capabilities. Resolve contradictions against the latest user decisions and actual code; surface consequential uncertainty rather than blindly following stale text.

At a substantial task's review, or after a repeated failure, consider whether a reusable skill or test improvement is warranted. Follow the [skill lifecycle](docs/studio-workflow.md#model-updates-and-learned-procedures); do not promote a one-off example into a global rule.

Keep each rule in one authoritative place and use task-specific pointers elsewhere. Prefer a type, test, lint, or CI check for recurring mechanical mistakes instead of accumulating reminders. Add a glossary only when terminology needs clarification. Add a short architecture decision record only for a meaningful tradeoff that is costly to reverse and surprising without context; create neither as an empty template.

## Ideas adapted from the researched workflows

- Matt Pocock: turn agreed requirements into a concrete specification, prototype uncertainty, develop with test feedback, diagnose bugs systematically, and review implementation against the specification.
- pstack: route work by task type, establish a reproduction or baseline, verify runtime behavior, examine the impact of changes, and present evidence in the PR.

These are adapted working practices. Neither repository is installed or adopted wholesale, and their model-routing or multi-agent automation is not enabled by this document.

Upstream creators maintain their skill instructions. Our toolkit links to them; it does not mirror their contents. Read reference guidance when relevant. Installations follow the authorization, scope and version-recording process in TOOLKIT.md; implementing the controlled research runner does not authorize unrelated catalog installation.

Specific source files, reviewed revisions, and compatibility decisions are recorded in TOOLKIT.md under Detailed workflow references.
