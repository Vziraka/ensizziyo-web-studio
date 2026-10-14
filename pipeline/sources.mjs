import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';

const host = value => new URL(value).hostname.replace(/^www\./, '').toLowerCase();
export function validateJob(job) {
  if (!/^[a-z0-9-]{1,60}$/.test(job.id ?? '') || !job.business_name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(job.as_of ?? '')) throw Error('Invalid job identity/date');
  const quality = [2, 3].includes(job.research_version);
  if (job.research_version !== undefined && !quality) throw Error('Unknown research version');
  if (typeof job.website !== 'string' || (!quality && !job.website)) throw Error('Website must be explicit; quality research permits an unverified blank');
  if (quality && job.website && /(?:^|\.)(?:facebook\.com|instagram\.com|fb\.com)$/.test(host(job.website))) throw Error('A social profile is not a verified standalone website; leave website blank and use seed URLs');
  if (!Array.isArray(job.seed_urls) || job.seed_urls.length < (quality ? 1 : 2) || job.seed_urls.length > 4 || job.seed_urls.some(url => typeof url !== 'string' || !url.trim()) || new Set(job.seed_urls).size !== job.seed_urls.length) throw Error('Provide distinct approved seed URLs (legacy: 2-4; version 2: 1-4)');
  for (const value of [job.website, ...job.seed_urls].filter(Boolean)) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || isIP(url.hostname) || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) || (!quality && host(value) !== host(job.website))) throw Error('Job requires approved public HTTPS URLs');
  }
}

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  // Keep this proof to global IPv6 unicast; reject mapped IPv4 and local/reserved ranges.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
}

const decode = value => value.replace(/&#(x[0-9a-f]+|\d+);/gi, (match, number) => {
  const point = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
  return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name.toLowerCase()]);

function textFromHtml(html) {
  // shortcut: bounded server-rendered HTML only; JS-only sites need a separately verified collector in S1.
  return decode(html.replace(/<!--[^]*?-->/g, ' ').replace(/<(script|style|noscript|svg)\b[^>]*>[^]*?<\/\1\s*>/gi, ' ')
    .replace(/<a\b[^>]*href=["'](https:\/\/[^"']+|\/[^"']*)["'][^>]*>([^]*?)<\/a>/gi, '$2 [$1]')
    .replace(/<\/(?:p|div|h[1-6]|li|section|header|footer|nav|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n')).trim();
}

export const sourceContentHash = source => createHash('sha256').update(source.reviewed_context ? JSON.stringify({ text: source.text, reviewed_context: source.reviewed_context }) : source.text).digest('hex');
// Form punctuation and the HTML collector's bracketed link targets are not quoted prose words.
export const quotedWordCount = text => text.split(/\s+/).filter(t => /[\p{L}\p{N}]/u.test(t) && !/^\[(?:https:\/\/|\/)[^\]]*\]$/.test(t)).length;

export function validateSnapshots(snapshot, job) {
  const quality = [2, 3].includes(job.research_version);
  if (!Array.isArray(snapshot?.sources) || snapshot.sources.length < (quality ? 1 : 2) || snapshot.sources.length > 4 || new Set(snapshot.sources.map(s => s.url)).size !== snapshot.sources.length) throw Error('Missing or duplicate retrieved sources');
  for (const source of snapshot.sources) {
    if (source.reviewed_context && job.research_version !== 3) throw Error('Reviewed context requires explicit research version 3');
    if (!job.seed_urls.includes(source.url) || source.checked_at !== job.as_of || !source.fetched_at?.startsWith(`${job.as_of}T`) || !Number.isFinite(Date.parse(source.fetched_at)) || typeof source.text !== 'string' || source.text.length < (job.research_version === 3 && source.reviewed_context ? 1 : quality ? 50 : 200) || source.text.length > 20_000 || sourceContentHash(source) !== source.content_sha256) throw Error('Retrieved source integrity check failed');
    if (quality) {
      if (!['business', 'social', 'directory'].includes(source.kind) || !['http', 'reviewed_page', 'search_snippet'].includes(source.capture_method) || !['full', 'partial'].includes(source.coverage) || typeof source.identity_note !== 'string' || source.identity_note.trim().length < 20) throw Error('Source capture/coverage/identity review is required');
      if ((source.capture_method === 'search_snippet' || source.truncated) && source.coverage !== 'partial') throw Error('Snippets and truncated text require partial coverage');
      if (/^(?:log in to (?:facebook|instagram)|login required|sign in to continue|access denied|just a moment|checking your browser)/i.test(source.text.trim())) throw Error('Blocked/login text cannot be business evidence');
    }
    if (source.reviewed_context) {
      const c = source.reviewed_context;
      if (source.capture_method !== 'reviewed_page' || source.coverage !== 'partial') throw Error('Reviewed context retains partial coverage; it is not a copied full page');
      if (typeof c.reviewed_by !== 'string' || c.reviewed_by.trim().length < 3 || c.reviewed_by.length > 200 || typeof c.scope !== 'string' || c.scope.trim().length < 20 || c.scope.length > 1000 || !c.inspected_at?.startsWith(`${job.as_of}T`) || !Number.isFinite(Date.parse(c.inspected_at))) throw Error('Reviewed context needs an identified reviewer, dated inspection and bounded scope');
      if (!Array.isArray(c.facts) || c.facts.length < 1 || c.facts.length > 8 || new Set(c.facts.map(f => f.id)).size !== c.facts.length) throw Error('Provide 1-8 distinct reviewed context facts');
      const excerpts = new Set(), normalize = t => t.replace(/\s+/g, ' ').trim();
      for (const f of c.facts) {
        if (!/^[a-z0-9-]{1,40}$/.test(f.id ?? '') || typeof f.statement !== 'string' || f.statement.trim().length < 10 || f.statement.length > 800 || typeof f.excerpt !== 'string' || !quotedWordCount(f.excerpt) || f.excerpt.length > 160 || !normalize(source.text).includes(normalize(f.excerpt))) throw Error('Each context fact needs a bounded statement and exact captured anchor');
        if (f.published_at !== null && (typeof f.published_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f.published_at) || !Number.isFinite(Date.parse(f.published_at)) || f.published_at > job.as_of)) throw Error('Publication date must be observed, not the inspection date; use null when unknown');
        excerpts.add(normalize(f.excerpt));
      }
      if (quotedWordCount(source.text) > 25 || quotedWordCount([...excerpts].join(' ')) > 25) throw Error('Reviewed context exceeds the per-source short-quote budget');
    }
  }
  return snapshot;
}

export async function collectPublicSources(job, { request = fetch, resolveHost = name => lookup(name, { all: true }), now = () => new Date(), signal } = {}) {
  validateJob(job);
  if ([2, 3].includes(job.research_version) && (!job.website || job.seed_urls.some(url => host(url) !== host(job.website)))) throw Error('External/social sources require explicitly reviewed capture import before execution');
  const fetched_at = now().toISOString();
  if (fetched_at.slice(0, 10) !== job.as_of) throw Error('Job date is stale; prepare a new dated job');
  const sources = [], failures = [];
  for (const original of job.seed_urls) {
    try {
      let current = original, response;
      for (let redirect = 0; redirect <= 2; redirect++) {
        const addresses = await resolveHost(new URL(current).hostname);
        if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw Error('Non-public source address');
        const timeout = AbortSignal.timeout(20_000);
        response = await request(current, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Accept: 'text/html,text/plain' } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const target = new URL(response.headers.get('location'), current);
          if (redirect === 2 || target.protocol !== 'https:' || target.username || target.password || target.port || host(target.href) !== host(job.website)) throw Error('Redirect outside approved source scope');
          current = target.href;
        } else break;
      }
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !/^(text\/html|text\/plain)(?:;|$)/i.test(type)) { await response.body?.cancel(); throw Error('Source did not return readable public content'); }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > 512_000) throw Error('Source exceeds proof size bound'); chunks.push(chunk); }
      const raw = Buffer.concat(chunks).toString('utf8');
      const fullText = /text\/html/i.test(type) ? textFromHtml(raw) : raw.trim();
      if (fullText.length < 200 || /just a moment|checking your browser|access denied|log in to (?:facebook|instagram)|login required/i.test(fullText.slice(0, 300))) throw Error('Source content is unavailable or blocked');
      const text = fullText.slice(0, 20_000);
      const quality = [2, 3].includes(job.research_version) ? { kind: 'business', capture_method: 'http', coverage: fullText.length > text.length ? 'partial' : 'full', identity_note: 'Caller-approved business website host; identity still requires source review.' } : {};
      sources.push({ url: original, final_url: current, fetched_at, checked_at: job.as_of, truncated: fullText.length > text.length, content_sha256: createHash('sha256').update(text).digest('hex'), text, ...quality });
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ url: original, reason: error.message });
    }
  }
  if (sources.length < ([2, 3].includes(job.research_version) ? 1 : 2)) throw Error('Fewer than two successfully retrieved public sources for legacy proof, or none for quality research; no research checkpoint accepted');
  return validateSnapshots({ sources, failures }, job);
}
