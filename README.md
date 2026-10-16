# Ensizziyo Web Studio

EVZ Digital is the owner-selected working public name, with EVZ as the visual mark. `evzdigital.studio` is the selected public domain; registration is pending.

This private repository owns the studio website and its implementation decisions. Business owners are the primary audience; agency partnerships are secondary.

## Start here

- [Implementation brief](BRIEF.md): audience, site content, design direction, acceptance criteria.
- [Launch tasks](TASKS.md): next deliverables and current status.
- [Workspace links](WORKSPACE.md): business plan, Drive, prospect tracker.
- [Agent instructions](AGENTS.md): how to work in this repository.
- [Development workflow](WORKFLOW.md): task completion criteria, prototypes, implementation, verification, and PR review.
- [Tool catalog](TOOLKIT.md): task-based upstream references, reviewed revisions, compatibility, and adoption policy.

## Current state

The approved Horizon/Manrope studio and eight interactive demonstrations are curated in [site](site/README.md). The first production path builds a private, noindex review site with a Netlify Forms inquiry, a privacy notice draft and [site CI](.github/workflows/site-check.yml). [Launch decisions and release checks](docs/studio-launch.md) describe the account, proof, accessibility, SEO and rollback work before public release. No hosting account, domain, business inbox or production deployment has been configured here.

From the repository root, with Node 24 and Python already available:

```powershell
node scripts/build-site.mjs
node scripts/verify-site.mjs
node --test scripts/inquiry.test.mjs
python -m http.server 4207 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4207/studio/`. The readiness signal is Python's `Serving HTTP on 127.0.0.1 port 4207` line. Stop only this server with Ctrl+C in its terminal. Open `/studio/about/`, `/studio/services/`, `/studio/work/`, `/studio/inquiry/` and `/studio/privacy/` directly; check the headings and navigation, then choose a service and Work filter and follow a demo's return link. The built HTML contains the page content before JavaScript runs. In the inquiry, empty required fields should show errors; a synthetic `example.com` entry should reach review and retain its values on Edit. The local server rejects POST, so Send must keep details and show a retry message. This local check does not prove Netlify delivery. Use only synthetic details; no real contact data is needed. `dist/` is ignored by Git and can be rebuilt from `site/`.

A controlled research runner remains in [pipeline](pipeline/README.md), with subscription-backed Cursor, Claude and Codex assessments and Google Sheets result writes. It is separate from website inbound inquiries. Production scheduling and outreach are not active.

Research checks: run `npm ci --ignore-scripts`, `npm run check` and `npm test` from `pipeline`. See its README for private configuration, connection health checks, runtime verification, recovery and current limits.

Use this repository in a dedicated Codex project. Client builds belong in separate repositories. Keep customer contact records and credentials out of Git.
