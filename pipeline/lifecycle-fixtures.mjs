import { hash } from './lifecycle.mjs';
import {replyContent} from './reply-content.mjs';

export function fixtureReply(source_id='reply',thread_id='thread',from='owner@example.invalid',text='Could you share examples of website work?'){
  const payload={mime_type:'text/plain',headers:[{name:'From',value:from},{name:'To',value:'hello@evzdigital.studio'},{name:'Subject',value:'Re: Website question'},{name:'Message-ID',value:`<${source_id}@example.invalid>`},{name:'In-Reply-To',value:'<original@example.invalid>'}],body:{content:text}};
  return {source_id,thread_id,kind:'reply',content:replyContent({id:source_id,payload},thread_id)};
}

export const fixtureTranscript = 'Owner: I run Juniper Bakery, a fictional business for this controlled test. I sell weekly pastry boxes through Instagram. I would like a preorder page so customers can choose a box and request pickup. I am the owner and would like to discuss a paid project. I have not decided a budget or launch date.';
export const fixtureProposal = { schema_version: 1, transcript_sha256: hash(fixtureTranscript), outcome: 'discovery', callback_at: null,
  summary: 'The fictional owner wants to discuss a paid preorder-page project. Budget and launch timing remain unknown.',
  claims: [{ claim: 'The speaker says they are the owner.', quote: 'I am the owner' },
    { claim: 'They want a preorder page for box selection and pickup requests.', quote: 'I would like a preorder page so customers can choose a box and request pickup.' },
    { claim: 'They want to discuss a paid project.', quote: 'would like to discuss a paid project.' }], unknowns: ['Budget', 'Launch date', 'Detailed acceptance criteria'] };
export const fixtureQuote = { price_cents: 120000, initial_payment_cents: 60000, currency: 'USD', revision_rounds: 1,
  scope: 'FICTIONAL TEST: one preorder request flow', deliverables: 'Menu, box detail and pickup request screens', exclusions: 'Payments, stock management and advertising spend',
  timeline: 'FICTIONAL TEST: two weeks after approved materials', acceptance: 'A test preorder reaches the client-owned inquiry destination; mobile and errors checked',
  ownership: 'Client owns paid original deliverables. Existing tools and assets retain their licenses.', support_terms: 'FICTIONAL TEST: seven days of scoped defect fixes; ongoing support separately agreed',
  change_terms: 'Written change scope, price and acceptance before extra work', cancellation_terms: 'Written settlement for completed work and unused prepaid amounts', reference: 'fixture:approved quote — no commercial commitment' };
export function fixtureProspect(id, at, name = 'STUDIO TEST Juniper Bakery') {
  return { id: `import-${id}`, prospect_id: id, type: 'prospect_imported', at, data: { company_id: `company-${id}`, name, category: 'Food / bakery', controlled: true,
    idea: 'A simple preorder page for weekly pastry boxes, keeping Instagram as the discovery channel.',
    call_prep: { version: 1, reviewed_at: at,
      observations: [{ fact: 'The fictional menu advertises weekly pastry boxes and DM pickup requests.', sources: [{ url: 'https://example.invalid/menu', checked_at: at, excerpt: 'Weekly pastry boxes; DM for pickup' }] }],
      current_route: { status: 'Observed', finding: 'The fictional customer route uses Instagram DMs for pickup requests.' }, existing_alternatives: ['Instagram DMs'],
      hypothesis: 'An optional menu and pickup request page alongside the current DMs.', possible_effect: 'Customers might prepare their request more easily; discuss this with the owner.',
      unknowns: ['Owner goals, budget and other tools are unknown.'],
      opening: 'Hi, I’m calling from EVZ Digital. I saw your weekly pastry boxes and had an idea for a small addition alongside your DMs. Have you got a moment for a quick question?',
      questions: ['Would a menu and pickup request page complement your current DMs?', 'Which tools already handle that step, and what works well?', 'What would you most like to make easier?'] },
    qualification: { verdict: 'Research-qualified', independent_review: 'Accepted', checked_at: at, report_sha256: hash('fictional report'),
      review_sha256: hash('fictional independent review'), evidence_ref: 'fixture:synthetic evidence; not a real researched prospect' },
    contact: { email: `${id}@example.invalid`, verified: true, checked_at: at, source: 'fixture:synthetic public business contact' } } };
}
export async function fixtureStartBuild(app,id,actor='controlled-fixture') {
  const {buildBasis}=await import('./local-delivery-gates.mjs');
  return app.apply({id:`${id}-start-build`,prospect_id:id,type:'build_started',at:app.now().toISOString(),data:{basis_sha256:buildBasis((await app.snapshot()).prospects[id]),authorized:true,reference:'fixture:separate Start build authorization'}},{actor});
}
export async function fixtureAcceptDelivery(app,id,actor='controlled-fixture') {
  const at=app.now().toISOString();
  await app.apply({id:`${id}-approver`,prospect_id:id,type:'client_approver_registered',at,data:{approver_id:'fictional-client',name:'Fictional client decision-maker',authority_confirmed:true,reference:'fixture:approver authority'}},{actor});
  const {version,content_sha256}=(await app.snapshot()).prospects[id].delivery;
  return app.apply({id:`${id}-exact-acceptance`,prospect_id:id,type:'acceptance_recorded',at,data:{version,content_sha256,approver_id:'fictional-client',client_approval_verified:true,reference:'fixture:operator-attested exact client approval'}},{actor});
}
export async function fixturePublish(app,id,actor='controlled-fixture') {
  const at=app.now().toISOString(),{version,content_sha256}=(await app.snapshot()).prospects[id].delivery;
  const data={version,content_sha256,target:'fixture:local-preview',intent_id:`${id}-release`,receipt_id:`${id}-receipt`,simulated:true,authorized:true,reference:'fixture:simulated publication only'};
  for(const type of ['publication_authorized','publication_intent_prepared','publication_dispatched','publication_receipt_recorded'])await app.apply({id:`${id}-${type}`,prospect_id:id,type,at,data},{actor});
}
export async function seedLifecycle(app) {
  const at = app.now().toISOString();
  const apply = (id, type, data = {}, suffix = type) => app.apply({ id: `${id}-${suffix}`, prospect_id: id, type, at, data }, { actor: 'controlled-fixture' });
  for (const id of ['juniper', 'maple', 'cedar']) await app.apply(fixtureProspect(id, at,
    ({ juniper: 'STUDIO TEST Juniper Bakery', maple: 'STUDIO TEST Maple Café', cedar: 'STUDIO TEST Cedar Beverages' })[id]), { actor: 'controlled-fixture' });
  await apply('maple', 'call_logged', { call_id: 'maple-call-1', outcome: 'no_answer', performed_at: at, simulated: true });
  for (const id of ['juniper', 'cedar']) {
    const call_id = `${id}-call-1`;
    await apply(id, 'call_logged', { call_id, outcome: 'connected', performed_at: at, simulated: true });
    const transcript = id === 'cedar' ? fixtureTranscript.replace('Juniper Bakery', 'Cedar Beverages') : fixtureTranscript;
    const proposal = { ...fixtureProposal, transcript_sha256: hash(transcript) };
    await apply(id, 'transcript_added', { call_id, text: transcript, permission_confirmed: true });
    await apply(id, 'transcript_assessed', { call_id, proposal, review: { verdict: 'Accepted', proposal_sha256: hash(proposal), independent: true, source: 'simulated review fixture' } });
    if (id === 'juniper') continue; // A labelled fixture makes the owner-review interaction testable without model usage.
    await apply(id, 'call_reviewed', { call_id, proposal_sha256: hash(proposal), outcome: 'discovery' });
    await apply(id, 'discovery_confirmed', { goal: 'Preorders with clear pickup details', decision_maker: 'Fictional owner', serious_interest: true, paid_fit_discussed: true, service: 'website', main_flow: 'Choose a box and request pickup', preview_screens: 3 });
    await apply(id, 'preview_recorded', { reference: '/preview/', brief: 'One three-screen preorder flow', reviewed_with_owner: true });
    await apply(id, 'proposal_approved', fixtureQuote);
    const quote = (await app.snapshot()).prospects[id].quote;
    await apply(id, 'agreement_recorded', { reference: 'fixture:signed acceptance', signed_verified: true, quote_sha256: hash(quote) });
    await apply(id, 'invoice_recorded', { invoice_id: `${id}-invoice-1`, amount_cents: 120000, currency: 'USD', reference: 'fixture:invoice' });
    await apply(id, 'payment_recorded', { invoice_id: `${id}-invoice-1`, payment_id: `${id}-payment-1`, amount_cents: 120000, currency: 'USD', settled_verified: true, simulated: true, reference: 'fixture:settled payment — no transaction' });
    await apply(id, 'onboarding_completed', { materials: 'Fictional menu, assets and pickup text', access_plan: 'Client-owned accounts and scoped invitations; credentials stay in owner vault', kickoff: 'Fictional kickoff agreed after materials' });
    await fixtureStartBuild(app,id);
    for (let i = 1; i <= 4; i++) await apply(id, 'delivery_task_updated', { task_id: `task-${i}`, status: 'Complete', evidence: `fixture:verified check ${i}` }, `task-${i}`);
    await apply(id, 'delivery_submitted', { reference: '/preview/',version:'v1',content_sha256:hash('fictional delivery v1'),internal_checks:true });
    await apply(id, 'revision_requested', { feedback: 'Clarify pickup wording', reference: 'fixture:client feedback' });
    await apply(id, 'delivery_task_updated', { task_id: 'revision-1', status: 'Complete', evidence: 'fixture:wording recheck' }, 'revision-task');
    await apply(id, 'delivery_submitted', { reference: '/preview/',version:'v2',content_sha256:hash('fictional delivery v2'),internal_checks:true }, 'delivery-v2');
    await fixtureAcceptDelivery(app,id);
    await fixturePublish(app,id);
    await apply(id, 'handover_completed', { ownership: 'fixture:ownership', training: 'fixture:operating guide', backup: 'fixture:backup restore', support: 'fixture:bounded support agreement' });
    await apply(id, 'support_opened', { ticket_id: 'support-1', description: 'Clarify a pickup-hours change', priority: 'routine', review_at: new Date(+app.now() + 86_400_000).toISOString() });
  }
  return { seeded: ['juniper', 'maple', 'cedar'], real_businesses: 0, sends: 0 };
}
