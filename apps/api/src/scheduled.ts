import { newId, redact } from '@pulse/core';
import type { Env } from './env';
import { all, run } from './lib/db';
import { TICK_TRIGGERS, processAutomationEvent } from './services/automations';

const OFFLINE_AFTER_MIN = 10;
const DEFAULT_RETENTION_DAYS = 365;

/** Agendador (cron a cada minuto): gatilhos temporais, detecção de desconexão e retenção. */
export async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  const now = new Date(controller.scheduledTime);
  const minuteId = `tick_${Math.floor(now.getTime() / 60000)}`;
  try {
    const owners = await all<{ tenant_id: string; owner_user_id: string; ast_json: string }>(
      env.DB,
      'SELECT tenant_id,owner_user_id,ast_json FROM automations WHERE enabled=1 AND deleted_at IS NULL',
    );
    const seen = new Set<string>();
    for (const o of owners) {
      const kind = (JSON.parse(o.ast_json) as { trigger: { kind: string } }).trigger.kind;
      const key = `${o.tenant_id}|${o.owner_user_id}`;
      if (!TICK_TRIGGERS.has(kind) || seen.has(key)) continue;
      seen.add(key);
      await processAutomationEvent(env, o.tenant_id, o.owner_user_id, {
        id: minuteId,
        kind: 'tick',
        at: new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString(),
      });
    }
    // Dispositivos sem relato recente passam a "desconectado" (nunca mascarar como online).
    const stale = await all<{
      device_id: string;
      tenant_id: string;
      owner_user_id: string;
      last_seen_at: string;
    }>(
      env.DB,
      `SELECT s.device_id, s.tenant_id, d.owner_user_id, d.last_seen_at FROM device_status s JOIN devices d ON d.id=s.device_id WHERE s.connection_state='connected' AND d.last_seen_at<? AND d.revoked_at IS NULL LIMIT 500`,
      new Date(now.getTime() - OFFLINE_AFTER_MIN * 60_000).toISOString(),
    );
    for (const d of stale) {
      const iso = now.toISOString();
      await run(
        env.DB,
        `UPDATE device_status SET connection_state='disconnected', updated_at=? WHERE device_id=?`,
        iso,
        d.device_id,
      );
      await run(
        env.DB,
        'INSERT INTO device_connection_events(id,tenant_id,device_id,state,reason,at) VALUES(?,?,?,?,?,?)',
        newId('evt'),
        d.tenant_id,
        d.device_id,
        'disconnected',
        'no_recent_report',
        iso,
      );
      const offline = Math.floor((now.getTime() - new Date(d.last_seen_at).getTime()) / 60000);
      await processAutomationEvent(env, d.tenant_id, d.owner_user_id, {
        id: `disc_${d.device_id}_${minuteId}`,
        kind: 'device_disconnected',
        at: iso,
        deviceId: d.device_id,
        offlineMinutes: offline,
      });
    }
    await run(
      env.DB,
      `UPDATE device_commands SET status='expired' WHERE status IN ('pending','delivered') AND expires_at<=?`,
      now.toISOString(),
    );
    await run(
      env.DB,
      `UPDATE control_sessions SET state='EXPIRED' WHERE state<>'EXPIRED' AND expires_at<=?`,
      now.toISOString(),
    );
    if (now.getUTCHours() === 3 && now.getUTCMinutes() === 0) await retention(env, now);
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', job: 'scheduled', msg: redact(String(e)) }));
    throw e;
  }
}

/** Retenção configurável (F182, F283): padrão 365 dias para telemetria bruta; agregados permanecem. */
export async function retention(env: Env, now: Date): Promise<void> {
  const tenants = await all<{ id: string }>(env.DB, 'SELECT id FROM organizations');
  for (const t of tenants) {
    const days = Number((await env.CONFIG_KV.get(`retention-days:${t.id}`)) ?? DEFAULT_RETENTION_DAYS);
    await run(
      env.DB,
      'DELETE FROM telemetry_readings WHERE tenant_id=? AND observed_at<?',
      t.id,
      new Date(now.getTime() - days * 86400_000).toISOString(),
    );
  }
  const expired = await all<{ id: string; r2_key: string | null }>(
    env.DB,
    `SELECT id,r2_key FROM exports WHERE state='ready' AND expires_at<?`,
    now.toISOString(),
  );
  for (const e of expired) {
    if (e.r2_key) await env.RAW_BUCKET.delete(e.r2_key);
    await run(env.DB, `UPDATE exports SET state='expired', r2_key=NULL WHERE id=?`, e.id);
  }
  const dayAgo = new Date(now.getTime() - 86400_000).toISOString();
  await run(env.DB, 'DELETE FROM realtime_tickets WHERE expires_at<?', dayAgo);
  await run(env.DB, 'DELETE FROM idempotency_keys WHERE expires_at<?', now.toISOString());
  await run(
    env.DB,
    'DELETE FROM processed_events WHERE processed_at<?',
    new Date(now.getTime() - 30 * 86400_000).toISOString(),
  );
  await run(env.DB, 'DELETE FROM password_resets WHERE expires_at<?', dayAgo);
}
