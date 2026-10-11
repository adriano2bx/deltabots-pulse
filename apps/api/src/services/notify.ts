import { inTimeWindow, localParts, newId } from '@pulse/core';
import type { NotificationPreferences } from '@pulse/contracts';
import type { Env } from '../env';
import { first, run } from '../lib/db';

export interface NotifyInput {
  tenantId: string;
  recipientUserId: string;
  kind: string;
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high';
  data?: Record<string, unknown>;
}

/**
 * Cria a notificação in-app (sempre) e enfileira entrega externa conforme preferências.
 * Horário silencioso suprime canais externos exceto prioridade alta (F67).
 */
export async function notify(env: Env, n: NotifyInput): Promise<string | null> {
  const prefsRow = await first<{ prefs_json: string }>(
    env.DB,
    'SELECT prefs_json FROM notification_preferences WHERE user_id=?',
    n.recipientUserId,
  );
  const prefs = prefsRow ? (JSON.parse(prefsRow.prefs_json) as NotificationPreferences) : null;
  if (prefs?.muted_kinds.includes(n.kind)) return null;
  const id = newId('ntf');
  const now = new Date();
  let quiet = false;
  if (prefs?.quiet_hours) {
    const local = localParts(now, prefs.quiet_hours.timezone).hhmm;
    quiet = inTimeWindow(local, prefs.quiet_hours.start, prefs.quiet_hours.end);
  }
  const external = (prefs?.channels[n.kind] ?? ['push']).filter((ch) => ch !== 'in_app');
  const status = quiet && n.priority !== 'high' ? 'suppressed' : external.length ? 'pending' : 'sent';
  await run(
    env.DB,
    `INSERT OR IGNORE INTO notifications(id,tenant_id,recipient_user_id,kind,channel,status,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?)`,
    id,
    n.tenantId,
    n.recipientUserId,
    n.kind,
    external[0] ?? 'in_app',
    status,
    JSON.stringify({
      title: n.title,
      body: n.body,
      priority: n.priority,
      channels: external,
      data: n.data ?? {},
    }),
    now.toISOString(),
  );
  if (status === 'pending')
    await env.NOTIFY_QUEUE.send({
      kind: 'notification.dispatch',
      event_id: id,
      tenant_id: n.tenantId,
      notification_id: id,
    });
  return id;
}

/**
 * Entrega externa. Push (FCM) e e-mail dependem de credenciais de provedor (docs/22): sem elas a
 * notificação fica registrada como falha explícita — nunca simulada como enviada.
 */
export async function dispatchNotification(
  env: Env & { FCM_CREDENTIAL_REF?: string; EMAIL_PROVIDER_SECRET?: string },
  notificationId: string,
): Promise<void> {
  const n = await first<{ id: string; status: string; payload_json: string }>(
    env.DB,
    'SELECT id,status,payload_json FROM notifications WHERE id=?',
    notificationId,
  );
  if (!n || n.status !== 'pending') return;
  const payload = JSON.parse(n.payload_json) as { channels: string[] };
  const missing = payload.channels.filter(
    (ch) => (ch === 'push' && !env.FCM_CREDENTIAL_REF) || (ch === 'email' && !env.EMAIL_PROVIDER_SECRET),
  );
  if (missing.length === payload.channels.length) {
    await run(
      env.DB,
      `UPDATE notifications SET status='failed', payload_json=json_set(payload_json,'$.error','PROVIDER_NOT_CONFIGURED') WHERE id=?`,
      n.id,
    );
    return;
  }
  // Integração real com FCM/e-mail entra aqui quando o proprietário fornecer as credenciais.
  await run(
    env.DB,
    `UPDATE notifications SET status='failed', payload_json=json_set(payload_json,'$.error','PROVIDER_ADAPTER_PENDING') WHERE id=?`,
    n.id,
  );
}
