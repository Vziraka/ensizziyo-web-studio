# Ensizziyo Web Studio

Internal working name. The public brand and domain are not selected.

This private repository owns the studio website and its implementation decisions. Business owners are the primary audience; agency partnerships are secondary.

## Start here

- [Implementation brief](BRIEF.md): audience, site content, design direction, acceptance criteria.
- [Launch tasks](TASKS.md): next deliverables and current status.
- [Workspace links](WORKSPACE.md): business plan, Drive, prospect tracker.
- [Agent instructions](AGENTS.md): how to work in this repository.
- [Development workflow](WORKFLOW.md): task completion criteria, prototypes, implementation, verification, and PR review.
- [Tool catalog](TOOLKIT.md): task-based upstream references, reviewed revisions, compatibility, and adoption policy.

## Current state

W1 has two isolated, interactive homepage directions on `feature/w1-design-prototypes`. [Open the experiment record](prototypes/w1/README.md) for copy, tradeoffs, screenshots, and verification. Ensizziyo's design choice is pending; no production application, framework, hosting, domain, or deployment has been configured.

## W1 preview

Use the existing Python installation from this repository root:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory prototypes/w1
```

Open [the desktop/mobile comparison](http://127.0.0.1:4173/review.html). All inquiries are simulated and nothing is sent or saved. Stop the server with Ctrl+C in the terminal that started it. The prototype remains on its experiment branch; production commands and acceptance checks will be defined after W2.

Use this repository in a dedicated Codex project. Client builds belong in separate repositories. Keep customer contact records and credentials out of Git.
