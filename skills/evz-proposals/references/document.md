# Approved EVZ document

Visual master: [seven-page fictional proposal](../assets/EVZ-Digital-Master-Proposal-Review.pdf), approved by the owner in the originating October 20, 2026 chat. Preserve its quiet, professional character. The client, prices, tools, dates and detailed deliverables in this reference are sample content; the pricing guide and approved project record govern a real proposal.

## Design specification

- US Letter portrait, 48-point side margins; white page, charcoal `#202020`, secondary text `#606060`, rules `#dadada`, light surfaces `#f5f5f5`.
- Use the bundled original `evz-wordmark.png` unchanged and Manrope regular/bold fonts. The font license is included. No regenerated logo or substituted visual identity.
- Large restrained headings (about 31 points; opening about 38), readable body text around 10.5-11 points with 15-17 point leading. Small labels/footers around 8-9 points. Keep essential scope/terms in readable body sizes.
- Slim header with EVZ, client/project identifier; consistent footer with pagination. Add version/date/proposal identifier. Remove fictional-review labels only for a real, owner-approved proposal.
- Useful opening page: client's situation, recommended outcome, investment and timeline, rather than an empty decorative cover.
- Clear deliverable tables, optional workflow diagram, simple milestone rows and one prominent charcoal investment panel. Keep optional charges outside the base total.
- Let content determine length, usually 5-8 pages. Add pages instead of shrinking type or clipping long client names and scope text. Do not force every service into exactly seven pages or retain irrelevant website language.

## Content order

1. Client needs and recommended solution.
2. Detailed deliverables and exclusions, adapted to the service.
3. Workflow/feature detail when useful to explain scope.
4. Delivery milestones, dependencies and client inputs.
5. Fixed investment, exact payment schedule, optional add-ons and third-party costs.
6. Revisions, changes, completion/approval and defect fixes.
7. Handover, ongoing responsibility and next steps.

Combine or expand sections to fit. Use a relevant approved mockup or concise diagram only where it explains the proposal; do not create unnecessary decorative imagery. The acceptance area in the master is a layout example, not an actual signature or authorization.

## Source and repeatable composition

The bundled [master reproduction source](../scripts/reproduce_master.py) reproduces the approved fictional reference using bundled brand assets:

```text
python scripts/reproduce_master.py --output-dir <absolute-private-review-directory>
```

This is a **fixed fictional example**, not a client-data generator. It never consumes client data or proves approval. For a real proposal after owner approval, copy/adapt its layout helpers into the private project source; replace the sample content, metadata, paths, fixed page count and labels. Preserve the installed master. For larger/adaptive layouts, use normal pagination with the same visual specification rather than extending fixed coordinates blindly.

Use the available PDF skill and bundled document dependencies. Follow its required artifact-operation marker immediately before actual PDF authoring. The master reproduction command is authoring too.

## Verify before delivery

- Compare the document with the approved private scope and price record; ensure all exclusions, optional items, third-party costs and responsibilities match.
- Reconcile the fixed total and installments to the cent. Check add-ons are excluded unless selected; show one-time and recurring charges distinctly.
- Search for sample company names, dates, tool choices, invented facts and leftover template text. Make sure real client names and approved commercial details are consistent.
- Render every final PDF page and visually inspect it, including dense scope/pricing pages. Check wrapping, alignment, contrast, page breaks, headers/footers and any image/diagram labels. Text extraction alone does not establish visual quality.
- Check searchable text, embedded fonts, actual page numbering and useful bookmarks. Keep the editable private source with the final PDF.
- Return the PDF and a brief summary of what was checked. Sending or publishing requires a separate explicit request.
