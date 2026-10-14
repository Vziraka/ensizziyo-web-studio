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
const boundedArray = (items, minItems, maxItems) => ({ ...array(items, minItems), maxItems });
const qualityCommon = { ...common, schema_version: { type: 'integer', const: 2 }, sources: boundedArray(source, 1, 4), unknowns: boundedArray(text, 0, 8) };
export const qualityCheckpointSchema = object(qualityCommon);
export const qualityReportSchema = object({ ...qualityCommon, checkpoint_reused: { type: 'boolean', const: true },
  observations: boundedArray(object({ fact: text, source_urls: boundedArray(text, 1, 2), evidence: boundedArray(object({ url: text, excerpt: { ...text, maxLength: 160 } }), 1, 2) }), 1, 6),
  opportunities: boundedArray(object({ ...reportSchema.properties.opportunities.items.properties, existing_alternatives: boundedArray(text, 0, 3), validation_needed: text }), 0, 2),
  public_contact_routes: boundedArray(text, 0, 4), recommendation: { type: 'string', enum: ['Suitable to discuss', 'No strong public case', 'Needs review', 'Insufficient evidence'] }
});
const primarySource = s => ['business', 'social'].includes(s.kind) && s.capture_method !== 'search_snippet' && s.coverage === 'full';
export function schemasFor(job, snapshots) {
  if (job.research_version !== 2) return { checkpoint: checkpointSchema, report: reportSchema };
  const limited = snapshots && !snapshots.sources.some(primarySource);
  const report = limited ? { ...qualityReportSchema, properties: { ...qualityReportSchema.properties,
    recommendation: { type: 'string', const: 'Insufficient evidence' }, opportunities: { ...qualityReportSchema.properties.opportunities, maxItems: 0 }
  } } : qualityReportSchema;
  return { checkpoint: qualityCheckpointSchema, report };
}

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
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw Error(`${path}: too many items`);
    for (const [i, item] of value.entries()) validate(item, schema.items, `${path}[${i}]`);
  } else if (schema.type === 'integer' ? !Number.isInteger(value) : typeof value !== schema.type) throw Error(`${path}: wrong type`);
  if (schema.minLength && !value.trim()) throw Error(`${path}: empty text`);
  if (schema.maxLength && value.length > schema.maxLength) throw Error(`${path}: too much text`);
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${path}: invalid choice`);
  if ('const' in schema && value !== schema.const) throw Error(`${path}: wrong version/flag`);
  return value;
}

export function validateEvidence(value, job, report = false, snapshots) {
  validate(value, schemasFor(job)[report ? 'report' : 'checkpoint']);
  if (value.job_id !== job.id || value.business_name !== job.business_name) throw Error('Result does not match job identity');
  const host = url => new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  const urls = new Set();
  for (const source of value.sources) {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password || (job.research_version === 2 ? !job.seed_urls.includes(source.url) : host(source.url) !== host(job.website))) throw Error('Source outside approved business evidence');
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
    for (const route of value.public_contact_routes) if (new URL(route).protocol !== 'https:' || (job.research_version === 2 ? !snapshots?.sources.some(s => s.url === route) : host(route) !== host(job.website))) throw Error('Contact route outside captured sources');
    if (job.research_version === 2) {
      if (!snapshots) throw Error('Quality reports require captured evidence');
      const normalize = text => text.replace(/\s+/g, ' ').trim();
      const excerpts = new Map();
      for (const observation of value.observations) {
        for (const evidence of observation.evidence) {
          const capture = snapshots.sources.find(s => s.url === evidence.url);
          if (!observation.source_urls.includes(evidence.url) || !urls.has(evidence.url) || !capture || !normalize(capture.text).includes(normalize(evidence.excerpt))) throw Error('Observation excerpt is not present in its captured source');
          const saved = excerpts.get(evidence.url) ?? new Set(); saved.add(normalize(evidence.excerpt)); excerpts.set(evidence.url, saved);
        }
        if (observation.source_urls.some(url => !observation.evidence.some(e => e.url === url))) throw Error('Each observation source requires an evidence excerpt');
      }
      for (const saved of excerpts.values()) if ([...saved].join(' ').split(/\s+/).length > 25) throw Error('Evidence excerpts exceed the short-quote budget per source');
      const adequate = snapshots.sources.some(primarySource);
      if (!adequate && (value.recommendation !== 'Insufficient evidence' || value.opportunities.length)) throw Error('Limited/directory-only evidence cannot qualify a business or support opportunities');
      for (const opportunity of value.opportunities) {
        const basis = value.observations.find(o => o.fact === opportunity.observed_basis);
        if (!basis.evidence.some(e => snapshots.sources.some(s => s.url === e.url && primarySource(s)))) throw Error('An opportunity requires a directly supported primary observation');
      }
      if (['No strong public case', 'Insufficient evidence'].includes(value.recommendation) && value.opportunities.length) throw Error('Recommendation conflicts with recorded opportunities');
      if (value.recommendation === 'Suitable to discuss' && !value.opportunities.length) throw Error('A discussion recommendation requires an observed opportunity');
    }
  }
  return value;
}
