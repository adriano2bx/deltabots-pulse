import { newId } from '@pulse/core';
import type { Env, JobMessage } from '../env';
import { all, first, run, stmt } from '../lib/db';

const EXPORT_TTL_MS = 24 * 3600_000;

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Neutraliza injeção de fórmula em planilhas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Exportação de portabilidade (F113, F137, F186): objeto privado no R2 sob o prefixo do tenant. */
export async function buildExport(env: Env, exportId: string): Promise<void> {
  const ex = await first<{
    id: string;
    tenant_id: string;
    owner_user_id: string;
    kind: string;
    state: string;
  }>(env.DB, 'SELECT id,tenant_id,owner_user_id,kind,state FROM exports WHERE id=?', exportId);
  if (!ex || ex.state === 'ready') return;
  await run(env.DB, `UPDATE exports SET state='running' WHERE id=?`, ex.id);
  const devices = await all<{ id: string; model: string; firmware: string | null; created_at: string }>(
    env.DB,
    'SELECT id,model,firmware,created_at FROM devices WHERE tenant_id=? AND owner_user_id=?',
    ex.tenant_id,
    ex.owner_user_id,
  );
  const devIds = devices.map((d) => d.id);
  const readings = devIds.length
    ? await all<Record<string, unknown>>(
        env.DB,
        `SELECT device_id,reading_id,kind,observed_at,received_at,value_num,value_json,unit,quality,firmware FROM telemetry_readings WHERE tenant_id=? AND device_id IN (${devIds.map(() => '?').join(',')}) ORDER BY observed_at LIMIT 500000`,
        ex.tenant_id,
        ...devIds,
      )
    : [];
  let body: string;
  let contentType: string;
  if (ex.kind === 'telemetry_csv') {
    const cols = [
      'device_id',
      'reading_id',
      'kind',
      'observed_at',
      'received_at',
      'value_num',
      'value_json',
      'unit',
      'quality',
      'firmware',
    ];
    body = [cols.join(','), ...readings.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\n');
    contentType = 'text/csv; charset=utf-8';
  } else {
    const full = ex.kind === 'full_json';
    const profile = full
      ? await first(
          env.DB,
          'SELECT id,email,display_name,locale,timezone,created_at FROM users WHERE id=?',
          ex.owner_user_id,
        )
      : undefined;
    const consents = full
      ? await all(
          env.DB,
          'SELECT purpose,policy_version,granted_at,revoked_at FROM consents WHERE tenant_id=? AND user_id=?',
          ex.tenant_id,
          ex.owner_user_id,
        )
      : undefined;
    const sleep =
      full && devIds.length
        ? await all(
            env.DB,
            `SELECT device_id,start_at,end_at,stage,quality FROM sleep_intervals WHERE tenant_id=? AND device_id IN (${devIds.map(() => '?').join(',')})`,
            ex.tenant_id,
            ...devIds,
          )
        : undefined;
    const automations = full
      ? await all(
          env.DB,
          'SELECT id,title,enabled,version,ast_json,created_at FROM automations WHERE tenant_id=? AND owner_user_id=? AND deleted_at IS NULL',
          ex.tenant_id,
          ex.owner_user_id,
        )
      : undefined;
    const grants = full
      ? await all(
          env.DB,
          'SELECT id,grantee_user_id,scope_json,created_at,revoked_at FROM share_grants WHERE tenant_id=? AND owner_user_id=?',
          ex.tenant_id,
          ex.owner_user_id,
        )
      : undefined;
    body = JSON.stringify(
      {
        format: 'deltabots-pulse-export',
        version: 1,
        generated_at: new Date().toISOString(),
        profile,
        consents,
        devices,
        readings,
        sleep,
        automations,
        shares: grants,
      },
      null,
      1,
    );
    contentType = 'application/json';
  }
  const key = `tenants/${ex.tenant_id}/exports/${ex.id}.${ex.kind === 'telemetry_csv' ? 'csv' : 'json'}`;
  await env.RAW_BUCKET.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { owner: ex.owner_user_id },
  });
  await run(
    env.DB,
    `UPDATE exports SET state='ready', r2_key=?, expires_at=? WHERE id=?`,
    key,
    new Date(Date.now() + EXPORT_TTL_MS).toISOString(),
    ex.id,
  );
}

async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  do {
    const list = await bucket.list({ prefix, cursor });
    if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
    n += list.objects.length;
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return n;
}

/**
 * Exclusão de conta (F114, F138, T012): revoga acessos, apaga dados do titular em D1/R2 e
 * anonimiza o registro de usuário, mantendo auditoria minimizada da conclusão.
 */
export async function deleteAccount(env: Env, deletionId: string): Promise<void> {
  const d = await first<{ id: string; tenant_id: string; user_id: string; state: string }>(
    env.DB,
    'SELECT id,tenant_id,user_id,state FROM deletion_requests WHERE id=?',
    deletionId,
  );
  if (!d || d.state === 'completed') return;
  const uid = d.user_id;
  const now = new Date().toISOString();
  const personal = await all<{ id: string }>(
    env.DB,
    `SELECT o.id FROM organizations o JOIN org_members m ON m.tenant_id=o.id WHERE m.user_id=? AND m.role='owner' AND o.plan_id='personal'`,
    uid,
  );
  const devs = await all<{ id: string }>(env.DB, 'SELECT id FROM devices WHERE owner_user_id=?', uid);
  const devIds = devs.map((x) => x.id);
  const inDev = devIds.length ? `IN (${devIds.map(() => '?').join(',')})` : 'IN (NULL)';
  const autos = await all<{ id: string }>(env.DB, 'SELECT id FROM automations WHERE owner_user_id=?', uid);
  const autoIds = autos.map((a) => a.id);
  const inAuto = autoIds.length ? `IN (${autoIds.map(() => '?').join(',')})` : 'IN (NULL)';
  const steps: Record<string, number> = {};
  const exec = async (label: string, s: D1PreparedStatement) => {
    const r = await s.run();
    steps[label] = (steps[label] ?? 0) + (r.meta.changes ?? 0);
  };
  await exec(
    'sessions',
    stmt(env.DB, 'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now, uid),
  );
  await exec(
    'api_keys',
    stmt(env.DB, 'UPDATE api_keys SET revoked_at=? WHERE owner_user_id=? AND revoked_at IS NULL', now, uid),
  );
  await exec(
    'grants',
    stmt(env.DB, 'DELETE FROM share_grants WHERE owner_user_id=? OR grantee_user_id=?', uid, uid),
  );
  await exec('invitations', stmt(env.DB, 'DELETE FROM share_invitations WHERE owner_user_id=?', uid));
  await exec(
    'telemetry',
    env.DB.prepare(`DELETE FROM telemetry_readings WHERE device_id ${inDev}`).bind(...devIds),
  );
  await exec(
    'aggregates',
    env.DB.prepare(`DELETE FROM telemetry_aggregates WHERE device_id ${inDev}`).bind(...devIds),
  );
  await exec('sleep', env.DB.prepare(`DELETE FROM sleep_intervals WHERE device_id ${inDev}`).bind(...devIds));
  await exec('activities', stmt(env.DB, 'DELETE FROM activity_sessions WHERE owner_user_id=?', uid));
  await exec(
    'device_status',
    env.DB.prepare(`DELETE FROM device_status WHERE device_id ${inDev}`).bind(...devIds),
  );
  await exec(
    'device_events',
    env.DB.prepare(`DELETE FROM device_connection_events WHERE device_id ${inDev}`).bind(...devIds),
  );
  await exec(
    'device_commands',
    env.DB.prepare(`DELETE FROM device_commands WHERE device_id ${inDev}`).bind(...devIds),
  );
  await exec(
    'capabilities',
    env.DB.prepare(`DELETE FROM device_capabilities WHERE device_id ${inDev}`).bind(...devIds),
  );
  await exec(
    'bindings',
    env.DB.prepare(`DELETE FROM device_bindings WHERE device_id ${inDev}`).bind(...devIds),
  );
  await exec(
    'control_commands',
    stmt(
      env.DB,
      'DELETE FROM control_commands WHERE session_id IN (SELECT id FROM control_sessions WHERE owner_user_id=?)',
      uid,
    ),
  );
  await exec('control_sessions', stmt(env.DB, 'DELETE FROM control_sessions WHERE owner_user_id=?', uid));
  await exec('gesture_mappings', stmt(env.DB, 'DELETE FROM gesture_mappings WHERE owner_user_id=?', uid));
  await exec('gesture_models', stmt(env.DB, 'DELETE FROM gesture_models WHERE owner_user_id=?', uid));
  await exec('gesture_sets', stmt(env.DB, 'DELETE FROM gesture_training_sets WHERE owner_user_id=?', uid));
  await exec('gesture_sessions', stmt(env.DB, 'DELETE FROM gesture_sessions WHERE owner_user_id=?', uid));
  await exec(
    'automation_runs',
    env.DB.prepare(`DELETE FROM automation_runs WHERE automation_id ${inAuto}`).bind(...autoIds),
  );
  await exec(
    'automation_state',
    env.DB.prepare(`DELETE FROM automation_state WHERE automation_id ${inAuto}`).bind(...autoIds),
  );
  await exec('automations', stmt(env.DB, 'DELETE FROM automations WHERE owner_user_id=?', uid));
  await exec(
    'ai_messages',
    stmt(
      env.DB,
      'DELETE FROM ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE owner_user_id=?)',
      uid,
    ),
  );
  await exec('ai_conversations', stmt(env.DB, 'DELETE FROM ai_conversations WHERE owner_user_id=?', uid));
  await exec('ai_feedback', stmt(env.DB, 'DELETE FROM ai_feedback WHERE owner_user_id=?', uid));
  await exec('ai_insights', stmt(env.DB, 'DELETE FROM ai_insights WHERE owner_user_id=?', uid));
  await exec('alerts', stmt(env.DB, 'DELETE FROM alerts WHERE owner_user_id=?', uid));
  await exec('notifications', stmt(env.DB, 'DELETE FROM notifications WHERE recipient_user_id=?', uid));
  await exec('notification_prefs', stmt(env.DB, 'DELETE FROM notification_preferences WHERE user_id=?', uid));
  await exec('checkins', stmt(env.DB, 'DELETE FROM checkins WHERE owner_user_id=?', uid));
  await exec('reports', stmt(env.DB, 'DELETE FROM reports WHERE owner_user_id=?', uid));
  await exec('tickets', stmt(env.DB, 'DELETE FROM realtime_tickets WHERE user_id=?', uid));
  await exec('consents', stmt(env.DB, 'DELETE FROM consents WHERE user_id=?', uid));
  await exec(
    'devices',
    stmt(
      env.DB,
      `UPDATE devices SET revoked_at=COALESCE(revoked_at,?), alias=NULL, hardware_fingerprint=NULL WHERE owner_user_id=?`,
      now,
      uid,
    ),
  );
  await exec(
    'gateways',
    stmt(
      env.DB,
      `UPDATE gateways SET revoked_at=COALESCE(revoked_at,?), public_key=NULL, display_name=NULL WHERE owner_user_id=?`,
      now,
      uid,
    ),
  );
  let r2 = 0;
  const exportsRows = await all<{ r2_key: string | null }>(
    env.DB,
    'SELECT r2_key FROM exports WHERE owner_user_id=?',
    uid,
  );
  for (const e of exportsRows) {
    if (!e.r2_key) continue;
    await env.RAW_BUCKET.delete(e.r2_key);
    r2 += 1;
  }
  for (const t of personal) r2 += await deletePrefix(env.RAW_BUCKET, `tenants/${t.id}/`);
  steps.r2_objects = r2;
  await exec('exports', stmt(env.DB, 'DELETE FROM exports WHERE owner_user_id=?', uid));
  await exec('memberships', stmt(env.DB, `UPDATE org_members SET status='removed' WHERE user_id=?`, uid));
  await exec(
    'credentials',
    stmt(
      env.DB,
      'UPDATE user_credentials SET password_hash=NULL, mfa_secret_enc=NULL, oidc_subject=NULL, mfa_enabled=0 WHERE user_id=?',
      uid,
    ),
  );
  await exec(
    'user',
    stmt(
      env.DB,
      `UPDATE users SET email=?, display_name=NULL, status='deleted', deleted_at=?, updated_at=? WHERE id=?`,
      `deleted+${uid}@invalid`,
      now,
      now,
      uid,
    ),
  );
  await run(
    env.DB,
    `UPDATE deletion_requests SET state='completed', steps_json=?, completed_at=? WHERE id=?`,
    JSON.stringify(steps),
    now,
    d.id,
  );
  await run(
    env.DB,
    `INSERT INTO audit_events(id,tenant_id,actor_ref,action,resource_type,resource_id,metadata_safe_json,created_at) VALUES(?,?,?,?,?,?,?,?)`,
    newId('aud'),
    d.tenant_id,
    'system:deletion',
    'account.deleted',
    'user',
    uid,
    JSON.stringify({ tables: Object.keys(steps).length }),
    now,
  );
}

export async function handleJob(env: Env, msg: JobMessage): Promise<void> {
  switch (msg.kind) {
    case 'export.build':
      return buildExport(env, msg.export_id);
    case 'account.delete':
      return deleteAccount(env, msg.deletion_id);
    case 'webhook.deliver': {
      const { deliverWebhook } = await import('./webhooks');
      return deliverWebhook(env, msg.delivery_id);
    }
    case 'automation.event': {
      const { processAutomationEvent } = await import('./automations');
      await processAutomationEvent(env, msg.tenant_id, msg.owner_user_id, msg.event as never);
      return;
    }
  }
}
