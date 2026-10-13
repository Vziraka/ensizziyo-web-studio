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

The website remains in its separate design workflow. A controlled research runner now lives in [pipeline](pipeline/README.md), with subscription-backed Cursor, Claude and Codex assessments, Google Sheets result writes and an interrupted-job handoff. It is an on-demand proof; production scheduling and outreach are not active. No hosting, domain or production deployment has been configured here.

Research checks: run `npm ci --ignore-scripts`, `npm run check` and `npm test` from `pipeline`. See its README for private configuration, connection health checks, runtime verification, recovery and current limits.

Use this repository in a dedicated Codex project. Client builds belong in separate repositories. Keep customer contact records and credentials out of Git.
