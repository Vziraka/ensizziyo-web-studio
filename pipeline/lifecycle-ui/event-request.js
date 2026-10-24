const storageKey = 'evz-pending-desk-event';

// Retain the exact reviewed input across a lost HTTP response; a second click must not invent another approval.
export function createEventRequest({fetch, storage, csrf, actor, base = '/desk', changed = () => {}}) {
  let pending, preparing = false;
  try { pending = JSON.parse(storage.getItem(storageKey)); } catch {}
  if (!pending?.input?.event?.id || !/^[a-f0-9]{64}$/.test(pending.fingerprint ?? '')) pending = null;
  const save = value => {
    if (value) storage.setItem(storageKey, JSON.stringify(value)); else storage.removeItem(storageKey);
    pending = value; changed();
  };
  async function recover() {
    if (!pending) return true;
    const response = await fetch(`${base}/api/events/${encodeURIComponent(pending.input.event.id)}`);
    if (!response.ok) throw Error('Saved-action lookup is unavailable; keep the pending approval.');
    const receipt = await response.json();
    if (!receipt.found) return false;
    if (receipt.fingerprint !== pending.fingerprint) throw Error('The saved event differs from this approval. Keep it held for review.');
    save(null); return true;
  }
  async function dispatch() {
    if (pending.actor !== actor()) throw Error('Sign in as the operator who approved this pending action before retrying it.');
    let response, result;
    try {
      response = await fetch(`${base}/api/event`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Studio-Token': csrf()}, body: JSON.stringify(pending.input)});
      result = await response.json();
    } catch {}
    if (response?.ok && result) { save(null); return result; }
    if (response && [400,409].includes(response.status) && result) { save(null); throw Error(result.error ?? 'The action was rejected. Refresh and review it again.'); }
    try { if (await recover()) return {reconciled: true}; } catch {}
    throw Error('Save outcome is uncertain. Check the pending action or retry its exact retained approval before making another change.');
  }
  return {
    get pending() { return pending && {id: pending.input.event.id, type: pending.input.event.type, actor: pending.actor}; },
    recover,
    async retry() { if (!pending) throw Error('No pending action remains.'); return dispatch(); },
    async send(input) {
      if (preparing) throw Error('The current approval is still being saved.');
      if (pending) {
        if (await recover()) throw Error('The earlier action was saved. Refresh and review before approving another change.');
        throw Error('An earlier save is unresolved. Check or retry its exact retained approval first.');
      }
      preparing = true;
      try {
        const operator = actor(), bytes = new TextEncoder().encode(JSON.stringify({event: input.event, actor: operator}));
        const digest = await crypto.subtle.digest('SHA-256', bytes), fingerprint = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
        save({input: structuredClone(input), actor: operator, fingerprint});
        return await dispatch();
      } finally { preparing = false; }
    }
  };
}
