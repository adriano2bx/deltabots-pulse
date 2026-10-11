import { Hono } from 'hono';
import { TicketRequest } from '@pulse/contracts';
import { PulseError, newId, randomToken, sha256Hex, type Principal } from '@pulse/core';
import type { AppEnv, Env } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireScope } from '../lib/auth';
import { first, run } from '../lib/db';
import { parseBody } from '../lib/http';

const TICKET_TTL_MS = 60_000;

export const realtimeRoutes = new Hono<AppEnv>();

/** Ticket de uso único (<60 s) para o upgrade WSS (docs/06); escopos vinculados a tenant/usuário/sala. */
realtimeRoutes.post('/ticket', requireAuth, async (c) => {
  const p = c.get('principal');
  requireScope(p, 'realtime:read');
  const body = await parseBody(c, TicketRequest);
  let room: string;
  let role: string;
  let equipmentId: string | null = null;
  let metrics: string[] = [];
  let ownerUserId = p.userId;
  if (body.purpose === 'control') {
    if (!body.control_session_id) throw new PulseError('VALIDATION_ERROR', 'control_session_id obrigatório');
    const s = await first<{ id: string; owner_user_id: string }>(
      c.env.DB,
      'SELECT id,owner_user_id FROM control_sessions WHERE id=? AND tenant_id=?',
      body.control_session_id,
      p.tenantId,
    );
    if (!s || s.owner_user_id !== p.userId) throw new PulseError('NOT_FOUND');
    room = `${p.tenantId}:control:${s.id}`;
    role = p.gatewayId ? 'android_gateway' : 'console';
  } else if (body.purpose === 'equipment_gateway' || body.purpose === 'mqtt_bridge') {
    if (p.kind !== 'gateway' || !body.control_session_id || !body.equipment_id)
      throw new PulseError('FORBIDDEN', 'credencial de gateway de equipamento necessária');
    const s = await first<{ id: string; owner_user_id: string; equipment_id: string }>(
      c.env.DB,
      'SELECT id,owner_user_id,equipment_id FROM control_sessions WHERE id=? AND tenant_id=?',
      body.control_session_id,
      p.tenantId,
    );
    const eq = await first<{ gateway_id: string | null }>(
      c.env.DB,
      'SELECT gateway_id FROM equipment WHERE id=? AND tenant_id=?',
      body.equipment_id,
      p.tenantId,
    );
    if (!s || s.equipment_id !== body.equipment_id || !eq || eq.gateway_id !== p.gatewayId)
      throw new PulseError('FORBIDDEN', 'equipamento não vinculado a este gateway');
    room = `${p.tenantId}:control:${s.id}`;
    role = body.purpose;
    equipmentId = body.equipment_id;
    ownerUserId = s.owner_user_id;
  } else {
    // telemetry_view: o titular (gateway publica, console assiste) ou beneficiário com grant ativo.
    const target = body.owner_user_id ?? p.userId;
    if (target !== p.userId) {
      const g = await first<{ scope_json: string }>(
        c.env.DB,
        `SELECT scope_json FROM share_grants WHERE tenant_id=? AND owner_user_id=? AND grantee_user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)`,
        p.tenantId,
        target,
        p.userId,
        new Date().toISOString(),
      );
      if (!g) throw new PulseError('NOT_FOUND');
      metrics = (JSON.parse(g.scope_json) as { metrics: string[] }).metrics;
      role = 'family_viewer';
    } else role = p.gatewayId ? 'android_gateway' : 'console';
    ownerUserId = target;
    room = `${p.tenantId}:telemetry:${target}`;
  }
  const ticket = `tk_${randomToken(24)}`;
  const expires = new Date(Date.now() + TICKET_TTL_MS).toISOString();
  await run(
    c.env.DB,
    'INSERT INTO realtime_tickets(id,tenant_id,user_id,purpose,room,gateway_id,equipment_id,scopes_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    await sha256Hex(ticket),
    p.tenantId,
    p.userId,
    body.purpose,
    room,
    p.gatewayId ?? null,
    equipmentId,
    JSON.stringify({ role, metrics, owner: ownerUserId, session: p.sessionId ?? null }),
    expires,
    new Date().toISOString(),
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'realtime.ticket',
    resourceType: 'realtime_room',
    resourceId: room,
    metadata: { role },
  });
  return c.json(
    { data: { ticket, expires_at: expires, url: `${c.env.PUBLIC_WS_BASE_URL}?ticket=${ticket}` } },
    201,
  );
});

/** Upgrade: consome o ticket (uso único) e encaminha ao DO com claims derivadas no servidor. */
realtimeRoutes.get('/', async (c) => {
  if (c.req.header('upgrade') !== 'websocket')
    throw new PulseError('VALIDATION_ERROR', 'upgrade websocket obrigatório');
  const ticket =
    c.req.query('ticket') ??
    c.req
      .header('sec-websocket-protocol')
      ?.split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('tk_'));
  if (!ticket) throw new PulseError('AUTH_REQUIRED');
  const hash = await sha256Hex(ticket);
  const t = await first<{
    id: string;
    tenant_id: string;
    user_id: string;
    purpose: string;
    room: string;
    gateway_id: string | null;
    equipment_id: string | null;
    scopes_json: string;
    expires_at: string;
    used_at: string | null;
  }>(c.env.DB, 'SELECT * FROM realtime_tickets WHERE id=?', hash);
  if (!t || t.used_at || new Date(t.expires_at) <= new Date())
    throw new PulseError('AUTH_REQUIRED', 'ticket inválido ou expirado');
  const used = await run(
    c.env.DB,
    'UPDATE realtime_tickets SET used_at=? WHERE id=? AND used_at IS NULL',
    new Date().toISOString(),
    hash,
  );
  if (!used.meta.changes) throw new PulseError('AUTH_REQUIRED', 'ticket já utilizado');
  const scopes = JSON.parse(t.scopes_json) as { role: string; metrics: string[]; owner: string };
  const env = c.env as Env;
  if (!env.SESSIONS) throw new PulseError('INTEGRATION_BLOCKED');
  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(t.room));
  if (t.purpose === 'telemetry_view') {
    await stub.fetch('https://do/internal/init', {
      method: 'POST',
      body: JSON.stringify({ kind: 'telemetry', tenantId: t.tenant_id, ownerUserId: scopes.owner }),
    });
  }
  const sessionId = t.room.includes(':control:')
    ? (t.room.split(':control:')[1] as string)
    : `telemetry:${scopes.owner}`;
  const claims = {
    role: scopes.role,
    tenantId: t.tenant_id,
    userId: t.user_id,
    sessionId,
    gatewayId: t.gateway_id ?? undefined,
    equipmentId: t.equipment_id ?? undefined,
    metrics: scopes.metrics,
  };
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-pulse-claims', JSON.stringify(claims));
  return stub.fetch(new Request('https://do/internal/connect', { headers }));
});

export async function issueEquipmentCredentials(env: Env, p: Principal, gatewayId: string): Promise<string> {
  const refresh = `rt_${randomToken(32)}`;
  const now = new Date();
  await run(
    env.DB,
    `INSERT INTO sessions(id,user_id,tenant_id,refresh_hash,expires_at,created_at,kind,gateway_id,device_label) VALUES(?,?,?,?,?,?,'gateway',?,?)`,
    newId('ses'),
    p.userId,
    p.tenantId,
    await sha256Hex(refresh),
    new Date(now.getTime() + 180 * 86400_000).toISOString(),
    now.toISOString(),
    gatewayId,
    'equipment-gateway',
  );
  return refresh;
}
