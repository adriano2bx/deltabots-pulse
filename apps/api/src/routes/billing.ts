import { Hono } from 'hono';
import { PulseError, canReadAudit } from '@pulse/core';
import type { AppEnv } from '../env';
import { requireAuth } from '../lib/auth';
import { all, first } from '../lib/db';

/** Planos e limites (F61, F329). Cobrança por provedor externo fica BLOCKED_EXTERNAL até contrato. */
export const PLANS = [
  {
    id: 'personal',
    name: 'Pessoal',
    price_brl_cents: 0,
    interval: 'none',
    limits: { devices: 2, automations: 10, ai_messages_month: 200, family_grants: 3, api_keys: 2 },
  },
  {
    id: 'plus',
    name: 'Plus',
    price_brl_cents: 1990,
    interval: 'month',
    limits: { devices: 5, automations: 50, ai_messages_month: 2000, family_grants: 10, api_keys: 10 },
  },
  {
    id: 'team',
    name: 'Equipe',
    price_brl_cents: 9900,
    interval: 'month',
    limits: { devices: 100, automations: 500, ai_messages_month: 20000, family_grants: 100, api_keys: 50 },
  },
] as const;

export const billingRoutes = new Hono<AppEnv>();
billingRoutes.use('*', requireAuth);

billingRoutes.get('/plans', (c) => c.json({ data: PLANS, next_cursor: null }));

billingRoutes.get('/subscription', async (c) => {
  const p = c.get('principal');
  const org = await first<{ plan_id: string }>(
    c.env.DB,
    'SELECT plan_id FROM organizations WHERE id=?',
    p.tenantId,
  );
  const sub = await first<{
    plan_id: string;
    status: string;
    provider: string | null;
    period_end: string | null;
  }>(
    c.env.DB,
    'SELECT plan_id,status,provider,period_end FROM billing_subscriptions WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1',
    p.tenantId,
  );
  return c.json({
    data: sub ?? {
      plan_id: org?.plan_id ?? 'personal',
      status: 'active',
      provider: null,
      period_end: null,
      note: 'Plano gratuito; pagamento por provedor ainda não habilitado.',
    },
  });
});

/** Consumo medido a partir dos próprios registros (F328) — sem números fictícios. */
billingRoutes.get('/usage', async (c) => {
  const p = c.get('principal');
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const org = await first<{ plan_id: string }>(
    c.env.DB,
    'SELECT plan_id FROM organizations WHERE id=?',
    p.tenantId,
  );
  const plan = PLANS.find((x) => x.id === org?.plan_id) ?? PLANS[0];
  const count = async (sql: string, ...params: string[]) =>
    (await first<{ n: number }>(c.env.DB, sql, ...params))?.n ?? 0;
  const items = [
    {
      metric: 'devices',
      value: await count(
        'SELECT COUNT(*) n FROM devices WHERE tenant_id=? AND revoked_at IS NULL',
        p.tenantId,
      ),
      limit: plan.limits.devices,
    },
    {
      metric: 'automations',
      value: await count(
        'SELECT COUNT(*) n FROM automations WHERE tenant_id=? AND deleted_at IS NULL',
        p.tenantId,
      ),
      limit: plan.limits.automations,
    },
    {
      metric: 'telemetry_readings_month',
      value: await count(
        'SELECT COUNT(*) n FROM telemetry_readings WHERE tenant_id=? AND received_at>=?',
        p.tenantId,
        monthStart.toISOString(),
      ),
      limit: null,
    },
    {
      metric: 'ai_messages_month',
      value: await count(
        `SELECT COUNT(*) n FROM ai_messages WHERE tenant_id=? AND role='user' AND created_at>=?`,
        p.tenantId,
        monthStart.toISOString(),
      ),
      limit: plan.limits.ai_messages_month,
    },
    {
      metric: 'family_grants',
      value: await count(
        'SELECT COUNT(*) n FROM share_grants WHERE tenant_id=? AND revoked_at IS NULL',
        p.tenantId,
      ),
      limit: plan.limits.family_grants,
    },
    {
      metric: 'api_keys',
      value: await count(
        'SELECT COUNT(*) n FROM api_keys WHERE tenant_id=? AND revoked_at IS NULL',
        p.tenantId,
      ),
      limit: plan.limits.api_keys,
    },
  ];
  return c.json({
    data: items.map((i) => ({ ...i, bucket_start: monthStart.toISOString() })),
    next_cursor: null,
  });
});

billingRoutes.post('/checkout', () => {
  throw new PulseError(
    'INTEGRATION_BLOCKED',
    'provedor de pagamento ainda não configurado pelo proprietário',
  );
});

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAuth);

adminRoutes.get('/audit', async (c) => {
  const p = c.get('principal');
  const d = canReadAudit(p);
  if (!d.allow) throw new PulseError(p.mfa ? 'FORBIDDEN' : 'MFA_REQUIRED', d.reason);
  const action = c.req.query('action');
  const rows = await all<{
    id: string;
    actor_ref: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    reason_code: string | null;
    metadata_safe_json: string;
    created_at: string;
  }>(
    c.env.DB,
    `SELECT id,actor_ref,action,resource_type,resource_id,reason_code,metadata_safe_json,created_at FROM audit_events WHERE tenant_id=? ${action ? 'AND action=?' : ''} ORDER BY created_at DESC LIMIT 200`,
    p.tenantId,
    ...(action ? [action] : []),
  );
  return c.json({
    data: rows.map((r) => ({
      ...r,
      metadata: JSON.parse(r.metadata_safe_json),
      metadata_safe_json: undefined,
    })),
    next_cursor: null,
  });
});

/** Saúde interna (F290): verifica dependências reais, sem expor segredos. */
adminRoutes.get('/health', async (c) => {
  const p = c.get('principal');
  if (!['owner', 'org_admin', 'operator'].includes(p.orgRole ?? '')) throw new PulseError('FORBIDDEN');
  const t0 = Date.now();
  let d1 = 'ok';
  try {
    await first(c.env.DB, 'SELECT 1 AS ok');
  } catch {
    d1 = 'error';
  }
  return c.json({
    data: {
      d1: { status: d1, latency_ms: Date.now() - t0 },
      r2: { status: c.env.RAW_BUCKET ? 'bound' : 'missing' },
      queues: { status: c.env.INGEST_QUEUE && c.env.NOTIFY_QUEUE && c.env.JOBS_QUEUE ? 'bound' : 'missing' },
      durable_objects: { status: c.env.SESSIONS ? 'bound' : 'missing' },
      workers_ai: { status: c.env.AI ? 'bound' : 'not_configured' },
      env: c.env.APP_ENV,
      checked_at: new Date().toISOString(),
    },
  });
});

adminRoutes.get('/metrics', async (c) => {
  const p = c.get('principal');
  if (!['owner', 'org_admin', 'operator'].includes(p.orgRole ?? '')) throw new PulseError('FORBIDDEN');
  const since = new Date(Date.now() - 86400_000).toISOString();
  const q = async (sql: string) => (await first<{ n: number }>(c.env.DB, sql, p.tenantId, since))?.n ?? 0;
  return c.json({
    data: {
      window: '24h',
      telemetry_ingested: await q(
        'SELECT COUNT(*) n FROM telemetry_readings WHERE tenant_id=? AND received_at>=?',
      ),
      automation_runs: await q('SELECT COUNT(*) n FROM automation_runs WHERE tenant_id=? AND started_at>=?'),
      automation_failures: await q(
        `SELECT COUNT(*) n FROM automation_runs WHERE tenant_id=? AND started_at>=? AND status='failed'`,
      ),
      notifications_failed: await q(
        `SELECT COUNT(*) n FROM notifications WHERE tenant_id=? AND created_at>=? AND status='failed'`,
      ),
      webhook_failures: await q(
        `SELECT COUNT(*) n FROM webhook_deliveries WHERE tenant_id=? AND created_at>=? AND status='failed'`,
      ),
      control_commands: await q('SELECT COUNT(*) n FROM control_commands WHERE tenant_id=? AND issued_at>=?'),
    },
  });
});
