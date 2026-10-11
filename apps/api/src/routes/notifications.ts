import { Hono } from 'hono';
import { z } from 'zod';
import { CreateCheckinRequest, NotificationPreferences } from '@pulse/contracts';
import { PulseError, newId } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireHuman } from '../lib/auth';
import { all, first, run } from '../lib/db';
import { decodeCursor, encodeCursor, parseBody, parseQuery } from '../lib/http';
import { activeConsents } from '../services/consent';
import { notify } from '../services/notify';

export const notificationRoutes = new Hono<AppEnv>();
notificationRoutes.use('*', requireAuth);

notificationRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const q = parseQuery(
    c,
    z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      unread: z.enum(['true', 'false']).optional(),
    }),
  );
  const cur = decodeCursor(q.cursor);
  const rows = await all<{
    id: string;
    kind: string;
    channel: string;
    status: string;
    payload_json: string;
    created_at: string;
    read_at: string | null;
  }>(
    c.env.DB,
    `SELECT id,kind,channel,status,payload_json,created_at,read_at FROM notifications WHERE tenant_id=? AND recipient_user_id=?
       ${q.unread === 'true' ? 'AND read_at IS NULL' : ''} ${cur ? 'AND (created_at<? OR (created_at=? AND id<?))' : ''}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    p.tenantId,
    p.userId,
    ...(cur ? [cur.sortKey, cur.sortKey, cur.id] : []),
    q.limit + 1,
  );
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return c.json({
    data: page.map((r) => {
      const pl = JSON.parse(r.payload_json) as {
        title: string;
        body: string;
        priority: string;
        error?: string;
      };
      return {
        id: r.id,
        kind: r.kind,
        channel: r.channel,
        status: r.read_at ? 'read' : r.status,
        title: pl.title,
        body: pl.body,
        priority: pl.priority,
        delivery_error: pl.error ?? null,
        created_at: r.created_at,
        read_at: r.read_at,
      };
    }),
    next_cursor: rows.length > q.limit && last ? encodeCursor(last.created_at, last.id) : null,
  });
});

notificationRoutes.post('/:id/read', async (c) => {
  const p = c.get('principal');
  const r = await run(
    c.env.DB,
    'UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND tenant_id=? AND recipient_user_id=?',
    new Date().toISOString(),
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!r.meta.changes) throw new PulseError('NOT_FOUND');
  return c.json({ data: { read: true } });
});

notificationRoutes.get('/preferences', async (c) => {
  const p = c.get('principal');
  const row = await first<{ prefs_json: string }>(
    c.env.DB,
    'SELECT prefs_json FROM notification_preferences WHERE user_id=?',
    p.userId,
  );
  return c.json({ data: row ? JSON.parse(row.prefs_json) : NotificationPreferences.parse({}) });
});

notificationRoutes.patch('/preferences', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const prefs = await parseBody(c, NotificationPreferences);
  await run(
    c.env.DB,
    `INSERT INTO notification_preferences(user_id,tenant_id,prefs_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET prefs_json=excluded.prefs_json,updated_at=excluded.updated_at`,
    p.userId,
    p.tenantId,
    JSON.stringify(prefs),
    new Date().toISOString(),
  );
  return c.json({ data: prefs });
});

export const alertRoutes = new Hono<AppEnv>();
alertRoutes.use('*', requireAuth);
alertRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all(
    c.env.DB,
    'SELECT id,kind,severity,status,summary,device_id,created_at,ack_at FROM alerts WHERE tenant_id=? AND owner_user_id=? ORDER BY created_at DESC LIMIT 200',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows, next_cursor: null });
});
alertRoutes.post('/:id/ack', async (c) => {
  const p = c.get('principal');
  const r = await run(
    c.env.DB,
    `UPDATE alerts SET status='acknowledged', ack_at=? WHERE id=? AND tenant_id=? AND owner_user_id=? AND status='open'`,
    new Date().toISOString(),
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!r.meta.changes) throw new PulseError('NOT_FOUND');
  return c.json({ data: { acknowledged: true } });
});

export const checkinRoutes = new Hono<AppEnv>();
checkinRoutes.use('*', requireAuth);

/** Check-in/pedido de ajuda (F92–F97): notifica cuidadores com grant de check-ins; não é serviço de emergência. */
checkinRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const body = await parseBody(c, CreateCheckinRequest);
  if (body.location && !(await activeConsents(c.env.DB, p.tenantId, p.userId)).has('location_sharing')) {
    throw new PulseError('CONSENT_REQUIRED', 'localização requer consentimento location_sharing');
  }
  const id = newId('chk');
  const now = new Date().toISOString();
  const status = body.kind === 'help_request' ? 'help_needed' : 'ok';
  await run(
    c.env.DB,
    'INSERT INTO checkins(id,tenant_id,owner_user_id,kind,status,requested_at,responded_at,details_json) VALUES(?,?,?,?,?,?,?,?)',
    id,
    p.tenantId,
    p.userId,
    body.kind,
    status,
    now,
    now,
    JSON.stringify({ message: body.message ?? null, location: body.location ?? null }),
  );
  const caregivers = await all<{ grantee_user_id: string; scope_json: string }>(
    c.env.DB,
    `SELECT grantee_user_id,scope_json FROM share_grants WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)`,
    p.tenantId,
    p.userId,
    now,
  );
  const me = await first<{ display_name: string | null }>(
    c.env.DB,
    'SELECT display_name FROM users WHERE id=?',
    p.userId,
  );
  for (const g of caregivers) {
    if (!(JSON.parse(g.scope_json) as { metrics: string[] }).metrics.includes('checkins')) continue;
    await notify(c.env, {
      tenantId: p.tenantId,
      recipientUserId: g.grantee_user_id,
      kind: body.kind === 'help_request' ? 'help_request' : 'checkin',
      title:
        body.kind === 'help_request'
          ? `${me?.display_name ?? 'Pessoa acompanhada'} pediu ajuda`
          : `${me?.display_name ?? 'Pessoa acompanhada'} fez check-in`,
      body:
        body.kind === 'help_request'
          ? 'Entre em contato. Em emergência, acione o serviço local (192/193).'
          : 'Check-in de bem-estar registrado.',
      priority: body.kind === 'help_request' ? 'high' : 'normal',
      data: { checkin_id: id },
    });
  }
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'checkin.create',
    resourceType: 'checkin',
    resourceId: id,
    metadata: { kind: body.kind },
  });
  return c.json({ data: { id, kind: body.kind, status, requested_at: now, responded_at: now } }, 201);
});

checkinRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all(
    c.env.DB,
    'SELECT id,kind,status,requested_at,responded_at FROM checkins WHERE tenant_id=? AND owner_user_id=? ORDER BY requested_at DESC LIMIT 200',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows, next_cursor: null });
});
