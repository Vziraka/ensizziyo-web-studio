export function dailyCallQueue(records, now = new Date()) {
  const rank = { callback: 0, follow_up: 1, 'follow-up': 1, new: 2 }, selected = new Map();
  for (const record of [...records].sort((a, b) => (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3) || Date.parse(a.due_at) - Date.parse(b.due_at))) {
    if (record.company_id && !record.stopped && record.status === 'scheduled' && Number.isFinite(Date.parse(record.due_at)) && Date.parse(record.due_at) <= +now && !selected.has(record.company_id)) selected.set(record.company_id, record);
  }
  return [...selected.values()];
}
