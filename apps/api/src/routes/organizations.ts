import { Hono } from 'hono';
import { z } from 'zod';
import { CreateOrganizationRequest, InviteMemberRequest, OrgRole } from '@pulse/contracts';
import { PulseError, canManageOrg, newId, randomToken, sha256Hex } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireHuman } from '../lib/auth';
import { emailHash } from '../lib/crypto';
import { all, first, run, stmt } from '../lib/db';
import { parseBody } from '../lib/http';

export const organizationRoutes = new Hono<AppEnv>();
organizationRoutes.use('*', requireAuth);

organizationRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    name: string;
    plan_id: string;
    status: string;
    role: string;
    created_at: string;
  }>(
    c.env.DB,
    `SELECT o.id,o.name,o.plan_id,o.status,m.role,o.created_at FROM org_members m JOIN organizations o ON o.id=m.tenant_id
      WHERE m.user_id=? AND m.status='active' ORDER BY o.created_at`,
    p.userId,
  );
  return c.json({ data: rows, next_cursor: null });
});

organizationRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const body = await parseBody(c, CreateOrganizationRequest);
  const id = newId('ten');
  const now = new Date().toISOString();
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      `INSERT INTO organizations(id,name,plan_id,status,created_by,created_at,updated_at) VALUES(?,?,'team','active',?,?,?)`,
      id,
      body.name,
      p.userId,
      now,
      now,
    ),
    stmt(
      c.env.DB,
      `INSERT INTO org_members(id,tenant_id,user_id,role,status,created_at) VALUES(?,?,?,'owner','active',?)`,
      newId('mem'),
      id,
      p.userId,
      now,
    ),
  ]);
  await audit(c.env.DB, {
    tenantId: id,
    actor: p,
    action: 'org.create',
    resourceType: 'organization',
    resourceId: id,
  });
  return c.json(
    { data: { id, name: body.name, plan_id: 'team', status: 'active', role: 'owner', created_at: now } },
    201,
  );
});

function assertSameTenant(tenantId: string, id: string): void {
  // O tenant vem da sessão; o parâmetro da rota só é aceito se coincidir (docs/10).
  if (tenantId !== id) throw new PulseError('TENANT_MISMATCH');
}

organizationRoutes.get('/:id/members', async (c) => {
  const p = c.get('principal');
  assertSameTenant(p.tenantId, c.req.param('id'));
  if (!['owner', 'org_admin', 'operator'].includes(p.orgRole ?? ''))
    throw new PulseError('FORBIDDEN', 'papel insuficiente');
  const rows = await all<{
    id: string;
    user_id: string;
    display_name: string | null;
    role: string;
    status: string;
    created_at: string;
  }>(
    c.env.DB,
    `SELECT m.id,m.user_id,u.display_name,m.role,m.status,m.created_at FROM org_members m JOIN users u ON u.id=m.user_id
      WHERE m.tenant_id=? ORDER BY m.created_at LIMIT 500`,
    p.tenantId,
  );
  return c.json({ data: rows, next_cursor: null });
});

/** Convite com token de uso único (entregue fora de banda); a pessoa aceita com a própria conta. */
organizationRoutes.post('/:id/members', async (c) => {
  const p = c.get('principal');
  assertSameTenant(p.tenantId, c.req.param('id'));
  const d = canManageOrg(p);
  if (!d.allow) throw new PulseError(p.mfa ? 'FORBIDDEN' : 'MFA_REQUIRED', d.reason);
  const body = await parseBody(c, InviteMemberRequest);
  const org = await first<{ plan_id: string }>(
    c.env.DB,
    'SELECT plan_id FROM organizations WHERE id=?',
    p.tenantId,
  );
  if (org?.plan_id === 'personal')
    throw new PulseError(
      'CONFLICT',
      'organizações pessoais não aceitam membros; crie uma organização de equipe',
    );
  const token = `inv_${randomToken(24)}`;
  const id = newId('inv');
  const now = new Date();
  await run(
    c.env.DB,
    `INSERT INTO org_invitations(id,tenant_id,email_hash,role,token_hash,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)`,
    id,
    p.tenantId,
    await emailHash(c.env.DATA_ENCRYPTION_KEY, body.email),
    body.role,
    await sha256Hex(token),
    p.userId,
    new Date(now.getTime() + 7 * 86400_000).toISOString(),
    now.toISOString(),
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'org.invite',
    resourceType: 'org_invitation',
    resourceId: id,
    metadata: { role: body.role },
  });
  return c.json(
    {
      data: {
        id,
        role: body.role,
        expires_at: new Date(now.getTime() + 7 * 86400_000).toISOString(),
        invite_token: token,
      },
    },
    201,
  );
});

organizationRoutes.post('/invitations/accept', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const { invite_token } = await parseBody(c, z.strictObject({ invite_token: z.string().min(20).max(200) }));
  const inv = await first<{
    id: string;
    tenant_id: string;
    email_hash: string;
    role: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  }>(
    c.env.DB,
    'SELECT id,tenant_id,email_hash,role,expires_at,accepted_at,revoked_at FROM org_invitations WHERE token_hash=?',
    await sha256Hex(invite_token),
  );
  if (!inv || inv.accepted_at || inv.revoked_at || new Date(inv.expires_at) <= new Date())
    throw new PulseError('NOT_FOUND', 'convite inválido ou expirado');
  const me = await first<{ email: string }>(c.env.DB, 'SELECT email FROM users WHERE id=?', p.userId);
  if (!me || (await emailHash(c.env.DATA_ENCRYPTION_KEY, me.email)) !== inv.email_hash)
    throw new PulseError('FORBIDDEN', 'convite destinado a outro e-mail');
  const role = OrgRole.parse(inv.role);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    stmt(c.env.DB, 'UPDATE org_invitations SET accepted_at=? WHERE id=?', now, inv.id),
    stmt(
      c.env.DB,
      `INSERT INTO org_members(id,tenant_id,user_id,role,status,created_at) VALUES(?,?,?,?,'active',?)
       ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role,status='active'`,
      newId('mem'),
      inv.tenant_id,
      p.userId,
      role,
      now,
    ),
  ]);
  await audit(c.env.DB, {
    tenantId: inv.tenant_id,
    actor: p,
    action: 'org.join',
    resourceType: 'organization',
    resourceId: inv.tenant_id,
    metadata: { role },
  });
  return c.json({ data: { tenant_id: inv.tenant_id, role } });
});

organizationRoutes.delete('/:id/members/:memberId', async (c) => {
  const p = c.get('principal');
  assertSameTenant(p.tenantId, c.req.param('id'));
  const d = canManageOrg(p);
  if (!d.allow) throw new PulseError(p.mfa ? 'FORBIDDEN' : 'MFA_REQUIRED', d.reason);
  const m = await first<{ id: string; user_id: string; role: string }>(
    c.env.DB,
    'SELECT id,user_id,role FROM org_members WHERE id=? AND tenant_id=?',
    c.req.param('memberId'),
    p.tenantId,
  );
  if (!m) throw new PulseError('NOT_FOUND');
  if (m.role === 'owner') throw new PulseError('CONFLICT', 'o proprietário não pode ser removido');
  const now = new Date().toISOString();
  await c.env.DB.batch([
    stmt(c.env.DB, `UPDATE org_members SET status='removed' WHERE id=?`, m.id),
    stmt(
      c.env.DB,
      'UPDATE sessions SET revoked_at=? WHERE tenant_id=? AND user_id=? AND revoked_at IS NULL',
      now,
      p.tenantId,
      m.user_id,
    ),
  ]);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'org.member_remove',
    resourceType: 'org_member',
    resourceId: m.id,
  });
  return c.json({ data: { removed: true } });
});
