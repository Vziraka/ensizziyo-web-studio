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

W1 has eight original studio previews in [round two](prototypes/w1/round-2/README.md), following Ensizziyo's annotated review of the first two directions. The latest copy covers websites and landing pages, business systems and integrations, practical automation and AI, and marketing support, as scoped service areas under [the brief](BRIEF.md). All experiments stay on `feature/w1-design-prototypes`. The [earlier A/B record](prototypes/w1/README.md) is preserved as history. Ensizziyo's design choice is pending; no production application, framework, hosting, domain, or deployment has been configured.

## W1 preview

Use the existing Python installation from this repository root:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory prototypes/w1
```

Open [the eight-preview desktop/mobile comparison](http://127.0.0.1:4173/round-2/). Each preview includes separate About, Services, Work, concept-study, and inquiry page views. Let's talk is primary; the inquiry asks what the owner wants to improve, with an optional service choice. All inquiries are simulated and nothing is sent or saved. Stop the server with Ctrl+C in the terminal that started it when review is over. The prototype remains on its experiment branch; production commands and acceptance checks will be defined after W2.

Use this repository in a dedicated Codex project. Client builds belong in separate repositories. Keep customer contact records and credentials out of Git.
