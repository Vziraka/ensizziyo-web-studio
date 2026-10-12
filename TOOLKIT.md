# Task-based tool catalog

Research catalog, not an installation manifest. Updated October 12, 2026. None of the entries below was installed by this setup. Availability can differ between agent sessions.

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

## Adoption record

No catalog packages installed yet. When adopting one, record: task served, installation scope, exact version/commit, setup location, verification performed, ongoing cost, and update trigger. Never record credentials here.
