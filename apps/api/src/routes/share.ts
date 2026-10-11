import { Hono } from 'hono';
import { AcceptInvitationRequest, CreateInvitationRequest, type GrantScope } from '@pulse/contracts';
import { PulseError, newId, randomToken, sha256Hex } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireHuman, requireScope } from '../lib/auth';
import { emailHash } from '../lib/crypto';
import { all, first, run, stmt } from '../lib/db';
import { parseBody } from '../lib/http';
import { activeConsents } from '../services/consent';
import { notify } from '../services/notify';

export const shareRoutes = new Hono<AppEnv>();
shareRoutes.use('*', requireAuth);

/** Titular convida familiar (F86–F88, F133): exige consentimento family_sharing ativo. */
shareRoutes.post('/invitations', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  requireScope(p, 'share:manage');
  const body = await parseBody(c, CreateInvitationRequest);
  if (!(await activeConsents(c.env.DB, p.tenantId, p.userId)).has('family_sharing'))
    throw new PulseError('CONSENT_REQUIRED', 'conceda o consentimento family_sharing antes de compartilhar');
  if (body.scope.device_ids.length) {
    const owned = await all<{ id: string }>(
      c.env.DB,
      `SELECT id FROM devices WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL AND id IN (${body.scope.device_ids.map(() => '?').join(',')})`,
      p.tenantId,
      p.userId,
      ...body.scope.device_ids,
    );
    if (owned.length !== body.scope.device_ids.length)
      throw new PulseError('VALIDATION_ERROR', 'dispositivo inexistente no escopo');
  }
  const token = `fam_${randomToken(24)}`;
  const id = newId('inv');
  const now = new Date();
  const expires = body.expires_at ?? new Date(now.getTime() + 7 * 86400_000).toISOString();
  await run(
    c.env.DB,
    'INSERT INTO share_invitations(id,tenant_id,owner_user_id,invitee_email_hash,grant_json,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
    id,
    p.tenantId,
    p.userId,
    await emailHash(c.env.DATA_ENCRYPTION_KEY, body.invitee_email),
    JSON.stringify(body.scope),
    await sha256Hex(token),
    expires,
    now.toISOString(),
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'share.invite',
    resourceType: 'share_invitation',
    resourceId: id,
    metadata: { metrics: body.scope.metrics, role: body.scope.role },
  });
  return c.json(
    {
      data: {
        id,
        scope: body.scope,
        expires_at: expires,
        accepted_at: null,
        revoked_at: null,
        created_at: now.toISOString(),
        invite_token: token,
      },
    },
    201,
  );
});

shareRoutes.get('/invitations', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    grant_json: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT id,grant_json,expires_at,accepted_at,revoked_at,created_at FROM share_invitations WHERE tenant_id=? AND owner_user_id=? ORDER BY created_at DESC LIMIT 100',
    p.tenantId,
    p.userId,
  );
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      scope: JSON.parse(r.grant_json),
      expires_at: r.expires_at,
      accepted_at: r.accepted_at,
      revoked_at: r.revoked_at,
      created_at: r.created_at,
    })),
    next_cursor: null,
  });
});

shareRoutes.delete('/invitations/:id', async (c) => {
  const p = c.get('principal');
  const r = await run(
    c.env.DB,
    'UPDATE share_invitations SET revoked_at=? WHERE id=? AND tenant_id=? AND owner_user_id=? AND revoked_at IS NULL AND accepted_at IS NULL',
    new Date().toISOString(),
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!r.meta.changes) throw new PulseError('NOT_FOUND');
  return c.json({ data: { revoked: true } });
});

/** Beneficiário aceita com a própria conta; a concessão vale no tenant do titular. */
shareRoutes.post('/invitations/accept', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const { invite_token } = await parseBody(c, AcceptInvitationRequest);
  const inv = await first<{
    id: string;
    tenant_id: string;
    owner_user_id: string;
    invitee_email_hash: string;
    grant_json: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  }>(c.env.DB, 'SELECT * FROM share_invitations WHERE token_hash=?', await sha256Hex(invite_token));
  if (!inv || inv.accepted_at || inv.revoked_at || new Date(inv.expires_at) <= new Date())
    throw new PulseError('NOT_FOUND', 'convite inválido ou expirado');
  if (inv.owner_user_id === p.userId)
    throw new PulseError('CONFLICT', 'não é possível aceitar o próprio convite');
  const me = await first<{ email: string }>(c.env.DB, 'SELECT email FROM users WHERE id=?', p.userId);
  if (!me || (await emailHash(c.env.DATA_ENCRYPTION_KEY, me.email)) !== inv.invitee_email_hash)
    throw new PulseError('FORBIDDEN', 'convite destinado a outro e-mail');
  const scope = JSON.parse(inv.grant_json) as GrantScope;
  const now = new Date().toISOString();
  const grantId = newId('grt');
  await c.env.DB.batch([
    stmt(c.env.DB, 'UPDATE share_invitations SET accepted_at=? WHERE id=?', now, inv.id),
    stmt(
      c.env.DB,
      'INSERT INTO share_grants(id,tenant_id,owner_user_id,grantee_user_id,scope_json,expires_at,created_at) VALUES(?,?,?,?,?,NULL,?)',
      grantId,
      inv.tenant_id,
      inv.owner_user_id,
      p.userId,
      inv.grant_json,
      now,
    ),
    // Vínculo de leitura no tenant do titular, para que o beneficiário possa trocar de contexto.
    stmt(
      c.env.DB,
      `INSERT INTO org_members(id,tenant_id,user_id,role,status,created_at) VALUES(?,?,?,'member','active',?) ON CONFLICT(tenant_id,user_id) DO NOTHING`,
      newId('mem'),
      inv.tenant_id,
      p.userId,
      now,
    ),
  ]);
  await audit(c.env.DB, {
    tenantId: inv.tenant_id,
    actor: p,
    action: 'share.accept',
    resourceType: 'share_grant',
    resourceId: grantId,
    metadata: { role: scope.role, metrics: scope.metrics },
  });
  await notify(c.env, {
    tenantId: inv.tenant_id,
    recipientUserId: inv.owner_user_id,
    kind: 'share_accepted',
    title: 'Compartilhamento aceito',
    body: 'Seu convite de acompanhamento foi aceito.',
    priority: 'normal',
  });
  return c.json({ data: { grant_id: grantId, tenant_id: inv.tenant_id, scope } }, 201);
});

shareRoutes.get('/grants', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    owner_user_id: string;
    grantee_user_id: string;
    owner_name: string | null;
    grantee_name: string | null;
    scope_json: string;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>(
    c.env.DB,
    `SELECT g.id,g.owner_user_id,g.grantee_user_id,uo.display_name owner_name,ug.display_name grantee_name,g.scope_json,g.expires_at,g.revoked_at,g.created_at
       FROM share_grants g JOIN users uo ON uo.id=g.owner_user_id JOIN users ug ON ug.id=g.grantee_user_id
      WHERE g.tenant_id=? AND (g.owner_user_id=? OR g.grantee_user_id=?) ORDER BY g.created_at DESC LIMIT 200`,
    p.tenantId,
    p.userId,
    p.userId,
  );
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      owner_user_id: r.owner_user_id,
      grantee_user_id: r.grantee_user_id,
      owner_display_name: r.owner_name,
      grantee_display_name: r.grantee_name,
      scope: JSON.parse(r.scope_json),
      expires_at: r.expires_at,
      revoked_at: r.revoked_at,
      created_at: r.created_at,
    })),
    next_cursor: null,
  });
});

/** Revogação instantânea pelo titular ou pelo beneficiário (T010); toda consulta reavalia o grant. */
shareRoutes.delete('/grants/:id', async (c) => {
  const p = c.get('principal');
  const g = await first<{ id: string; owner_user_id: string; grantee_user_id: string }>(
    c.env.DB,
    'SELECT id,owner_user_id,grantee_user_id FROM share_grants WHERE id=? AND tenant_id=? AND revoked_at IS NULL',
    c.req.param('id'),
    p.tenantId,
  );
  if (!g || (g.owner_user_id !== p.userId && g.grantee_user_id !== p.userId))
    throw new PulseError('NOT_FOUND');
  await run(c.env.DB, 'UPDATE share_grants SET revoked_at=? WHERE id=?', new Date().toISOString(), g.id);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'share.revoke',
    resourceType: 'share_grant',
    resourceId: g.id,
  });
  if (c.env.SESSIONS) {
    // Encerra fluxos ao vivo do beneficiário (o DO derruba conexões sem grant válido).
    const stub = c.env.SESSIONS.get(c.env.SESSIONS.idFromName(`${p.tenantId}:telemetry:${g.owner_user_id}`));
    await stub.fetch('https://do/internal/revalidate', { method: 'POST' }).catch(() => undefined);
  }
  return c.json({ data: { revoked: true } });
});

/** Painel do cuidador (A49, F88): somente métricas concedidas, com idade de cada dado. */
shareRoutes.get('/care', async (c) => {
  const p = c.get('principal');
  const grants = await all<{
    id: string;
    owner_user_id: string;
    owner_name: string | null;
    scope_json: string;
    expires_at: string | null;
  }>(
    c.env.DB,
    `SELECT g.id,g.owner_user_id,u.display_name owner_name,g.scope_json,g.expires_at FROM share_grants g JOIN users u ON u.id=g.owner_user_id
      WHERE g.tenant_id=? AND g.grantee_user_id=? AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)`,
    p.tenantId,
    p.userId,
    new Date().toISOString(),
  );
  const out = [];
  for (const g of grants) {
    const scope = JSON.parse(g.scope_json) as GrantScope;
    const devices = await all<{ id: string; model: string; last_seen_at: string | null }>(
      c.env.DB,
      `SELECT id,model,last_seen_at FROM devices WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL ${scope.device_ids.length ? `AND id IN (${scope.device_ids.map(() => '?').join(',')})` : ''}`,
      p.tenantId,
      g.owner_user_id,
      ...scope.device_ids,
    );
    out.push({
      grant_id: g.id,
      owner_user_id: g.owner_user_id,
      owner_display_name: g.owner_name,
      metrics: scope.metrics,
      history_days: scope.history_days,
      devices,
    });
  }
  return c.json({ data: out, next_cursor: null });
});
