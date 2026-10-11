import { Hono } from 'hono';
import {
  RegisterDeviceRequest,
  UpdateDeviceRequest,
  WearableCommandRequest,
  type CapabilityId,
} from '@pulse/contracts';
import { PulseError, canCommandDevice, newId } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireGateway, requireScope } from '../lib/auth';
import { all, first, run, stmt } from '../lib/db';
import { parseBody } from '../lib/http';
import { withIdempotency } from '../lib/idempotency';
import { assertHealthRead, loadDevice, loadOwnedDevice, type DeviceRow } from '../services/access';

export const deviceRoutes = new Hono<AppEnv>();
deviceRoutes.use('*', requireAuth);

const dto = (d: DeviceRow) => ({
  id: d.id,
  model: d.model,
  manufacturer: d.manufacturer,
  alias: d.alias,
  firmware: d.firmware,
  transport: d.transport,
  gateway_id: d.gateway_id,
  last_seen_at: d.last_seen_at,
  created_at: d.created_at,
});

deviceRoutes.get('/', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'devices:read');
  const scope = c.req.query('scope');
  if (scope === 'org') {
    // Inventário de metadados (F156) para administração — sem nenhum dado de saúde.
    if (!['owner', 'org_admin', 'operator'].includes(p.orgRole ?? ''))
      throw new PulseError('FORBIDDEN', 'papel insuficiente');
    const rows = await all<DeviceRow>(
      c.env.DB,
      'SELECT * FROM devices WHERE tenant_id=? AND revoked_at IS NULL ORDER BY created_at LIMIT 500',
      p.tenantId,
    );
    return c.json({ data: rows.map(dto), next_cursor: null });
  }
  const rows = await all<DeviceRow>(
    c.env.DB,
    'SELECT * FROM devices WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL ORDER BY created_at',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows.map(dto), next_cursor: null });
});

/** Registro feito pelo gateway que pareou a pulseira; re-pareamento reaproveita o mesmo id. */
deviceRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'devices:write');
  const text = await c.req.raw.clone().text();
  const { gatewayId } = await requireGateway(c, text);
  const body = await parseBody(c, RegisterDeviceRequest);
  if (body.gateway_id !== gatewayId) throw new PulseError('FORBIDDEN', 'gateway_id não corresponde à sessão');
  const now = new Date().toISOString();
  const existing = await first<DeviceRow>(
    c.env.DB,
    'SELECT * FROM devices WHERE tenant_id=? AND hardware_fingerprint=? AND revoked_at IS NULL',
    p.tenantId,
    body.hardware_fingerprint,
  );
  if (existing && existing.owner_user_id !== p.userId)
    throw new PulseError('CONFLICT', 'dispositivo vinculado a outro titular');
  const id = existing?.id ?? newId('dev');
  const stmts = [];
  if (existing) {
    stmts.push(
      stmt(
        c.env.DB,
        'UPDATE devices SET gateway_id=?, firmware=COALESCE(?,firmware), alias=COALESCE(?,alias), updated_at=? WHERE id=?',
        gatewayId,
        body.firmware ?? null,
        body.alias ?? null,
        now,
        id,
      ),
    );
  } else {
    stmts.push(
      stmt(
        c.env.DB,
        `INSERT INTO devices(id,tenant_id,owner_user_id,gateway_id,model,firmware,manufacturer,alias,transport,created_at,updated_at,hardware_fingerprint) VALUES(?,?,?,?,?,?,?,?,'ble',?,?,?)`,
        id,
        p.tenantId,
        p.userId,
        gatewayId,
        body.model,
        body.firmware ?? null,
        body.manufacturer ?? null,
        body.alias ?? null,
        now,
        now,
        body.hardware_fingerprint,
      ),
      stmt(
        c.env.DB,
        `INSERT INTO device_status(device_id,tenant_id,connection_state,updated_at) VALUES(?,?,'unknown',?)`,
        id,
        p.tenantId,
        now,
      ),
    );
  }
  stmts.push(
    stmt(
      c.env.DB,
      'UPDATE device_bindings SET valid_to=? WHERE device_id=? AND gateway_id<>? AND valid_to IS NULL',
      now,
      id,
      gatewayId,
    ),
    stmt(
      c.env.DB,
      `INSERT INTO device_bindings(id,tenant_id,device_id,gateway_id,valid_from) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM device_bindings WHERE device_id=? AND gateway_id=? AND valid_to IS NULL)`,
      newId('bnd'),
      p.tenantId,
      id,
      gatewayId,
      now,
      id,
      gatewayId,
    ),
  );
  await c.env.DB.batch(stmts);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: existing ? 'device.rebind' : 'device.register',
    resourceType: 'device',
    resourceId: id,
    metadata: { model: body.model },
  });
  return c.json({ data: dto(await loadDevice(c.env.DB, p, id)) }, existing ? 200 : 201);
});

deviceRoutes.get('/:id', async (c) => {
  const p = c.get('principal');
  const d = await loadDevice(c.env.DB, p, c.req.param('id'));
  if (d.owner_user_id !== p.userId)
    await assertHealthRead(c.env.DB, p, d.owner_user_id, 'connection', { deviceId: d.id });
  return c.json({ data: dto(d) });
});

deviceRoutes.patch('/:id', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'devices:write');
  const d = await loadOwnedDevice(c.env.DB, p, c.req.param('id'));
  const body = await parseBody(c, UpdateDeviceRequest);
  const now = new Date().toISOString();
  const stmts = [];
  if (body.alias !== undefined || body.firmware !== undefined) {
    stmts.push(
      stmt(
        c.env.DB,
        'UPDATE devices SET alias=COALESCE(?,alias), firmware=COALESCE(?,firmware), updated_at=? WHERE id=?',
        body.alias ?? null,
        body.firmware ?? null,
        now,
        d.id,
      ),
    );
  }
  if (body.capabilities) {
    // Capabilities só podem ser declaradas pelo gateway que executou o driver (evidência local).
    if (!p.gatewayId || p.gatewayId !== d.gateway_id)
      throw new PulseError('FORBIDDEN', 'capabilities são reportadas pelo gateway vinculado');
    for (const cap of body.capabilities) {
      stmts.push(
        stmt(
          c.env.DB,
          `INSERT INTO device_capabilities(id,tenant_id,device_id,capability,support_state,firmware,driver_version,verified_at,test_artifact,details_json)
           VALUES(?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(device_id,capability,firmware) DO UPDATE SET support_state=excluded.support_state,driver_version=excluded.driver_version,
             verified_at=excluded.verified_at,test_artifact=excluded.test_artifact,details_json=excluded.details_json`,
          newId('cap'),
          p.tenantId,
          d.id,
          cap.id,
          cap.support_state,
          cap.firmware,
          cap.driver_version,
          cap.support_state === 'SUPPORTED' ? now : null,
          cap.test_artifact ?? null,
          JSON.stringify({ limitations: cap.limitations ?? null }),
        ),
      );
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'device.update',
    resourceType: 'device',
    resourceId: d.id,
    metadata: { fields: Object.keys(body) },
  });
  return c.json({ data: dto(await loadDevice(c.env.DB, p, d.id)) });
});

deviceRoutes.delete('/:id', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'devices:write');
  const d = await loadOwnedDevice(c.env.DB, p, c.req.param('id'));
  const now = new Date().toISOString();
  await c.env.DB.batch([
    stmt(c.env.DB, 'UPDATE devices SET revoked_at=?, updated_at=? WHERE id=?', now, now, d.id),
    stmt(c.env.DB, 'UPDATE device_bindings SET valid_to=? WHERE device_id=? AND valid_to IS NULL', now, d.id),
    stmt(
      c.env.DB,
      `UPDATE device_commands SET status='cancelled' WHERE device_id=? AND status='pending'`,
      d.id,
    ),
  ]);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'device.unbind',
    resourceType: 'device',
    resourceId: d.id,
  });
  return c.json({ data: { unbound: true } });
});

deviceRoutes.get('/:id/capabilities', async (c) => {
  const p = c.get('principal');
  const d = await loadOwnedDevice(c.env.DB, p, c.req.param('id'));
  const rows = await all<{
    capability: string;
    support_state: string;
    firmware: string | null;
    driver_version: string | null;
    verified_at: string | null;
    test_artifact: string | null;
    details_json: string;
  }>(
    c.env.DB,
    'SELECT capability,support_state,firmware,driver_version,verified_at,test_artifact,details_json FROM device_capabilities WHERE device_id=? AND tenant_id=? ORDER BY capability',
    d.id,
    p.tenantId,
  );
  return c.json({
    data: rows.map((r) => ({
      id: r.capability,
      support_state: r.support_state,
      firmware: r.firmware,
      driver_version: r.driver_version,
      verified_at: r.verified_at,
      test_artifact: r.test_artifact,
      limitations: (JSON.parse(r.details_json) as { limitations?: string }).limitations ?? null,
    })),
    next_cursor: null,
  });
});

deviceRoutes.get('/:id/status', async (c) => {
  const p = c.get('principal');
  const d = await loadDevice(c.env.DB, p, c.req.param('id'));
  if (d.owner_user_id !== p.userId)
    await assertHealthRead(c.env.DB, p, d.owner_user_id, 'connection', { deviceId: d.id });
  const s = await first<{
    connection_state: string;
    battery_percent: number | null;
    battery_observed_at: string | null;
    rssi_dbm: number | null;
    last_sync_at: string | null;
  }>(
    c.env.DB,
    'SELECT connection_state,battery_percent,battery_observed_at,rssi_dbm,last_sync_at FROM device_status WHERE device_id=?',
    d.id,
  );
  const lastSeen = d.last_seen_at;
  const stale = !lastSeen || Date.now() - new Date(lastSeen).getTime() > 15 * 60_000;
  return c.json({
    data: {
      device_id: d.id,
      // Nunca mascarar desconexão como online (docs/15): sem relato recente → unknown.
      connection_state: stale ? 'unknown' : (s?.connection_state ?? 'unknown'),
      battery_percent: s?.battery_percent ?? null,
      battery_observed_at: s?.battery_observed_at ?? null,
      last_seen_at: lastSeen,
      last_sync_at: s?.last_sync_at ?? null,
      rssi_dbm: s?.rssi_dbm ?? null,
      stale,
    },
  });
});

deviceRoutes.get('/:id/connections', async (c) => {
  const p = c.get('principal');
  const d = await loadOwnedDevice(c.env.DB, p, c.req.param('id'));
  const rows = await all(
    c.env.DB,
    'SELECT state,reason,at FROM device_connection_events WHERE tenant_id=? AND device_id=? ORDER BY at DESC LIMIT 200',
    p.tenantId,
    d.id,
  );
  return c.json({ data: rows, next_cursor: null });
});

const CAP_FOR_ACTION: Record<string, CapabilityId | null> = {
  vibrate: 'vibration_alert',
  measure_heart_rate: 'heart_rate_on_demand',
  send_notification: 'text_notification',
  sync_now: null,
};

/** Comandos ao wearable via gateway (F152–F155): capability verificada, TTL e idempotência. */
deviceRoutes.post('/:id/commands', async (c) => {
  const p = c.get('principal');
  const d = await loadDevice(c.env.DB, p, c.req.param('id'));
  const decision = canCommandDevice(p, d.owner_user_id);
  if (!decision.allow)
    throw new PulseError(d.owner_user_id === p.userId ? 'FORBIDDEN' : 'NOT_FOUND', decision.reason);
  const text = await c.req.raw.clone().text();
  const body = await parseBody(c, WearableCommandRequest);
  const cap = CAP_FOR_ACTION[body.action];
  if (cap) {
    const ok = await first(
      c.env.DB,
      `SELECT 1 FROM device_capabilities WHERE device_id=? AND capability=? AND support_state='SUPPORTED'`,
      d.id,
      cap,
    );
    if (!ok)
      throw new PulseError(
        'CAPABILITY_UNVERIFIED',
        `capability ${cap} não verificada neste dispositivo/firmware`,
      );
  }
  const res = await withIdempotency(
    c.env.DB,
    {
      tenantId: p.tenantId,
      scope: `device-cmd:${d.id}`,
      key: body.idempotency_key,
      requestBody: text,
      required: true,
    },
    async () => {
      const id = newId('cmd');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + body.ttl_ms).toISOString();
      await run(
        c.env.DB,
        `INSERT INTO device_commands(id,tenant_id,device_id,requested_by,action,args_json,idempotency_key,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?,'pending',?,?)`,
        id,
        p.tenantId,
        d.id,
        p.userId,
        body.action,
        JSON.stringify(body.arguments),
        body.idempotency_key,
        expiresAt,
        now.toISOString(),
      );
      await audit(c.env.DB, {
        tenantId: p.tenantId,
        actor: p,
        action: 'device.command',
        resourceType: 'device_command',
        resourceId: id,
        metadata: { action: body.action },
      });
      return {
        status: 202,
        body: { data: { id, status: 'pending', action: body.action, expires_at: expiresAt } },
      };
    },
  );
  return c.json(res.body as object, res.status as 202);
});
