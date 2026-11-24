import type { Env } from './types.js';

export async function operationsSummary(env: Env, time = new Date()) {
  const seconds = Math.floor(time.getTime() / 1000);
  const month = time.toISOString().slice(0, 7);
  const totals = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reflection_accounts WHERE paid_until > ?) AS paidAccounts,
      (SELECT checked FROM maintenance_status WHERE id = 1) AS lastMaintenance,
      (SELECT healthy FROM maintenance_status WHERE id = 1) AS maintenanceHealthy,
      used_bytes AS syncBytes,
      COALESCE((SELECT count FROM rate_limits WHERE key = ?), 0) AS signInAttempts,
      COALESCE((SELECT SUM(micros) FROM reflection_usage WHERE month = ?), 0) +
      COALESCE((SELECT micros FROM erased_usage_totals WHERE month = ?), 0) AS budgetMicros
    FROM sync_capacity WHERE id = 1
  `).bind(seconds, 'mail-total:' + Math.floor(seconds / 86400), month, month).first<{
    paidAccounts: number; lastMaintenance: number | null; maintenanceHealthy: number | null;
    syncBytes: number; signInAttempts: number; budgetMicros: number;
  }>();
  if (!totals) throw new Error('Operational totals unavailable');
  return {
    version: 1, checkedAt: time.toISOString(),
    healthy: totals.maintenanceHealthy === 1 && totals.lastMaintenance !== null && totals.lastMaintenance >= seconds - 3600,
    lastMaintenance: totals.lastMaintenance, paidAccounts: totals.paidAccounts,
    syncBytes: totals.syncBytes, syncLimitBytes: Number(env.SYNC_CAPACITY_BYTES ?? 134217728),
    signInAttempts: totals.signInAttempts, budgetMicros: totals.budgetMicros,
    budgetLimitMicros: Number(env.REFLECTION_GLOBAL_MICROS)
  };
}
