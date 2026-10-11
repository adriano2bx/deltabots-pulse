import { Hono } from 'hono';
import {
  CreateApiKeyRequest,
  CreateIntegrationRequest,
  CreateWebhookRequest,
  type Scope,
} from '@pulse/contracts';
import { PulseError, newId, randomToken, sha256Hex } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { API_KEY_PREFIX, requireAuth, requireHuman, requireMfa } from '../lib/auth';
import { encrypt } from '../lib/crypto';
import { all, run } from '../lib/db';
import { parseBody } from '../lib/http';
import { MCP_TOOLS } from '../services/mcp';
import { assertSafeWebhookUrl } from '../services/webhooks';

export const integrationRoutes = new Hono<AppEnv>();
integrationRoutes.use('*', requireAuth);

integrationRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all(
    c.env.DB,
    'SELECT id,kind,label,state,created_at FROM integrations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100',
    p.tenantId,
  );
  return c.json({ data: rows, next_cursor: null });
});

/** Configuração é cifrada em repouso; JEV fica INTEGRATION_BLOCKED até haver contrato/endpoint real (docs/13). */
integrationRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  requireMfa(p);
  const body = await parseBody(c, CreateIntegrationRequest);
  for (const [k, v] of Object.entries(body.config)) {
    if (typeof v === 'string' && /url$/i.test(k)) {
      try {
        assertSafeWebhookUrl(v);
      } catch (e) {
        throw new PulseError('VALIDATION_ERROR', `${k}: ${(e as Error).message}`);
      }
    }
  }
  const id = newId('int');
  const state = body.kind === 'jev' ? 'INTEGRATION_BLOCKED' : 'disabled';
  const now = new Date().toISOString();
  await run(
    c.env.DB,
    'INSERT INTO integrations(id,tenant_id,kind,label,config_encrypted,state,created_at) VALUES(?,?,?,?,?,?,?)',
    id,
    p.tenantId,
    body.kind,
    body.label,
    await encrypt(c.env.DATA_ENCRYPTION_KEY, JSON.stringify(body.config)),
    state,
    now,
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'integration.create',
    resourceType: 'integration',
    resourceId: id,
    metadata: { kind: body.kind },
  });
  return c.json({ data: { id, kind: body.kind, label: body.label, state, created_at: now } }, 201);
});

export const webhookRoutes = new Hono<AppEnv>();
webhookRoutes.use('*', requireAuth);

webhookRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    url: string;
    event_types_json: string;
    enabled: number;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT id,url,event_types_json,enabled,created_at FROM webhooks WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100',
    p.tenantId,
  );
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      url: r.url,
      event_types: JSON.parse(r.event_types_json),
      enabled: r.enabled === 1,
      created_at: r.created_at,
    })),
    next_cursor: null,
  });
});

/** Segredo de assinatura exibido uma única vez e guardado cifrado (F203, F255). */
webhookRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const body = await parseBody(c, CreateWebhookRequest);
  try {
    assertSafeWebhookUrl(body.url);
  } catch (e) {
    throw new PulseError('VALIDATION_ERROR', `url: ${(e as Error).message}`);
  }
  const id = newId('whk');
  const secret = `whsec_${randomToken(24)}`;
  const now = new Date().toISOString();
  await run(
    c.env.DB,
    'INSERT INTO webhooks(id,tenant_id,integration_id,url,secret_ref,event_types_json,enabled,created_at) VALUES(?,?,?,?,?,?,1,?)',
    id,
    p.tenantId,
    body.integration_id ?? null,
    body.url,
    await encrypt(c.env.DATA_ENCRYPTION_KEY, secret),
    JSON.stringify(body.event_types),
    now,
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'webhook.create',
    resourceType: 'webhook',
    resourceId: id,
    metadata: { host: new URL(body.url).hostname },
  });
  return c.json(
    { data: { id, url: body.url, event_types: body.event_types, enabled: true, created_at: now, secret } },
    201,
  );
});

webhookRoutes.delete('/:id', async (c) => {
  const p = c.get('principal');
  const r = await run(
    c.env.DB,
    'UPDATE webhooks SET enabled=0 WHERE id=? AND tenant_id=?',
    c.req.param('id'),
    p.tenantId,
  );
  if (!r.meta.changes) throw new PulseError('NOT_FOUND');
  return c.json({ data: { disabled: true } });
});

export const apiKeyRoutes = new Hono<AppEnv>();
apiKeyRoutes.use('*', requireAuth);

apiKeyRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    key_prefix: string;
    label: string | null;
    scopes_json: string;
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT id,key_prefix,label,scopes_json,expires_at,revoked_at,last_used_at,created_at FROM api_keys WHERE tenant_id=? AND owner_user_id=? ORDER BY created_at DESC LIMIT 100',
    p.tenantId,
    p.userId,
  );
  return c.json({
    data: rows.map((r) => ({ ...r, scopes: JSON.parse(r.scopes_json), scopes_json: undefined })),
    next_cursor: null,
  });
});

/** API keys com escopos mínimos (F253): segredo exibido uma vez; não pode exceder a sessão; admin exige MFA. */
apiKeyRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  requireMfa(p);
  const body = await parseBody(c, CreateApiKeyRequest);
  const forbidden: Scope[] = ['admin:read', 'org:manage', 'control:execute'];
  const bad = body.scopes.filter((s) => forbidden.includes(s) || !p.scopes.has(s));
  if (bad.length) throw new PulseError('FORBIDDEN', `escopos não permitidos para chaves: ${bad.join(', ')}`);
  const secret = `${API_KEY_PREFIX}${randomToken(32)}`;
  const id = newId('key');
  const now = new Date().toISOString();
  await run(
    c.env.DB,
    'INSERT INTO api_keys(id,tenant_id,owner_user_id,key_prefix,key_hash,scopes_json,expires_at,created_at,label) VALUES(?,?,?,?,?,?,?,?,?)',
    id,
    p.tenantId,
    p.userId,
    secret.slice(0, 10),
    await sha256Hex(secret),
    JSON.stringify(body.scopes),
    body.expires_at ?? null,
    now,
    body.label ?? null,
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'api_key.create',
    resourceType: 'api_key',
    resourceId: id,
    metadata: { scopes: body.scopes },
  });
  return c.json(
    {
      data: {
        id,
        key_prefix: secret.slice(0, 10),
        scopes: body.scopes,
        expires_at: body.expires_at ?? null,
        revoked_at: null,
        created_at: now,
        secret,
      },
    },
    201,
  );
});

apiKeyRoutes.delete('/:id', async (c) => {
  const p = c.get('principal');
  const r = await run(
    c.env.DB,
    'UPDATE api_keys SET revoked_at=? WHERE id=? AND tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
    new Date().toISOString(),
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!r.meta.changes) throw new PulseError('NOT_FOUND');
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'api_key.revoke',
    resourceType: 'api_key',
    resourceId: c.req.param('id'),
  });
  return c.json({ data: { revoked: true } });
});

export const mcpRoutes = new Hono<AppEnv>();
mcpRoutes.use('*', requireAuth);
mcpRoutes.get('/tools', (c) => {
  const p = c.get('principal');
  // Lista somente as ferramentas cujo escopo o chamador possui (F268).
  return c.json({ data: MCP_TOOLS.filter((t) => p.scopes.has(t.required_scope)), next_cursor: null });
});
