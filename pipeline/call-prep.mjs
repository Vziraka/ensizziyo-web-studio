// Inputs have already passed the retained report and independent review checks.
export function researchCallPrep(f, decision, reviewedAt) {
  const opportunity = f.report.opportunities[decision.opportunity_index];
  const route = f.report.journey_checks?.find(c => c.area === 'enquiry_or_ordering');
  const reviewed = f.report.observations.filter((_, i) => decision.observations.some(c => c.index === i && c.supported));
  const basis = reviewed.find(o => o.fact === opportunity.observed_basis);
  const hook = String(basis?.evidence?.[0]?.excerpt ?? '').replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!hook) throw Error('A focused call opening needs an exact retained excerpt supporting the reviewed opportunity');
  const quote = hook.length > 140 ? `${hook.slice(0, 137).trimEnd()}…` : hook;
  const observations = (basis ? [basis] : reviewed.slice(0, 1)).map(o => ({
    fact: o.fact, sources: o.evidence.map(e => ({ url: e.url, checked_at: f.snapshots.sources.find(s => s.url === e.url)?.fetched_at, excerpt: e.excerpt }))
  }));
  return { version: 1, reviewed_at: reviewedAt, observations,
    current_route: route ? { status: route.status, finding: route.finding } : null,
    existing_alternatives: opportunity.existing_alternatives,
    hypothesis: opportunity.proposed_solution, possible_effect: opportunity.possible_effect,
    unknowns: [...new Set([...f.report.unknowns, opportunity.validation_needed])],
    opening: `Hi, I’m calling from EVZ Digital. I noticed ${f.job.business_name} mentions “${quote}.” I had one question about that: ${opportunity.owner_question} Have you got a moment?`,
    questions: [opportunity.owner_question, 'Which tools, links or messages already handle that step, and what works well?', 'What would you most like to make easier for customers or for yourself?'] };
}
