import { Hono } from 'hono';
import { z } from 'zod';
import { HistoryQuery, SummaryQuery, TelemetryBatch, TelemetryKind, type Quality } from '@pulse/contracts';
import { PulseError, bucketStart } from '@pulse/core';
import type { AppEnv } from '../env';
import { requireAuth, requireGateway, requireScope } from '../lib/auth';
import { all, first } from '../lib/db';
import { decodeCursor, encodeCursor, parseBody, parseQuery } from '../lib/http';
import { assertHealthRead, loadDevice, metricOf } from '../services/access';
import { STALE_AFTER_MS, ingestBatch } from '../services/telemetry';

export const telemetryRoutes = new Hono<AppEnv>();
telemetryRoutes.use('*', requireAuth);

telemetryRoutes.post('/batch', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'telemetry:write');
  const text = await c.req.raw.clone().text();
  const { gatewayId } = await requireGateway(c, text);
  const batch = await parseBody(c, TelemetryBatch);
  return c.json(await ingestBatch(c.env, p, gatewayId, batch));
});

interface ReadingRow {
  reading_id: string;
  device_id: string;
  kind: z.infer<typeof TelemetryKind>;
  observed_at: string;
  received_at: string;
  value_num: number | null;
  value_json: string | null;
  unit: string;
  quality: Quality;
  firmware: string | null;
}

const readingDto = (r: ReadingRow, source: string) => ({
  reading_id: r.reading_id,
  device_id: r.device_id,
  kind: r.kind,
  observed_at: r.observed_at,
  received_at: r.received_at,
  value: r.value_num ?? (r.value_json ? JSON.parse(r.value_json) : null),
  unit: r.unit,
  quality: r.quality,
  source,
  firmware: r.firmware,
});

/** Última leitura por tipo, com idade e marcação de desatualizado (RF-01, T020). */
telemetryRoutes.get('/latest', async (c) => {
  const p = c.get('principal');
  const q = parseQuery(c, z.object({ device_id: z.string().min(5).max(100), kinds: z.string().optional() }));
  const d = await loadDevice(c.env.DB, p, q.device_id);
  const kinds = (q.kinds?.split(',') ?? TelemetryKind.options).map((k) => TelemetryKind.parse(k));
  const out = [];
  const now = Date.now();
  for (const kind of kinds) {
    try {
      await assertHealthRead(c.env.DB, p, d.owner_user_id, metricOf(kind), { deviceId: d.id });
    } catch (e) {
      if (d.owner_user_id === p.userId) throw e;
      continue; // beneficiário só vê o que foi concedido
    }
    const r = await first<ReadingRow>(
      c.env.DB,
      `SELECT reading_id,device_id,kind,observed_at,received_at,value_num,value_json,unit,quality,firmware FROM telemetry_readings WHERE tenant_id=? AND device_id=? AND kind=? ORDER BY observed_at DESC LIMIT 1`,
      p.tenantId,
      d.id,
      kind,
    );
    if (!r) continue;
    const age = now - new Date(r.observed_at).getTime();
    out.push({
      ...readingDto(r, `device:${d.model}`),
      age_s: Math.round(age / 1000),
      stale: age > STALE_AFTER_MS[kind],
    });
  }
  return c.json({ data: out, next_cursor: null });
});

telemetryRoutes.get('/history', async (c) => {
  const p = c.get('principal');
  const q = parseQuery(c, HistoryQuery.extend({ device_id: z.string().min(5).max(100) }));
  const d = await loadDevice(c.env.DB, p, q.device_id);
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (to <= from) throw new PulseError('VALIDATION_ERROR', 'intervalo inválido');
  if (to.getTime() - from.getTime() > 92 * 86400_000)
    throw new PulseError('VALIDATION_ERROR', 'intervalo máximo de 92 dias');
  await assertHealthRead(c.env.DB, p, d.owner_user_id, metricOf(q.kind), {
    deviceId: d.id,
    observedFrom: from,
  });
  const cur = decodeCursor(q.cursor);
  const rows = await all<ReadingRow>(
    c.env.DB,
    `SELECT reading_id,device_id,kind,observed_at,received_at,value_num,value_json,unit,quality,firmware FROM telemetry_readings
      WHERE tenant_id=? AND device_id=? AND kind=? AND observed_at>=? AND observed_at<?
        ${cur ? 'AND (observed_at<? OR (observed_at=? AND reading_id<?))' : ''}
      ORDER BY observed_at DESC, reading_id DESC LIMIT ?`,
    p.tenantId,
    d.id,
    q.kind,
    from.toISOString(),
    to.toISOString(),
    ...(cur ? [cur.sortKey, cur.sortKey, cur.id] : []),
    q.limit + 1,
  );
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return c.json({
    data: page.map((r) => readingDto(r, `device:${d.model}`)),
    next_cursor: rows.length > q.limit && last ? encodeCursor(last.observed_at, last.reading_id) : null,
  });
});

/** Séries agregadas em buckets (F181, F185). Sem preenchimento artificial: buckets sem dado não aparecem (RF-04). */
telemetryRoutes.get('/summary', async (c) => {
  const p = c.get('principal');
  const q = parseQuery(c, SummaryQuery.extend({ device_id: z.string().min(5).max(100) }));
  const d = await loadDevice(c.env.DB, p, q.device_id);
  const from = new Date(q.from);
  const to = new Date(q.to);
  const size = Number(q.bucket_s);
  if (to <= from || (to.getTime() - from.getTime()) / 1000 / size > 2000)
    throw new PulseError('VALIDATION_ERROR', 'intervalo inválido ou buckets demais');
  await assertHealthRead(c.env.DB, p, d.owner_user_id, metricOf(q.kind), {
    deviceId: d.id,
    observedFrom: from,
  });
  const rows = await all<{ observed_at: string; value_num: number; quality: Quality }>(
    c.env.DB,
    `SELECT observed_at,value_num,quality FROM telemetry_readings WHERE tenant_id=? AND device_id=? AND kind=? AND observed_at>=? AND observed_at<? AND value_num IS NOT NULL AND quality IN ('measured','estimated') ORDER BY observed_at LIMIT 50000`,
    p.tenantId,
    d.id,
    q.kind,
    from.toISOString(),
    to.toISOString(),
  );
  const buckets = new Map<
    string,
    { count: number; min: number; max: number; sum: number; estimated: boolean }
  >();
  for (const r of rows) {
    const k = bucketStart(r.observed_at, size);
    const b = buckets.get(k) ?? { count: 0, min: Infinity, max: -Infinity, sum: 0, estimated: false };
    b.count += 1;
    b.min = Math.min(b.min, r.value_num);
    b.max = Math.max(b.max, r.value_num);
    b.sum += r.value_num;
    b.estimated ||= r.quality === 'estimated';
    buckets.set(k, b);
  }
  // Buckets mais antigos que o histórico bruto retido vêm de telemetry_aggregates.
  const oldest = rows[0]?.observed_at ?? to.toISOString();
  if (size >= 3600) {
    const aggs = await all<{
      bucket_start: string;
      count: number;
      value_min: number;
      value_max: number;
      value_sum: number;
      quality: Quality;
    }>(
      c.env.DB,
      `SELECT bucket_start,count,value_min,value_max,value_sum,quality FROM telemetry_aggregates WHERE tenant_id=? AND device_id=? AND kind=? AND bucket_size_s=? AND bucket_start>=? AND bucket_start<?`,
      p.tenantId,
      d.id,
      q.kind,
      size,
      from.toISOString(),
      bucketStart(oldest, size),
    );
    for (const a of aggs)
      if (!buckets.has(a.bucket_start))
        buckets.set(a.bucket_start, {
          count: a.count,
          min: a.value_min,
          max: a.value_max,
          sum: a.value_sum,
          estimated: a.quality === 'estimated',
        });
  }
  const data = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, b]) => ({
      bucket_start: start,
      bucket_size_s: size,
      count: b.count,
      min: b.min,
      max: b.max,
      avg: Math.round((b.sum / b.count) * 100) / 100,
      sum: b.sum,
      quality: b.estimated ? 'estimated' : 'measured',
    }));
  return c.json({
    data,
    next_cursor: null,
    meta: {
      device_id: d.id,
      kind: q.kind,
      source: `device:${d.model}`,
      generated_at: new Date().toISOString(),
    },
  });
});
