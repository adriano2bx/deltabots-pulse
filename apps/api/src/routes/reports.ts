import { Hono } from 'hono';
import { ExportRequest, ReportRequest } from '@pulse/contracts';
import { PulseError, localParts, mean, newId } from '@pulse/core';
import type { AppEnv, Env } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireHuman } from '../lib/auth';
import { all, first, run } from '../lib/db';
import { parseBody, type Ctx } from '../lib/http';
import { withIdempotency } from '../lib/idempotency';
import { activeConsents } from '../services/consent';
import { dailySeries, summarizeSleep } from '../services/health';

const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30 } as const;

/** Relatório consentido (F82, F231–F232): somente agregados observacionais e notas de qualidade. */
export async function buildReport(
  env: Env,
  tenantId: string,
  userId: string,
  period: keyof typeof PERIOD_DAYS,
  fromIso?: string,
) {
  const u = await first<{ timezone: string }>(env.DB, 'SELECT timezone FROM users WHERE id=?', userId);
  const tz = u?.timezone ?? 'America/Sao_Paulo';
  const days = PERIOD_DAYS[period];
  const to = fromIso ? new Date(new Date(fromIso).getTime() + days * 86400_000) : new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const devs = (
    await all<{ id: string }>(
      env.DB,
      'SELECT id FROM devices WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
      tenantId,
      userId,
    )
  ).map((d) => d.id);
  const hr = await dailySeries(env.DB, tenantId, devs, 'heart_rate_bpm', from, to, tz, 'avg');
  const steps = await dailySeries(env.DB, tenantId, devs, 'steps_delta', from, to, tz, 'sum');
  const hrRange = devs.length
    ? await first<{ mn: number | null; mx: number | null; n: number }>(
        env.DB,
        `SELECT MIN(value_num) mn, MAX(value_num) mx, COUNT(*) n FROM telemetry_readings WHERE tenant_id=? AND device_id IN (${devs.map(() => '?').join(',')}) AND kind='heart_rate_bpm' AND observed_at>=? AND observed_at<? AND quality='measured'`,
        tenantId,
        ...devs,
        from.toISOString(),
        to.toISOString(),
      )
    : null;
  const sleepRows = devs.length
    ? await all<{ start_at: string; end_at: string; stage: string; quality: string }>(
        env.DB,
        `SELECT start_at,end_at,stage,quality FROM sleep_intervals WHERE tenant_id=? AND device_id IN (${devs.map(() => '?').join(',')}) AND end_at>=? AND end_at<?`,
        tenantId,
        ...devs,
        from.toISOString(),
        to.toISOString(),
      )
    : [];
  const sleep = summarizeSleep(sleepRows, tz);
  const note = (n: number, label: string) =>
    n === 0
      ? [`Sem dados de ${label} no período.`]
      : n < days * 0.6
        ? [`Cobertura parcial: ${n} de ${days} dia(s) com ${label}.`]
        : [];
  const sections = [
    {
      kind: 'heart_rate',
      title: 'Frequência cardíaca',
      metrics: {
        avg_bpm: mean(hr.map((p) => p.value)),
        min_bpm: hrRange?.mn ?? null,
        max_bpm: hrRange?.mx ?? null,
        readings: hrRange?.n ?? 0,
      },
      notes: [...note(hr.length, 'frequência cardíaca'), 'Valores informativos, sem interpretação clínica.'],
    },
    {
      kind: 'steps',
      title: 'Atividade',
      metrics: {
        total_steps: steps.reduce((a, b) => a + b.value, 0),
        avg_daily_steps: mean(steps.map((p) => p.value)),
        active_days: steps.filter((s) => s.value >= 1000).length,
      },
      notes: note(steps.length, 'passos'),
    },
    {
      kind: 'sleep',
      title: 'Sono',
      metrics: {
        avg_duration_min: sleep.avg_duration_min,
        nights: sleep.nights.length,
        onset_spread_min: sleep.onset_spread_min,
      },
      notes: [...note(sleep.nights.length, 'sono'), 'Estágios estimados pela pulseira.'],
    },
  ];
  const id = newId('rep');
  const created = new Date().toISOString();
  await run(
    env.DB,
    'INSERT INTO reports(id,tenant_id,owner_user_id,period,window_from,window_to,sections_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
    id,
    tenantId,
    userId,
    period,
    from.toISOString(),
    to.toISOString(),
    JSON.stringify(sections),
    created,
  );
  return {
    id,
    period,
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: tz,
      local_start: localParts(from, tz).dateKey,
    },
    sections,
    created_at: created,
  };
}

export const reportRoutes = new Hono<AppEnv>();
reportRoutes.use('*', requireAuth);

reportRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    period: string;
    window_from: string;
    window_to: string;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT id,period,window_from,window_to,created_at FROM reports WHERE tenant_id=? AND owner_user_id=? ORDER BY created_at DESC LIMIT 100',
    p.tenantId,
    p.userId,
  );
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      period: r.period,
      window: { from: r.window_from, to: r.window_to },
      created_at: r.created_at,
    })),
    next_cursor: null,
  });
});

reportRoutes.post('/', async (c) => {
  const p = c.get('principal');
  const body = await parseBody(c, ReportRequest);
  const consents = await activeConsents(c.env.DB, p.tenantId, p.userId);
  if (!consents.has('health_processing'))
    throw new PulseError('CONSENT_REQUIRED', 'relatórios exigem consentimento health_processing');
  const report = await buildReport(c.env, p.tenantId, p.userId, body.period, body.from);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'report.generate',
    resourceType: 'report',
    resourceId: report.id,
    metadata: { period: body.period },
  });
  return c.json({ data: report }, 201);
});

reportRoutes.get('/:id', async (c) => {
  const p = c.get('principal');
  const r = await first<{
    id: string;
    period: string;
    window_from: string;
    window_to: string;
    sections_json: string;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT * FROM reports WHERE id=? AND tenant_id=? AND owner_user_id=?',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!r) throw new PulseError('NOT_FOUND');
  return c.json({
    data: {
      id: r.id,
      period: r.period,
      window: { from: r.window_from, to: r.window_to },
      sections: JSON.parse(r.sections_json),
      created_at: r.created_at,
    },
  });
});

export async function createExport(c: Ctx, kind: 'telemetry_csv' | 'telemetry_json' | 'full_json') {
  const p = c.get('principal');
  requireHuman(p);
  const id = newId('exp');
  const now = new Date().toISOString();
  await run(
    c.env.DB,
    `INSERT INTO exports(id,tenant_id,owner_user_id,kind,state,created_at) VALUES(?,?,?,?,'queued',?)`,
    id,
    p.tenantId,
    p.userId,
    kind,
    now,
  );
  await c.env.JOBS_QUEUE.send({ kind: 'export.build', event_id: id, tenant_id: p.tenantId, export_id: id });
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'export.request',
    resourceType: 'export',
    resourceId: id,
    metadata: { kind },
  });
  return { id, kind, state: 'queued', download_url: null, expires_at: null, created_at: now };
}

export const exportRoutes = new Hono<AppEnv>();
exportRoutes.use('*', requireAuth);

const exportDto = (
  env: Env,
  e: { id: string; kind: string; state: string; expires_at: string | null; created_at: string },
) => {
  const expired = e.expires_at !== null && new Date(e.expires_at) <= new Date();
  return {
    id: e.id,
    kind: e.kind,
    state: expired ? 'expired' : e.state,
    download_url:
      e.state === 'ready' && !expired ? `${env.PUBLIC_BASE_URL}/v1/exports/${e.id}/download` : null,
    expires_at: e.expires_at,
    created_at: e.created_at,
  };
};

exportRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    kind: string;
    state: string;
    expires_at: string | null;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT id,kind,state,expires_at,created_at FROM exports WHERE tenant_id=? AND owner_user_id=? ORDER BY created_at DESC LIMIT 50',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows.map((r) => exportDto(c.env, r)), next_cursor: null });
});

exportRoutes.post('/', async (c) => {
  const p = c.get('principal');
  const text = await c.req.raw.clone().text();
  const body = await parseBody(c, ExportRequest);
  const res = await withIdempotency(
    c.env.DB,
    { tenantId: p.tenantId, scope: 'export', key: c.req.header('idempotency-key'), requestBody: text },
    async () => ({ status: 202, body: { data: await createExport(c, body.kind) } }),
  );
  return c.json(res.body as object, 202);
});

exportRoutes.get('/:id', async (c) => {
  const p = c.get('principal');
  const e = await first<{
    id: string;
    kind: string;
    state: string;
    expires_at: string | null;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT id,kind,state,expires_at,created_at FROM exports WHERE id=? AND tenant_id=? AND owner_user_id=?',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!e) throw new PulseError('NOT_FOUND');
  return c.json({ data: exportDto(c.env, e) });
});

/** Download autenticado (somente o titular), servido pelo Worker a partir do R2 privado. */
exportRoutes.get('/:id/download', async (c) => {
  const p = c.get('principal');
  const e = await first<{ id: string; r2_key: string | null; state: string; expires_at: string | null }>(
    c.env.DB,
    'SELECT id,r2_key,state,expires_at FROM exports WHERE id=? AND tenant_id=? AND owner_user_id=?',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!e || e.state !== 'ready' || !e.r2_key) throw new PulseError('NOT_FOUND');
  if (e.expires_at && new Date(e.expires_at) <= new Date())
    throw new PulseError('NOT_FOUND', 'exportação expirada');
  const obj = await c.env.RAW_BUCKET.get(e.r2_key);
  if (!obj) throw new PulseError('NOT_FOUND');
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'export.download',
    resourceType: 'export',
    resourceId: e.id,
  });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-disposition': `attachment; filename="pulse-${e.id}.${e.r2_key.endsWith('csv') ? 'csv' : 'json'}"`,
      'cache-control': 'no-store',
    },
  });
});
