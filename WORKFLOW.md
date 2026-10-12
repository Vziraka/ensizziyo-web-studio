# Development workflow

Updated October 12, 2026. This is a continuing project. The first website is an initial milestone, not a permanent feature ceiling.

## From request to reviewed change

1. Read the current brief, tasks, and affected code. For substantial work, record the user-visible outcome, acceptance criteria, unresolved decisions, dependencies, and verification method in the existing task or brief. Resolve observable facts through inspection or experiments; ask about consequential product/preferences unknowns. Do not re-interview settled decisions.
2. Start a short-lived branch from current main: feature/<topic>, fix/<topic>, or docs/<topic>. Inspect the working tree first and preserve existing changes. Keep independently active work isolated when necessary.
3. Consult TOOLKIT.md. Read only the relevant skill or documentation, verify compatibility, and use the capability that fits the task. A link is not an installed tool.
4. Resolve uncertain design through the prototype process below. Before implementing integrations or data changes, define their caller-facing interface, data ownership, failure behavior, and relevant migration implications. Record meaningful alternatives and tradeoffs where they affect the choice.
5. Implement complete, demonstrable increments across the layers needed for each behavior. State which increments depend on others; verify each before building dependent work. Refactor when it improves the current design or supports an understood roadmap requirement. Scope size is determined by the requested outcome.
6. Run the affected tests and checks, inspect the actual browser experience, and perform the two review passes below. Fix confirmed failures before presenting completion.
7. Push the branch and open a PR explaining the problem, resulting behavior, verification evidence, and material limitations. Merge after review and required checks. Keep main releasable once application code exists.
8. Update relevant docs and task status in the same change. Record deployment and rollback instructions when hosting is introduced.

## Prototypes and production handoff

State the question each prototype must answer. For visual exploration, compare two structurally different layouts using realistic copy and representative content; add another only when it explores a meaningful alternative. Make variants easy to compare in one preview with labelled controls or links.

Keep experimental code on a clearly named prototype branch or isolated scratch location. Use the simplest existing tools that show the idea, with stubbed submissions and no live customer mutations. Check each variant in the browser at desktop and mobile sizes, drive its interactions, and capture evidence. Visual quality must be sufficient to judge the direction; a prototype does not need production infrastructure or a test suite.

Present tradeoffs and a recommendation. Record the selected direction and why in the task/brief, with a branch/commit or artifact reference to the experiment. Build the chosen direction to the production acceptance criteria: real error handling, accessibility, appropriate tests, and integration verification. Keep losing variants and preview controls out of the production build. Preserve the experiment reference so the decision can be revisited.

## Test suite and CI

With the first application implementation, select test tools that fit the actual stack and add executable commands to README.md and CI. No application or test suite exists yet; this document describes the intended setup.

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

Keep the results distinguishable even when one reviewer performs both. Additional independent review is useful for consequential changes when available and authorized; this workflow does not mandate multi-agent or multi-model orchestration.

The PR explains the problem, resulting behavior, verification evidence, and material limitations. Include before/after evidence when it helps assess the change, and describe affected behavior and rollback implications when material. Match verification claims to the reviewed revision; reassess affected checks after later changes. Documentation-only changes need document/diff checks, not an invented application test run.

## Keeping instructions current

AGENTS.md contains stable working conventions; BRIEF.md describes product intent; TASKS.md tracks current work; TOOLKIT.md routes capabilities. Avoid duplicating their contents.

When requirements, commands, architecture, or integrations change, update affected documentation in the same PR. At milestone completion, remove obsolete instructions and reconcile proposed versus implemented capabilities. Resolve contradictions against the latest user decisions and actual code; surface consequential uncertainty rather than blindly following stale text.

Keep each rule in one authoritative place and use task-specific pointers elsewhere. Prefer a type, test, lint, or CI check for recurring mechanical mistakes instead of accumulating reminders. Add a glossary only when terminology needs clarification. Add a short architecture decision record only for a meaningful tradeoff that is costly to reverse and surprising without context; create neither as an empty template.

## Ideas adapted from the researched workflows

- Matt Pocock: turn agreed requirements into a concrete specification, prototype uncertainty, develop with test feedback, diagnose bugs systematically, and review implementation against the specification.
- pstack: route work by task type, establish a reproduction or baseline, verify runtime behavior, examine the impact of changes, and present evidence in the PR.

These are adapted working practices. Neither repository is installed or adopted wholesale, and their model-routing or multi-agent automation is not enabled by this document.

Upstream creators maintain their skill instructions. Our toolkit links to them; it does not mirror their contents. Reference guidance is read when relevant. Any future installation uses the controlled update and version-recording process in TOOLKIT.md. No installation is currently authorized.

Specific source files, reviewed revisions, and compatibility decisions are recorded in TOOLKIT.md under Detailed workflow references.
