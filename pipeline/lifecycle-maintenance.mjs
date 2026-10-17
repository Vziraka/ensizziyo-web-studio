import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { publishLifecycle } from './lifecycle-sync.mjs';
import { businessDate, check } from './lifecycle.mjs';

export async function maintainOperations(app, { publish = publishLifecycle } = {}) {
  const today = businessDate(app.now()), state = await app.snapshot();
  try {
    if (app.config.google) await publish(app);
    await app.change(s => { delete s.operations.holds.synchronization; });
  } catch (error) { await app.change(s => { s.operations.holds.synchronization = error.message; }); }
  if (state.operations.maintenance?.backup_date !== today) {
    try {
      const directory = join(app.directory, 'backups'); await mkdir(directory, { recursive: true });
      const path = join(directory, `operations-${today}-${Date.now()}.json`), receipt = await app.backup(path);
      await app.change(s => { s.operations.maintenance = { ...s.operations.maintenance, backup_date: today, backup_sha256: receipt.sha256, backup_path: path, backup_at: app.now().toISOString() }; delete s.operations.holds.backup; });
    } catch (error) { await app.change(s => { s.operations.holds.backup = error.message; }); }
  }
  for (const key of (state.operations.prune_receipts ?? []).slice(0, 120)) {
    check(/^ops-[a-f0-9-]{36}$/.test(key), 'Unsafe poll receipt retention key');
    await unlink(join(app.directory, 'receipts', `${key}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await app.change(s => { s.operations.prune_receipts = s.operations.prune_receipts.filter(k => k !== key); });
  }
  return { synchronized: !(await app.snapshot()).operations.holds.synchronization, backup_date: (await app.snapshot()).operations.maintenance?.backup_date };
}
