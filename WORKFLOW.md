# Development workflow

Updated October 12, 2026. This is a continuing project. The first website is an initial milestone, not a permanent feature ceiling.

## From request to reviewed change

1. Read the current brief, tasks, and affected code. Define the expected user-visible outcome and acceptance criteria. Ask about consequential unknowns; do not re-interview settled decisions.
2. Start a short-lived branch from current main: feature/<topic>, fix/<topic>, or docs/<topic>. Inspect the working tree first and preserve existing changes. Keep independently active work isolated when necessary.
3. Consult TOOLKIT.md. Read only the relevant skill or documentation, verify compatibility, and use the capability that fits the task. A link is not an installed tool.
4. For uncertain interaction or visual decisions, show focused prototypes early. For integrations and data changes, define the interface, ownership, failure behavior, and relevant migration implications before implementation.
5. Implement in complete increments that can be demonstrated and tested. Refactor when it improves the current design or supports an understood roadmap requirement. Scope size is determined by the requested outcome.
6. Run the affected tests and checks, inspect the actual browser experience, and review the diff for both requirements and maintainability. Fix confirmed failures before presenting completion.
7. Push the branch and open a PR explaining the problem, resulting behavior, verification evidence, and material limitations. Merge after review and required checks. Keep main releasable once application code exists.
8. Update relevant docs and task status in the same change. Record deployment and rollback instructions when hosting is introduced.

## Test suite and CI

With the first application implementation, select test tools that fit the actual stack and add executable commands to README.md and CI. No application or test suite exists yet; this document describes the intended setup.

- Static checks: formatting/linting, type checks where applicable, and production build.
- Unit tests: meaningful business rules, transformations, and validation.
- Integration tests: inquiry processing, external-service boundaries, persistence, and failure paths where implemented.
- Browser tests: critical journeys such as inquiry success and failure, navigation, and responsive behavior. Include accessibility checks alongside manual keyboard and visual review.
- Bug fixes: add a regression test when the behavior can be reproduced reliably.
- Security-sensitive changes: test authorization, inputs, and failure handling as relevant; use a focused security review in addition to normal checks.

Test behavior and outcomes. Do not add tests merely to match source structure or pursue an arbitrary coverage percentage. Keep external delivery checks in a controlled test destination. Document any manual checks and what automated coverage does not establish.

## Keeping instructions current

AGENTS.md contains stable working conventions; BRIEF.md describes product intent; TASKS.md tracks current work; TOOLKIT.md routes capabilities. Avoid duplicating their contents.

When requirements, commands, architecture, or integrations change, update affected documentation in the same PR. At milestone completion, remove obsolete instructions and reconcile proposed versus implemented capabilities. Resolve contradictions against the latest user decisions and actual code; surface consequential uncertainty rather than blindly following stale text.

## Ideas adapted from the researched workflows

- Matt Pocock: turn agreed requirements into a concrete specification, prototype uncertainty, develop with test feedback, diagnose bugs systematically, and review implementation against the specification.
- pstack: route work by task type, establish a reproduction or baseline, verify runtime behavior, examine the impact of changes, and present evidence in the PR.

These are adapted working practices. Neither repository is installed or adopted wholesale, and their model-routing or multi-agent automation is not enabled by this document.

Upstream creators maintain their skill instructions. Our toolkit links to them; it does not mirror their contents. Reference guidance is read when relevant. Any future installation uses the controlled update and version-recording process in TOOLKIT.md. No installation is currently authorized.

Sources reviewed October 12, 2026: https://github.com/mattpocock/skills and https://github.com/cursor/plugins/tree/main/pstack
