# Studio launch approach

Decision record, October 16, 2026. The owner approved the Horizon/Manrope studio and all eight interactive demonstrations for a first public release. This document records the production path; the current build is a **private review build**.

## Identity and domain

Use **Ensizziyo Studio** as the working launch recommendation. It keeps the approved wordmark and is more distinctive than a generic digital-agency name, though a visitor may need to hear it spelled. A founder-name studio would make the owner more visible and simpler to introduce personally, but the public personal name and domain have not been selected. A new independent name would require new visual work and clearance without solving a current product problem. Keep the approved brand until a different name is actually chosen.

Prefer `ensizziyo.com` if its checkout price and clearance are acceptable; `ensizziyo.studio` is the strong first-year-cost option. The [GitHub Student Developer Pack domain offers](https://education.github.com/pack?sort=popularity&tag=Domains) list one year of a `.me` domain through Namecheap and select extensions including `.studio` through Name.com, plus a `.tech` offer. They do not list a free `.com`. [Name.com says](https://www.name.com/support/articles/360036364834-signing-up-for-github-student-developer-pack) its eligible offer is for the first year; renewal pricing and whether an exact name is standard or premium must be checked at checkout. An RDAP 404 seen for the two Ensizziyo candidates on October 16 is not a registration guarantee or trademark clearance. Do an actual registrar checkout and mark search before purchase. Domain purchase and public exposure remain separate release actions.

## Hosting and delivery

Use the curated static source in `site/`. `node scripts/build-site.mjs` produces `dist/`: studio, eight demos and shared modules. The build adds the demonstration return bar and carousel controller to each demo. It excludes the prototype evidence and revision folders. The 59 copied PNGs were converted to WebP with unchanged dimensions: RGB at quality 88, alpha images lossless. The originals remain in the owner's local prototype archive; the publishable images total about 16 MiB instead of 115 MiB.

**Recommended host: Netlify**, starting on its Free credit plan with a private project and private deploy previews. It supports static Git deploys, [pull request previews](https://docs.netlify.com/deploy/deploy-overview/), and [forms detected from built HTML](https://docs.netlify.com/manage/forms/setup/) without a custom server. Current [credit-plan documentation](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) lists Free at $0 with 300 credits per month and Personal at $9 with 1,000 credits; [bandwidth consumes 20 credits per GB](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/). Confirm account-specific commercial terms and monitor usage before public release. Cloudflare static hosting is a reasonable alternative but would need a separate form delivery service or Worker. The selected path keeps one provider for hosting, previews and inbound form capture.

The repository's `netlify.toml` and build both set noindex for this review increment. Do not make the Netlify project or previews public yet. Before public release, replace the hash-only studio routes with crawlable URLs or generated page HTML, set per-page metadata, canonical URL, favicon, sitemap and an intentional robots policy. These are production requirements, not assumed complete because the preview looks correct.

## Inquiry and data ownership

The studio form asks for description, name and email; business, website and sample context are optional. The visitor reviews the details, then `sendInquiry` posts URL-encoded data to the `studio-inquiry` Netlify form. Client validation bounds fields; a non-OK response or network error keeps the entered details and shows retry. Local form state stays in memory. Eight demonstration forms and actions remain simulated and visibly labelled.

At account setup, enable form detection and configure verified-submission email notifications to a new owner-controlled business inbox, preferably `hello@<chosen-domain>`. Netlify stores the submitted record; the inbox receives a notification. A submission response alone does not prove the notification arrived, so verify both the Netlify submission record and mailbox with a synthetic inquiry before launch. [Netlify's form notification documentation](https://docs.netlify.com/manage/forms/notifications/) describes that setup. One Google Workspace Business Starter user on flexible billing is the current mailbox recommendation, matching the separate business-system account plan; [Google lists $8.40 per user per month](https://knowledge.workspace.google.com/admin/billing/flexible-plan) before taxes or promotions. No account or domain has been purchased here.

Website inquiries are a **separate inbound lead path**. They must not enter the outbound research/prospect queue by default. After the lifecycle system's inbound record owner, consent fields, status, deduplication key and failure handling are defined and verified, connect it from verified Netlify submissions. The business inbox is the first operational destination, not a dependency on completing outbound automation. Keep API keys and mailbox settings in provider environment configuration only.

Before collecting public inquiries, publish a concise privacy notice explaining the fields collected, Netlify and mailbox processing, purpose, retention and contact route. Set an owner routine to review/delete or export submissions as appropriate; [Netlify documents submission storage and management](https://docs.netlify.com/manage/forms/submissions/).

## CI, release and rollback

Git pull requests own content and code changes. The `site-check` workflow runs syntax, build, static route/asset checks and inquiry tests on pull requests and changes to `main`. After an owner Netlify account is connected, each PR gets a private deploy preview for browser review. Branch protection should require this check before merging. Netlify then builds from `main`; the project stays private until all release checks pass. Promote that reviewed build to public, connect DNS and HTTPS, and verify the live URL. Keep the prior successful Netlify deploy permalink and use Netlify's prior-deploy restore or a Git revert for rollback.

This is practical CI/CD and Git-managed deployment configuration. A Kubernetes platform, cluster controller or formal GitOps reconciliation loop would add operational work without a current need for this static site. The [OpenGitOps principles](https://opengitops.dev/) describe a stricter model with declarative desired state and automatic reconciliation; this site can adopt more of it if its infrastructure grows.

## Public release checks

1. Register the selected domain in the owner's account; configure the business inbox, DNS, HTTPS and sender authentication. Record actual first-year and renewal costs.
2. Connect a private Netlify project to this repository; enable Forms, set the notification inbox, then prove a synthetic valid inquiry appears in both Netlify and the inbox. Prove invalid details and a delivery failure do not show success.
3. Resolve the claim conflict: the copied `data.json` labels the four exact reviews fictional placeholders, while the owner now says all four are genuine and approved. Keep them in private review only until original wording and publication permission are reconciled. The 500+/1,000+ figures are owner-reported and need a supportable scope and date before public display.
4. Add the privacy notice, founder introduction, FAQ and crawlable studio pages; check links, metadata, image rights, sample labels, accessibility, keyboard and reduced-motion paths, physical phone, major browsers and page performance.
5. Review a release candidate in its private deploy preview, record the build and rollback target, then make the reviewed version public. Check live inquiry delivery and monitoring after launch.

The commercial outreach launch is a separate decision: its connected lifecycle system, account cutover and sending checks have their own tasks. Website publication does not imply outreach is active.
