const text = { type: 'string', minLength: 1 };
const array = (items, minItems = 0) => ({ type: 'array', items, minItems });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const source = object({ url: text, checked_at: text, content_sha256: text, facts: array(text, 1) });
const common = { schema_version: { type: 'integer', const: 1 }, job_id: text, business_name: text, sources: array(source, 2), unknowns: array(text) };
export const checkpointSchema = object(common);
export const reportSchema = object({ ...common, checkpoint_reused: { type: 'boolean', const: true },
  observations: array(object({ fact: text, source_urls: array(text, 1) }), 4),
  opportunities: array(object({ observed_basis: text, possible_effect: text, proposed_solution: text, service_area: { type: 'string', enum: ['websites', 'systems', 'ai', 'marketing'] }, confidence: { type: 'string', const: 'hypothesis' }, owner_question: text })),
  public_contact_routes: array(text), recommendation: { type: 'string', enum: ['Suitable to discuss', 'No strong public case', 'Needs review'] }
});

export function validate(value, schema, path = 'result') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${path}: expected object`);
    for (const key of schema.required) if (!(key in value)) throw Error(`${path}: missing ${key}`);
    for (const key of Object.keys(value)) {
      if (!(key in schema.properties)) throw Error(`${path}: unexpected ${key}`);
      validate(value[key], schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems) throw Error(`${path}: insufficient items`);
    for (const [i, item] of value.entries()) validate(item, schema.items, `${path}[${i}]`);
  } else if (schema.type === 'integer' ? !Number.isInteger(value) : typeof value !== schema.type) throw Error(`${path}: wrong type`);
  if (schema.minLength && !value.trim()) throw Error(`${path}: empty text`);
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${path}: invalid choice`);
  if ('const' in schema && value !== schema.const) throw Error(`${path}: wrong version/flag`);
  return value;
}

export function validateEvidence(value, job, report = false, snapshots) {
  validate(value, report ? reportSchema : checkpointSchema);
  if (value.job_id !== job.id || value.business_name !== job.business_name) throw Error('Result does not match job identity');
  const host = url => new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  const urls = new Set();
  for (const source of value.sources) {
    const url = new URL(source.url);
    // shortcut: this proof uses the business's own site; expand approved source hosts during S1.
    if (url.protocol !== 'https:' || url.username || url.password || host(source.url) !== host(job.website)) throw Error('Source outside approved business website');
    if (source.checked_at !== job.as_of) throw Error('Source check date does not match job');
    if (!/^[a-f0-9]{64}$/.test(source.content_sha256)) throw Error('Source content hash is missing or invalid');
    if (snapshots && !snapshots.sources.some(s => s.url === source.url && s.content_sha256 === source.content_sha256 && s.checked_at === source.checked_at)) throw Error('Source does not match retrieved evidence');
    if (urls.has(source.url)) throw Error('Duplicate source URL');
    if (source.facts.some(fact => /(?:fetch|web access|page (?:access|text|read)).*(?:reject|unavailable|fail|denied|not returned)|(?:reject|fail|denied).*fetch|no successful page read/i.test(fact))) throw Error('Failed page access is not evidence');
    urls.add(source.url);
  }
  if (report) {
    for (const observation of value.observations) if (observation.source_urls.some(url => !urls.has(url))) throw Error('Observation references missing evidence');
    for (const opportunity of value.opportunities) if (!value.observations.some(o => o.fact === opportunity.observed_basis)) throw Error('Opportunity has no recorded observation');
    for (const route of value.public_contact_routes) if (new URL(route).protocol !== 'https:' || host(route) !== host(job.website)) throw Error('Contact route outside approved website');
  }
  return value;
}
