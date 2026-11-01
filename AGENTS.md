# Working instructions

- Before implementation, read BRIEF.md for product intent and TASKS.md for the current task and completion criteria.
- For branches, prototypes, implementation, testing, and PR review, follow WORKFLOW.md. Preserve existing user changes.
- When selecting capabilities, consult the matching task in TOOLKIT.md and read the relevant upstream references. Its adoption policy governs installations.
- For substantial operations changes and broad audits, obtain separate independent requirements and engineering reviews; use fresh-context subagents when available. For other substantial tasks, delegate bounded independent work when it improves quality or speed. WORKFLOW.md defines coordination and fallback.
- Use WORKSPACE.md for cloud links and Work/Codex handoffs. Explain decisions and verification in plain language.
- Keep secrets in environment configuration; commit only placeholder examples. Never commit prospect lists, client data, local credential files, or generated tool reports containing secrets.
- Keep affected docs and task status aligned with the implementation, following WORKFLOW.md's documentation rules.
- Load `.agents/skills/studio-grilling/SKILL.md` for substantial planning/design changes and `.agents/skills/studio-model-review/SKILL.md` before substantial work. Use `.agents/skills/studio-design-vault/SKILL.md` only when references or saved design preferences are requested. [Studio workflow](docs/studio-workflow.md) owns decision recording, public-first research and the skill-improvement lifecycle.
