import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';

const host = value => new URL(value).hostname.replace(/^www\./, '').toLowerCase();
export function validateJob(job) {
  if (!/^[a-z0-9-]{1,60}$/.test(job.id ?? '') || !job.business_name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(job.as_of ?? '')) throw Error('Invalid job identity/date');
  if (!Array.isArray(job.seed_urls) || job.seed_urls.length < 2 || job.seed_urls.length > 4 || new Set(job.seed_urls).size !== job.seed_urls.length) throw Error('Provide 2-4 distinct approved seed URLs');
  for (const value of [job.website, ...job.seed_urls]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || isIP(url.hostname) || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) || host(value) !== host(job.website)) throw Error('Job requires public HTTPS URLs on the approved business host');
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

export function validateSnapshots(snapshot, job) {
  if (!Array.isArray(snapshot?.sources) || snapshot.sources.length < 2 || new Set(snapshot.sources.map(s => s.url)).size !== snapshot.sources.length) throw Error('Missing or duplicate retrieved sources');
  for (const source of snapshot.sources) {
    if (!job.seed_urls.includes(source.url) || source.checked_at !== job.as_of || !source.fetched_at?.startsWith(`${job.as_of}T`) || typeof source.text !== 'string' || source.text.length < 200 || source.text.length > 20_000 || createHash('sha256').update(source.text).digest('hex') !== source.content_sha256) throw Error('Retrieved source integrity check failed');
  }
  return snapshot;
}

export async function collectPublicSources(job, { request = fetch, resolveHost = name => lookup(name, { all: true }), now = () => new Date(), signal } = {}) {
  validateJob(job);
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
      if (fullText.length < 200 || /just a moment|checking your browser|access denied/i.test(fullText.slice(0, 300))) throw Error('Source content is unavailable or blocked');
      const text = fullText.slice(0, 20_000);
      sources.push({ url: original, final_url: current, fetched_at, checked_at: job.as_of, truncated: fullText.length > text.length, content_sha256: createHash('sha256').update(text).digest('hex'), text });
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ url: original, reason: error.message });
    }
  }
  if (sources.length < 2) throw Error('Fewer than two successfully retrieved public sources; no research checkpoint accepted');
  return validateSnapshots({ sources, failures }, job);
}
