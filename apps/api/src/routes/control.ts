import { Hono } from 'hono';
import {
  ArmRequest,
  ControlCommand,
  CreateControlSessionRequest,
  RegisterEquipmentRequest,
  type SafetyClass,
} from '@pulse/contracts';
import { PulseError, canArmControl, newId, type Principal } from '@pulse/core';
import type { AppEnv, Env } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireScope } from '../lib/auth';
import { all, first, run } from '../lib/db';
import { parseBody } from '../lib/http';

export const controlRoutes = new Hono<AppEnv>();
controlRoutes.use('*', requireAuth);

interface EquipmentRow {
  id: string;
  kind: string;
  display_name: string;
  connector: string;
  safety_class: SafetyClass;
  capabilities_json: string;
  watchdog_ms: number;
  max_rate_hz: number;
  status: string;
  last_seen_at: string | null;
  owner_user_id: string | null;
}
const eqDto = (e: EquipmentRow) => ({
  id: e.id,
  kind: e.kind,
  display_name: e.display_name,
  connector: e.connector,
  safety_class: e.safety_class,
  capabilities: JSON.parse(e.capabilities_json),
  watchdog_ms: e.watchdog_ms,
  max_rate_hz: e.max_rate_hz,
  status: e.status,
  last_seen_at: e.last_seen_at,
});

controlRoutes.get('/equipment', async (c) => {
  const p = c.get('principal');
  const rows = await all<EquipmentRow>(
    c.env.DB,
    'SELECT * FROM equipment WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL ORDER BY created_at',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows.map(eqDto), next_cursor: null });
});

/** Registro de equipamento com allowlist de ações e watchdog local obrigatório (docs/08). */
controlRoutes.post('/equipment', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'devices:write');
  const body = await parseBody(c, RegisterEquipmentRequest);
  const id = newId('eqp');
  await run(
    c.env.DB,
    `INSERT INTO equipment(id,tenant_id,owner_user_id,gateway_id,kind,display_name,safety_class,capabilities_json,watchdog_ms,max_rate_hz,status,created_at,connector) VALUES(?,?,?,?,?,?,?,?,?,?,'offline',?,?)`,
    id,
    p.tenantId,
    p.userId,
    body.gateway_id ?? null,
    body.kind,
    body.display_name,
    body.safety_class,
    JSON.stringify(body.capabilities),
    body.watchdog_ms,
    body.max_rate_hz,
    new Date().toISOString(),
    body.connector,
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'equipment.register',
    resourceType: 'equipment',
    resourceId: id,
    metadata: { safety_class: body.safety_class, actions: body.capabilities.map((x) => x.action) },
  });
  return c.json(
    {
      data: eqDto(
        (await first<EquipmentRow>(c.env.DB, 'SELECT * FROM equipment WHERE id=?', id)) as EquipmentRow,
      ),
    },
    201,
  );
});

async function loadEquipment(env: Env, p: Principal, id: string): Promise<EquipmentRow> {
  const e = await first<EquipmentRow>(
    env.DB,
    'SELECT * FROM equipment WHERE id=? AND tenant_id=? AND revoked_at IS NULL',
    id,
    p.tenantId,
  );
  if (!e || e.owner_user_id !== p.userId) throw new PulseError('NOT_FOUND');
  return e;
}

export function controlRoom(env: Env, tenantId: string, sessionId: string): DurableObjectStub {
  if (!env.SESSIONS) throw new PulseError('INTEGRATION_BLOCKED', 'Durable Objects indisponíveis');
  return env.SESSIONS.get(env.SESSIONS.idFromName(`${tenantId}:control:${sessionId}`));
}

controlRoutes.post('/sessions', async (c) => {
  const p = c.get('principal');
  const body = await parseBody(c, CreateControlSessionRequest);
  const e = await loadEquipment(c.env, p, body.equipment_id);
  if (e.safety_class === 'safety_critical')
    throw new PulseError('SAFETY_BLOCKED', 'equipamento safety_critical não aceita controle remoto');
  const d = canArmControl(p, e.owner_user_id);
  if (!d.allow) throw new PulseError('FORBIDDEN', d.reason);
  const id = newId('ctl');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + body.ttl_s * 1000).toISOString();
  const policyVersion = 'ctl-policy-1';
  await run(
    c.env.DB,
    `INSERT INTO control_sessions(id,tenant_id,owner_user_id,device_id,equipment_id,state,policy_version,expires_at,created_at) VALUES(?,?,?,?,?,'DISARMED',?,?,?)`,
    id,
    p.tenantId,
    p.userId,
    body.device_id ?? null,
    e.id,
    policyVersion,
    expiresAt,
    now.toISOString(),
  );
  await controlRoom(c.env, p.tenantId, id).fetch('https://do/internal/init', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'control',
      tenantId: p.tenantId,
      ownerUserId: p.userId,
      controlSessionId: id,
      expiresAt,
      policyVersion,
      equipment: {
        id: e.id,
        safetyClass: e.safety_class,
        allowedActions: (JSON.parse(e.capabilities_json) as Array<{ action: string }>).map((x) => x.action),
        watchdogMs: e.watchdog_ms,
        maxRateHz: e.max_rate_hz,
      },
    }),
  });
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'control.session_create',
    resourceType: 'control_session',
    resourceId: id,
    metadata: { equipment_id: e.id },
  });
  return c.json(
    {
      data: {
        id,
        equipment_id: e.id,
        device_id: body.device_id ?? null,
        state: 'DISARMED',
        policy_version: policyVersion,
        armed_at: null,
        expires_at: expiresAt,
        last_heartbeat_at: null,
      },
    },
    201,
  );
});

async function loadSession(env: Env, p: Principal, id: string) {
  const s = await first<{
    id: string;
    owner_user_id: string;
    equipment_id: string;
    state: string;
    policy_version: string;
    expires_at: string;
    armed_at: string | null;
    last_heartbeat_at: string | null;
    device_id: string | null;
  }>(env.DB, 'SELECT * FROM control_sessions WHERE id=? AND tenant_id=?', id, p.tenantId);
  if (!s || s.owner_user_id !== p.userId) throw new PulseError('NOT_FOUND');
  return s;
}

controlRoutes.get('/sessions/:id', async (c) => {
  const p = c.get('principal');
  const s = await loadSession(c.env, p, c.req.param('id'));
  const live = (await (
    await controlRoom(c.env, p.tenantId, s.id).fetch('https://do/internal/state')
  ).json()) as { snapshot: { state: string; stateVersion: number } | null; participants: string[] };
  return c.json({
    data: {
      ...s,
      state: live.snapshot?.state ?? s.state,
      state_version: live.snapshot?.stateVersion ?? 0,
      participants: live.participants,
    },
  });
});

/** Armar exige o gateway Android do titular (interação local explícita) — nunca o console sozinho. */
controlRoutes.post('/sessions/:id/arm', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'control:arm');
  if (!p.gatewayId)
    throw new PulseError('FORBIDDEN', 'armar exige confirmação no gateway físico (app Android)');
  const s = await loadSession(c.env, p, c.req.param('id'));
  const body = await parseBody(c, ArmRequest);
  const res = (await (
    await controlRoom(c.env, p.tenantId, s.id).fetch('https://do/internal/arm', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).json()) as { snapshot: { state: string } | null };
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'control.arm_request',
    resourceType: 'control_session',
    resourceId: s.id,
  });
  if (res.snapshot?.state === 'FAULT') throw new PulseError('SAFETY_BLOCKED');
  return c.json({ data: { id: s.id, state: res.snapshot?.state ?? 'DISARMED' } });
});

controlRoutes.post('/sessions/:id/disarm', async (c) => {
  const p = c.get('principal');
  const s = await loadSession(c.env, p, c.req.param('id'));
  const res = (await (
    await controlRoom(c.env, p.tenantId, s.id).fetch('https://do/internal/disarm', {
      method: 'POST',
      body: JSON.stringify({ reason: 'solicitado via API' }),
    })
  ).json()) as { snapshot: { state: string } | null };
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'control.disarm',
    resourceType: 'control_session',
    resourceId: s.id,
  });
  return c.json({ data: { id: s.id, state: res.snapshot?.state ?? 'DISARMED' } });
});

controlRoutes.post('/sessions/:id/commands', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'control:execute');
  const s = await loadSession(c.env, p, c.req.param('id'));
  const body = await parseBody(c, ControlCommand);
  if (body.session_id !== s.id || body.equipment_id !== s.equipment_id)
    throw new PulseError('VALIDATION_ERROR', 'sessão/equipamento divergentes');
  const { session_id: _sessionId, ...command } = body;
  const res = await controlRoom(c.env, p.tenantId, s.id).fetch('https://do/internal/command', {
    method: 'POST',
    body: JSON.stringify({ command, origin: p.gatewayId ? 'android' : 'console' }),
  });
  const result = (await res.json()) as {
    status: string;
    code: string | null;
    command_id: string;
    seq: number;
  };
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'control.command',
    resourceType: 'control_command',
    resourceId: body.command_id,
    reasonCode: result.code,
    metadata: { action: body.action, status: result.status },
  });
  if (result.status !== 'accepted') {
    const code =
      (
        [
          'CONTROL_DISARMED',
          'COMMAND_EXPIRED',
          'SAFETY_BLOCKED',
          'RATE_LIMITED',
          'CONFLICT',
          'DEVICE_UNAVAILABLE',
          'VALIDATION_ERROR',
        ] as const
      ).find((x) => x === result.code) ?? 'CONFLICT';
    throw new PulseError(code, `comando ${result.status}: ${result.code}`);
  }
  return c.json({ data: result }, 202);
});

controlRoutes.get('/sessions/:id/commands', async (c) => {
  const p = c.get('principal');
  const s = await loadSession(c.env, p, c.req.param('id'));
  const rows = await all(
    c.env.DB,
    'SELECT id AS command_id,seq,action,status,result_code AS code,issued_at,expires_at,acked_at,executed_at FROM control_commands WHERE session_id=? AND tenant_id=? ORDER BY seq DESC LIMIT 200',
    s.id,
    p.tenantId,
  );
  return c.json({ data: rows, next_cursor: null });
});

/** Descoberta para gateways de equipamento (bridge MQTT/ESP32): sessões ativas do seu equipamento. */
controlRoutes.get('/gateway-sessions', async (c) => {
  const p = c.get('principal');
  if (p.kind !== 'gateway' || !p.gatewayId)
    throw new PulseError('FORBIDDEN', 'credencial de gateway necessária');
  const rows = await all<{ id: string; equipment_id: string; state: string; expires_at: string }>(
    c.env.DB,
    `SELECT cs.id, cs.equipment_id, cs.state, cs.expires_at FROM control_sessions cs JOIN equipment e ON e.id=cs.equipment_id
      WHERE cs.tenant_id=? AND e.gateway_id=? AND e.revoked_at IS NULL AND cs.state<>'EXPIRED' AND cs.expires_at>? ORDER BY cs.created_at DESC LIMIT 50`,
    p.tenantId,
    p.gatewayId,
    new Date().toISOString(),
  );
  return c.json({ data: rows.map((r) => ({ ...r, tenant_id: p.tenantId })), next_cursor: null });
});
