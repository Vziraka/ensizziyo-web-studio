# Ensizziyo Web Studio

EVZ Digital is the owner-selected working public name, with EVZ as the visual mark. `evzdigital.studio` is registered in the owner's Name.com account.

This private repository owns the studio website and its implementation decisions. Business owners are the primary audience; agency partnerships are secondary.

## Start here

- [Implementation brief](BRIEF.md): audience, site content, design direction, acceptance criteria.
- [Launch tasks](TASKS.md): next deliverables and current status.
- [Workspace links](WORKSPACE.md): business plan, Drive, prospect tracker.
- [Agent instructions](AGENTS.md): how to work in this repository.
- [Development workflow](WORKFLOW.md): task completion criteria, prototypes, implementation, verification, and PR review.
- [Tool catalog](TOOLKIT.md): task-based upstream references, reviewed revisions, compatibility, and adoption policy.

## Current state

The approved Horizon/Manrope studio and eight interactive demonstrations are curated in [site](site/README.md). [EVZ Digital](https://evzdigital.studio/) is public for direct-link sharing, with Netlify Forms, a privacy notice, [site CI](.github/workflows/site-check.yml), and private Deploy Previews. The first share release retains `noindex`; [launch decisions and checks](docs/studio-launch.md) track the later indexed launch and Google Workspace inbox cutover. The published build omits disputed claims. Until Workspace access returns, the owner checks Netlify Verified and Spam submissions daily and replies from a reachable Gmail account. A synthetic inquiry reached the dashboard from the public domain; all synthetic form submissions were then deleted.

From the repository root, with Node 24 and Python already available:

```powershell
node scripts/build-site.mjs
node scripts/verify-site.mjs
node --test scripts/inquiry.test.mjs
python -m http.server 4207 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:4207/studio/`. The readiness signal is Python's `Serving HTTP on 127.0.0.1 port 4207` line. Stop only this server with Ctrl+C in its terminal. Open `/studio/about/`, `/studio/services/`, `/studio/work/`, `/studio/inquiry/` and `/studio/privacy/` directly; check the headings and navigation, then choose a service and Work filter and follow a demo's return link. The built HTML contains the page content before JavaScript runs. In the inquiry, empty required fields should show errors; a synthetic `example.com` entry should reach review and retain its values on Edit. The local server rejects POST, so Send must keep details and show a retry message. This local check does not prove Netlify delivery. Use only synthetic details; no real contact data is needed. `dist/` is ignored by Git and can be rebuilt from `site/`.

For the hosted check, confirm production visibility is **Public** and Deploy Preview visibility is **Private** in the [project configuration](https://app.netlify.com/projects/evz-digital-studio/configuration/general). Check that the latest deploy is from `main` and Forms lists `studio-inquiry`. Open `https://evzdigital.studio/studio/inquiry/` without the owner's Netlify session, try blank required fields, then send clearly synthetic details and verify both the completion screen and matching **Verified submissions** record. Delete the synthetic record after the check, using the provider's irreversible-deletion confirmation. The October 16 public test confirmed form storage and the empty Verified/Spam queues after cleanup; it did not confirm delivery to the inaccessible Workspace inbox or a full physical-device review. [The launch decision](docs/studio-launch.md) tracks those checks and the [published deploy](https://app.netlify.com/projects/evz-digital-studio/deploys/6ad2b3c157ba5073205eaf5c) for rollback.

A controlled research runner remains in [pipeline](pipeline/README.md), with subscription-backed Cursor, Claude and Codex assessments and Google Sheets result writes. It is separate from website inbound inquiries. Production scheduling and outreach are not active.

Research checks: run `npm ci --ignore-scripts`, `npm run check` and `npm test` from `pipeline`. See its README for private configuration, connection health checks, runtime verification, recovery and current limits.

Use this repository in a dedicated Codex project. Client builds belong in separate repositories. Keep customer contact records and credentials out of Git.
