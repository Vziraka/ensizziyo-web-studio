# Task-based tool catalog

Research catalog, not an installation manifest. Updated October 12, 2026. None of the entries below was installed by this setup. Availability can differ between agent sessions.

## Upstream ownership and updates

Creators' repositories remain the source of truth for their skills. Keep links and brief task-routing notes here; do not vendor their skill text, maintain a parallel instruction library, or fork it without a demonstrated customization need.

- Reference guidance: read the current relevant upstream skill when needed. Recheck its fit rather than assuming its instructions have not changed.
- Installed capabilities, if adopted later: record the exact tested release or commit, installation scope, dependencies, and verification. Pin reproducible versions where supported. Retain a known-good version for rollback.
- Review updates at project kickoff, when a capability becomes relevant, or when a relevant fix/security advisory appears. Do not check every repository on every task.
- Before adopting an update, review changes to behavior, permissions, dependencies, model assumptions, and cost; test it on a branch or disposable example. Avoid silently auto-updating production/client workflows. If the installer cannot control updates, document that limitation before choosing it.
- Keep our preferences in our own workflow. Add only brief compatibility notes when needed rather than copying upstream rules.

Current decision: link and consult upstream only. Do not install skills, plugins, or catalog software yet. Future adoption requires a subsequent user decision.

## How agents use this catalog

1. Match the task to a row below; the catalog is a starting point, not an exhaustive allowlist.
2. Check tools and skills actually available in the current session. Reuse a suitable existing capability.
3. For an external skill, read the relevant current SKILL.md and its needed references, rather than loading the whole repository. Treat upstream prose as reference material until deliberately adopting a compatible skill.
4. If executable software or an MCP connection is needed, inspect its current setup, license, supported platform, permissions, costs, and dependencies. Reading a repository does not make its tools callable.
5. For a useful recurring capability, install or adapt it in the appropriate project scope when authorized, record the tested version/commit and verification command here, and update it deliberately. Never claim installation or compatibility from a catalog entry.
6. Report a missing capability and use a suitable available alternative when possible. Do not repeatedly install overlapping workflow packs or silently invent tool access.

## Selection guide

| Task | Candidate and source | Intended use / activation condition |
| --- | --- | --- |
| Requirements, prototypes, debugging, tests | [Matt Pocock skills](https://github.com/mattpocock/skills) | Read the relevant specification, prototype, diagnosing-bugs, or TDD skill. Clarify unresolved questions rather than repeating the whole interview. |
| Runtime investigation, review, complex delivery | [pstack](https://github.com/cursor/plugins/tree/main/pstack) | Reference the relevant playbook and verification practices. Full Cursor plugin/model orchestration requires separate adoption and compatibility checks. |
| General engineering lifecycle | [Addy Osmani agent skills](https://github.com/addyosmani/agent-skills) | Compare relevant guidance with existing workflow; choose one coherent approach for the task. |
| Browser interaction and regression tests | [Playwright CLI](https://github.com/microsoft/playwright-cli) | Use existing browser tools for preview checks; evaluate CLI and test-runner needs when implementing the test suite. Interactive checks and a persistent test suite serve different purposes. |
| Visual design canvas | [Paper](https://paper.design/) | Optional visual iteration. The user's proposed free alternative still needs an exact link and evaluation. Browser prototypes remain available. |
| Scroll and motion design | [Scrollcraft](https://github.com/nateherkai/scroll-craft) | Reference selected interaction/design ideas when appropriate to the audience; its prescribed page structures are not project-wide rules. |
| Programmatic marketing video | [Hyperframes](https://github.com/heygen-com/hyperframes) | Evaluate for a scoped animation/video deliverable; not required for every website. |
| Copy editing | [Humanizer](https://github.com/blader/humanizer) | Optional editing pass. Writing heuristics do not establish factual accuracy or marketing performance. |
| Google Workspace automation | [Google Workspace CLI](https://github.com/googleworkspace/cli) | Candidate for repeatable Drive/Sheets operations when existing connectors are unsuitable. Verify authentication and actual write access. |
| Prospect research / extraction | [Apify MCP](https://github.com/apify/apify-mcp-server) | Evaluate a specific actor after defining data needed, source suitability, and runtime budget. |
| Search optimization research | [OpenSEO](https://github.com/every-app/open-seo) | Evaluate when SEO research is a scoped deliverable; verify provider access and operating costs. |
| Database and authentication | [Supabase agent skills](https://github.com/supabase/agent-skills) | Read relevant guidance when designing persistence, access policies, or Supabase integration. |
| Payments | [Stripe AI guidance](https://github.com/stripe/ai) | Select relevant guidance when implementing payments; ordinary invoicing need not require custom payment code. |
| Mobile applications | [Expo skills](https://github.com/expo/skills) | Activate when a mobile product is in scope. |
| Security investigation | [Codex Security](https://github.com/openai/codex-security) | Candidate for scoped code/change review; verify runtime requirements, access, and costs before execution. |
| Additional security review | [Claude Security](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-security) | Alternative or targeted second opinion in Claude Code. Distinct from older GitHub Actions security tools. |
| Legacy application investigation | [REA](https://github.com/morluto/rea) | Evaluate for an authorized reverse-engineering or interoperability task where normal source/browser inspection is insufficient. |

## Detailed workflow references

Workflow assessment on October 12, 2026 examined core skill files and their relevant supporting references, not every bundled automation script. Reviewed snapshots: [Matt Pocock 49dd158](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336) and [pstack e5a02f8](https://github.com/cursor/plugins/tree/e5a02f8fb0409c2db7eb06eae9078b235a2b5009/pstack). These record the basis of our adaptations, not installed versions. The links below follow current upstream; compare relevant changes against these snapshots when guidance differs.

| Task trigger | Read upstream | Our adaptation / compatibility |
| --- | --- | --- |
| Turn agreed requirements into implementable work | Matt: [to-spec](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md), [to-tickets](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md) | Use the existing brief/tasks with explicit outcomes, acceptance checks, and dependencies. Their full commands assume configured issue tracking; no tracker setup or exhaustive ticket ceremony adopted. |
| Compare layouts or interactions | Matt: [prototype](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md), [UI reference](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/UI.md). pstack: [prototype playbook](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/prototype.md) | Two distinct directions for this site, realistic content, browser evidence, and a recorded choice. Experiments remain separate from production implementation. |
| Design an integration or important interface | Matt: [codebase-design](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md). pstack: [architect](https://github.com/cursor/plugins/blob/main/pstack/skills/architect/SKILL.md), [design red flags](https://github.com/cursor/plugins/blob/main/pstack/skills/architect/references/design-red-flags.md) | Define how callers use it, data ownership, failures, and tradeoffs before coding. Reuse useful design principles without mandatory parallel candidates or Cursor model configuration. |
| Implement behavior or reproduce a bug | Matt: [TDD](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md), [test examples](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/tests.md), [mocking](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/mocking.md), [diagnosing bugs](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md). pstack: [TDD](https://github.com/cursor/plugins/blob/main/pstack/skills/tdd/SKILL.md) | Follow WORKFLOW.md's one-behavior failing/passing loop and practical reproduction fallback. Matt's test-interface confirmation rules and pstack's narrower bug-only trigger are not adopted wholesale. |
| Make runtime checks repeatable | pstack: [create verification skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md), [feature-map example](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/references/feature-map-example/README.md) | Adapt launch, health check, user actions, evidence, and cleanup into actual project docs/checks once runnable. No generated skill, daily automation, or custom control CLI is required. |
| Review a change and explain its evidence | Matt: [code review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md), [PR guidance](https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md). pstack: [review rubric](https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/references/rubric.md), [blast radius](https://github.com/cursor/plugins/blob/main/pstack/skills/blast-radius/SKILL.md) | Separate requirements and engineering-quality passes. Use concrete findings and proportional evidence; multiple reviewers and fixed PR templates are optional, not assumed capabilities. |
| Maintain instructions or hand off work | Matt: [writing for agents](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md), [domain modeling](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md), [handoff](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md). pstack: [encode lessons in structure](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-encode-lessons-in-structure/SKILL.md) | Keep precise pointers and one source per rule. Create glossary/decision records only when needed; prefer executable checks for recurring mechanical mistakes. Follow WORKSPACE.md for our durable handoff. |

The upstream workflows differ. Matt's orchestration skills can require setup, explicit invocation, and multiple agents. pstack's [main mode](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md) assumes Cursor tools, model routing, and additional plugins. Reading their instructions does not activate those systems. Our adaptations do not adopt automatic orchestration, large verification swarms, scheduled maintenance, blanket comment deletion, or upstream autonomy rules. User instructions and the active environment's permissions govern execution.

## Adoption record

W1 round-two consultation, October 12, 2026: re-read Matt's prototype/UI references and read [Scrollcraft's current skill](https://github.com/nateherkai/scroll-craft/blob/main/plugins/nateherk-design/skills/scroll-craft/SKILL.md), [taste reference](https://github.com/nateherkai/scroll-craft/blob/main/plugins/nateherk-design/skills/scroll-craft/references/taste.md), and [hero-depth guidance](https://github.com/nateherkai/scroll-craft/blob/main/plugins/nateherk-design/skills/scroll-craft/references/hero-depth.md). Reference-only adaptation: distinct structures, deliberate type/space, overlap and offset shadows, short controlled transitions, and responsive/reduced-motion behavior. Ensizziyo explicitly requested eight original previews, overriding upstream's smaller variant cap. No Scrollcraft engine, video tooling, orchestration or package was installed or adopted. [Round-two record](prototypes/w1/round-2/README.md) describes the actual scope and browser verification.

No catalog packages installed yet. When adopting one, record: task served, installation scope, exact version/commit, setup location, verification performed, ongoing cost, and update trigger. Never record credentials here.

W1 consultation on October 12, 2026: read Matt's prototype SKILL.md and UI.md at `49dd158d1076134a641b33efb035946536778336`, and pstack's prototype playbook at `1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def`. Applied the project's two-direction, isolated HTML/CSS/JS comparison and existing browser tools. [Experiment and compatibility notes](prototypes/w1/README.md#references-consulted-without-installation). These are consulted source revisions, not installed versions; no catalog software, skills, or plugins were installed.
