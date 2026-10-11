import { Hono } from 'hono';
import { z } from 'zod';
import { GatewayHeartbeat, RegisterGatewayRequest } from '@pulse/contracts';
import { PulseError, newId } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireGateway, requireHuman, requireMfa, requireScope } from '../lib/auth';
import { issueEquipmentCredentials } from './realtime';
import { all, first, run, stmt } from '../lib/db';
import { parseBody } from '../lib/http';

export const gatewayRoutes = new Hono<AppEnv>();
gatewayRoutes.use('*', requireAuth);

gatewayRoutes.get('/', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'devices:read');
  const rows = await all(
    c.env.DB,
    'SELECT id,kind,display_name,app_version,last_seen_at,revoked_at,created_at FROM gateways WHERE tenant_id=? AND owner_user_id=? ORDER BY created_at DESC LIMIT 100',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows, next_cursor: null });
});

/** Registra o gateway (app Android) e vincula a sessão atual a ele (F130). */
gatewayRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  requireScope(p, 'devices:write');
  const body = await parseBody(c, RegisterGatewayRequest);
  if (body.public_key) {
    try {
      const raw = Uint8Array.from(
        atob(
          body.public_key.replace(/-/g, '+').replace(/_/g, '/') +
            '='.repeat((4 - (body.public_key.length % 4)) % 4),
        ),
        (ch) => ch.charCodeAt(0),
      );
      await crypto.subtle.importKey('spki', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    } catch {
      throw new PulseError('VALIDATION_ERROR', 'public_key deve ser SPKI P-256 em base64url');
    }
  }
  const id = newId('gw');
  const now = new Date().toISOString();
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      'INSERT INTO gateways(id,tenant_id,owner_user_id,kind,display_name,public_key,app_version,last_seen_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      id,
      p.tenantId,
      p.userId,
      body.kind,
      body.display_name ?? null,
      body.public_key ?? null,
      body.app_version ?? null,
      now,
      now,
    ),
    stmt(c.env.DB, 'UPDATE sessions SET gateway_id=? WHERE id=?', id, p.sessionId ?? ''),
  ]);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'gateway.register',
    resourceType: 'gateway',
    resourceId: id,
    metadata: { kind: body.kind, pop: Boolean(body.public_key) },
  });
  return c.json(
    {
      data: {
        id,
        kind: body.kind,
        display_name: body.display_name ?? null,
        last_seen_at: now,
        revoked_at: null,
        created_at: now,
      },
    },
    201,
  );
});

gatewayRoutes.post('/:id/heartbeat', async (c) => {
  const p = c.get('principal');
  const text = await c.req.raw.clone().text();
  const { gatewayId } = await requireGateway(c, text);
  if (gatewayId !== c.req.param('id')) throw new PulseError('FORBIDDEN', 'heartbeat de outro gateway');
  const body = await parseBody(c, GatewayHeartbeat);
  const now = new Date().toISOString();
  const stmts = [
    stmt(
      c.env.DB,
      'UPDATE gateways SET last_seen_at=?,app_version=?,os_version=?,clock_skew_ms=?,network=? WHERE id=?',
      now,
      body.app_version,
      body.os_version ?? null,
      body.clock_skew_ms ?? null,
      body.network ?? null,
      gatewayId,
    ),
  ];
  for (const d of body.devices) {
    const dev = await first<{ id: string; prev: string | null }>(
      c.env.DB,
      `SELECT d.id, s.connection_state AS prev FROM devices d LEFT JOIN device_status s ON s.device_id=d.id WHERE d.id=? AND d.tenant_id=? AND d.owner_user_id=? AND d.revoked_at IS NULL`,
      d.device_id,
      p.tenantId,
      p.userId,
    );
    if (!dev) continue;
    stmts.push(
      stmt(
        c.env.DB,
        `INSERT INTO device_status(device_id,tenant_id,connection_state,rssi_dbm,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET connection_state=excluded.connection_state,rssi_dbm=COALESCE(excluded.rssi_dbm,device_status.rssi_dbm),updated_at=excluded.updated_at`,
        dev.id,
        p.tenantId,
        d.connection_state,
        d.rssi_dbm ?? null,
        now,
      ),
      stmt(c.env.DB, 'UPDATE devices SET last_seen_at=? WHERE id=?', now, dev.id),
    );
    if (dev.prev !== d.connection_state) {
      stmts.push(
        stmt(
          c.env.DB,
          'INSERT INTO device_connection_events(id,tenant_id,device_id,gateway_id,state,reason,at) VALUES(?,?,?,?,?,?,?)',
          newId('evt'),
          p.tenantId,
          dev.id,
          gatewayId,
          d.connection_state,
          'heartbeat',
          now,
        ),
      );
    }
  }
  await c.env.DB.batch(stmts);
  const pending = await first<{ n: number }>(
    c.env.DB,
    `SELECT COUNT(*) n FROM device_commands dc JOIN devices d ON d.id=dc.device_id WHERE d.gateway_id=? AND dc.status='pending' AND dc.expires_at>?`,
    gatewayId,
    now,
  );
  return c.json({ data: { server_time: now, pending_commands: pending?.n ?? 0 } });
});

/** Fila de comandos pendentes do gateway (expirados nunca são entregues). */
gatewayRoutes.get('/:id/commands', async (c) => {
  const p = c.get('principal');
  const { gatewayId } = await requireGateway(c, '');
  if (gatewayId !== c.req.param('id')) throw new PulseError('FORBIDDEN');
  const now = new Date().toISOString();
  await run(
    c.env.DB,
    `UPDATE device_commands SET status='expired' WHERE tenant_id=? AND status IN ('pending','delivered') AND expires_at<=?`,
    p.tenantId,
    now,
  );
  const rows = await all<{
    id: string;
    device_id: string;
    action: string;
    args_json: string;
    expires_at: string;
  }>(
    c.env.DB,
    `SELECT dc.id,dc.device_id,dc.action,dc.args_json,dc.expires_at FROM device_commands dc JOIN devices d ON d.id=dc.device_id
      WHERE d.gateway_id=? AND dc.tenant_id=? AND dc.status='pending' AND dc.expires_at>? ORDER BY dc.created_at LIMIT 50`,
    gatewayId,
    p.tenantId,
    now,
  );
  if (rows.length)
    await run(
      c.env.DB,
      `UPDATE device_commands SET status='delivered', delivered_at=? WHERE id IN (${rows.map(() => '?').join(',')})`,
      now,
      ...rows.map((r) => r.id),
    );
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      device_id: r.device_id,
      action: r.action,
      arguments: JSON.parse(r.args_json),
      expires_at: r.expires_at,
    })),
    next_cursor: null,
  });
});

gatewayRoutes.post('/:id/commands/:cmdId/ack', async (c) => {
  const p = c.get('principal');
  const text = await c.req.raw.clone().text();
  const { gatewayId } = await requireGateway(c, text);
  if (gatewayId !== c.req.param('id')) throw new PulseError('FORBIDDEN');
  const body = await parseBody(
    c,
    z.strictObject({ status: z.enum(['executed', 'failed']), code: z.string().max(60).optional() }),
  );
  const r = await run(
    c.env.DB,
    `UPDATE device_commands SET status=?, acked_at=?, result_code=? WHERE id=? AND tenant_id=? AND status='delivered' AND device_id IN (SELECT id FROM devices WHERE gateway_id=?)`,
    body.status,
    new Date().toISOString(),
    body.code ?? null,
    c.req.param('cmdId'),
    p.tenantId,
    gatewayId,
  );
  if (!r.meta.changes) throw new PulseError('CONFLICT', 'comando inexistente, expirado ou já confirmado');
  return c.json({ data: { acknowledged: true } });
});

/** Revogação do gateway (F158): encerra as sessões vinculadas e desvincula dispositivos. */
gatewayRoutes.delete('/:id', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const gw = await first<{ id: string }>(
    c.env.DB,
    'SELECT id FROM gateways WHERE id=? AND tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!gw) throw new PulseError('NOT_FOUND');
  const now = new Date().toISOString();
  await c.env.DB.batch([
    stmt(c.env.DB, 'UPDATE gateways SET revoked_at=? WHERE id=?', now, gw.id),
    stmt(c.env.DB, 'UPDATE sessions SET revoked_at=? WHERE gateway_id=? AND revoked_at IS NULL', now, gw.id),
    stmt(
      c.env.DB,
      'UPDATE device_bindings SET valid_to=? WHERE gateway_id=? AND valid_to IS NULL',
      now,
      gw.id,
    ),
  ]);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'gateway.revoke',
    resourceType: 'gateway',
    resourceId: gw.id,
  });
  return c.json({ data: { revoked: true } });
});

/**
 * Credencial de longa duração para gateways de equipamento (ESP32/bridge MQTT): refresh token de sessão
 * `gateway`, exibido uma vez. Exige sessão humana com MFA (operação privilegiada).
 */
gatewayRoutes.post('/:id/credentials', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  requireMfa(p);
  const gw = await first<{ id: string; kind: string }>(
    c.env.DB,
    'SELECT id,kind FROM gateways WHERE id=? AND tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!gw) throw new PulseError('NOT_FOUND');
  if (gw.kind === 'android')
    throw new PulseError('CONFLICT', 'gateways Android usam a sessão do próprio app');
  const refresh = await issueEquipmentCredentials(c.env, p, gw.id);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'gateway.credentials_issued',
    resourceType: 'gateway',
    resourceId: gw.id,
  });
  return c.json(
    {
      data: {
        gateway_id: gw.id,
        refresh_token: refresh,
        note: 'Guarde em local seguro; não será exibido novamente.',
      },
    },
    201,
  );
});
