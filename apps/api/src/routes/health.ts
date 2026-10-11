import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireAuth } from '../lib/auth';
import { all, first } from '../lib/db';
import { parseQuery, type Ctx } from '../lib/http';
import { assertHealthRead } from '../services/access';
import { dailySeries, describeTrend, summarizeSleep } from '../services/health';

const SubjectQuery = z.object({
  subject_user_id: z.string().min(5).max(100).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

async function subject(
  c: Ctx,
  subjectId: string | undefined,
  metric: 'heart_rate' | 'steps' | 'sleep',
  days: number,
) {
  const p = c.get('principal');
  const owner = subjectId ?? p.userId;
  await assertHealthRead(c.env.DB, p, owner, metric, {
    observedFrom: new Date(Date.now() - days * 86400_000),
  });
  const u = await first<{ timezone: string }>(c.env.DB, 'SELECT timezone FROM users WHERE id=?', owner);
  const devices = await all<{ id: string }>(
    c.env.DB,
    'SELECT id FROM devices WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
    p.tenantId,
    owner,
  );
  return { owner, tz: u?.timezone ?? 'America/Sao_Paulo', deviceIds: devices.map((d) => d.id) };
}

export const healthRoutes = new Hono<AppEnv>();
healthRoutes.use('*', requireAuth);
/** /v1/activities e /v1/sleep (OpenAPI) apontam para os mesmos handlers de /v1/health/*. */
export const activitiesRoutes = new Hono<AppEnv>();
activitiesRoutes.use('*', requireAuth);
export const sleepRoutes = new Hono<AppEnv>();
sleepRoutes.use('*', requireAuth);

healthRoutes.get('/trends', async (c) => {
  const q = parseQuery(c, SubjectQuery.extend({ kind: z.enum(['heart_rate_bpm', 'steps_delta']) }));
  const s = await subject(c, q.subject_user_id, q.kind === 'heart_rate_bpm' ? 'heart_rate' : 'steps', q.days);
  const to = new Date();
  const from = new Date(to.getTime() - q.days * 86400_000);
  const points = await dailySeries(
    c.env.DB,
    c.get('principal').tenantId,
    s.deviceIds,
    q.kind,
    from,
    to,
    s.tz,
    q.kind === 'steps_delta' ? 'sum' : 'avg',
  );
  const t =
    q.kind === 'heart_rate_bpm'
      ? describeTrend(q.kind, points, q.days, 'Frequência cardíaca média', 'bpm')
      : describeTrend(q.kind, points, q.days, 'Passos diários', 'passos');
  return c.json({ data: { ...t, timezone: s.tz, generated_at: to.toISOString() } });
});

const sleepHandler = async (c: Ctx) => {
  const q = parseQuery(c, SubjectQuery);
  const s = await subject(c, q.subject_user_id, 'sleep', q.days);
  if (!s.deviceIds.length)
    return c.json({
      data: {
        nights: [],
        avg_duration_min: null,
        onset_spread_min: null,
        atypical_nights: [],
        timezone: s.tz,
      },
    });
  const rows = await all<{ start_at: string; end_at: string; stage: string; quality: string }>(
    c.env.DB,
    `SELECT start_at,end_at,stage,quality FROM sleep_intervals WHERE tenant_id=? AND device_id IN (${s.deviceIds.map(() => '?').join(',')}) AND end_at>=? ORDER BY start_at`,
    c.get('principal').tenantId,
    ...s.deviceIds,
    new Date(Date.now() - q.days * 86400_000).toISOString(),
  );
  return c.json({
    data: {
      ...summarizeSleep(rows, s.tz),
      timezone: s.tz,
      limitations: 'Estágios de sono estimados pela pulseira; não equivalem a polissonografia.',
    },
  });
};
healthRoutes.get('/sleep', sleepHandler);
sleepRoutes.get('/', sleepHandler);

const activitiesHandler = async (c: Ctx) => {
  const q = parseQuery(c, SubjectQuery);
  const s = await subject(c, q.subject_user_id, 'steps', q.days);
  const to = new Date();
  const from = new Date(to.getTime() - q.days * 86400_000);
  const steps = await dailySeries(
    c.env.DB,
    c.get('principal').tenantId,
    s.deviceIds,
    'steps_delta',
    from,
    to,
    s.tz,
    'sum',
  );
  const sessions = await all(
    c.env.DB,
    'SELECT id,kind,start_at,end_at,details_json,quality FROM activity_sessions WHERE tenant_id=? AND owner_user_id=? AND start_at>=? ORDER BY start_at DESC LIMIT 200',
    c.get('principal').tenantId,
    s.owner,
    from.toISOString(),
  );
  return c.json({ data: { daily_steps: steps, sessions, timezone: s.tz } });
};
healthRoutes.get('/activities', activitiesHandler);
activitiesRoutes.get('/', activitiesHandler);
