import { newId } from '@pulse/core';
import type { Env } from '../env';
import { first } from '../lib/db';

/**
 * Automação só aciona equipamento com sessão ARMADA pelo titular e equipamento não safety_critical
 * (RF-05, docs/14). O roteamento físico é feito pelo Durable Object da sessão de controle.
 */
export async function routeControlFromAutomation(
  env: Env,
  opts: {
    tenantId: string;
    ownerUserId: string;
    equipmentId: string;
    action: string;
    args: Record<string, unknown>;
    runId: string;
  },
): Promise<{
  type: 'control_discrete_when_armed';
  status: 'completed' | 'rejected' | 'failed';
  code?: string;
}> {
  const eq = await first<{ safety_class: string }>(
    env.DB,
    'SELECT safety_class FROM equipment WHERE id=? AND tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
    opts.equipmentId,
    opts.tenantId,
    opts.ownerUserId,
  );
  if (!eq) return { type: 'control_discrete_when_armed', status: 'rejected', code: 'NOT_FOUND' };
  if (eq.safety_class === 'safety_critical')
    return { type: 'control_discrete_when_armed', status: 'rejected', code: 'SAFETY_BLOCKED' };
  const session = await first<{ id: string }>(
    env.DB,
    `SELECT id FROM control_sessions WHERE tenant_id=? AND equipment_id=? AND owner_user_id=? AND state='ARMED' AND expires_at>? ORDER BY armed_at DESC LIMIT 1`,
    opts.tenantId,
    opts.equipmentId,
    opts.ownerUserId,
    new Date().toISOString(),
  );
  if (!session || !env.SESSIONS)
    return { type: 'control_discrete_when_armed', status: 'rejected', code: 'CONTROL_DISARMED' };
  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(`${opts.tenantId}:control:${session.id}`));
  const res = await stub.fetch('https://do/internal/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command: {
        command_id: newId('cmd'),
        action: opts.action,
        arguments: opts.args,
        idempotency_key: `auto-${opts.runId}`,
        expires_at: new Date(Date.now() + 2000).toISOString(),
        equipment_id: opts.equipmentId,
      },
      origin: 'automation',
    }),
  });
  if (res.ok) return { type: 'control_discrete_when_armed', status: 'completed' };
  const p = (await res.json().catch(() => ({}))) as { code?: string };
  return { type: 'control_discrete_when_armed', status: 'rejected', code: p.code ?? 'CONTROL_FAILED' };
}
