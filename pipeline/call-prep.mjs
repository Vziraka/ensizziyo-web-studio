// Inputs have already passed the retained report and independent review checks.
export function researchCallPrep(f, decision, reviewedAt) {
  const opportunity = f.report.opportunities[decision.opportunity_index];
  const route = f.report.journey_checks?.find(c => c.area === 'enquiry_or_ordering');
  const reviewed = f.report.observations.filter((_, i) => decision.observations.some(c => c.index === i && c.supported));
  const basis = reviewed.find(o => o.fact === opportunity.observed_basis);
  const observations = (basis ? [basis] : reviewed.slice(0, 1)).map(o => ({
    fact: o.fact, sources: o.evidence.map(e => ({ url: e.url, checked_at: f.snapshots.sources.find(s => s.url === e.url)?.fetched_at, excerpt: e.excerpt }))
  }));
  return { version: 1, reviewed_at: reviewedAt, observations,
    current_route: route ? { status: route.status, finding: route.finding } : null,
    existing_alternatives: opportunity.existing_alternatives,
    hypothesis: opportunity.proposed_solution, possible_effect: opportunity.possible_effect,
    unknowns: [...new Set([...f.report.unknowns, opportunity.validation_needed])],
    opening: `Hi, I’m calling from EVZ Digital. ${observations[0]?.fact.length <= 220 ? `I noticed: ${observations[0].fact} ` : `I was looking at ${f.job.business_name}. `}I had an idea I wanted to check with you. Have you got a moment for a quick question?`,
    questions: [opportunity.owner_question, 'Which tools, links or messages already handle that step, and what works well?', 'What would you most like to make easier for customers or for yourself?'] };
}
