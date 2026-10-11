import type { Quality, TelemetryBatch, TelemetryBatchAck, TelemetryKind } from '@pulse/contracts';
import { PulseError, bucketStart, newId, normalizeReading, type Principal } from '@pulse/core';
import type { Env } from '../env';
import { all, first, stmt } from '../lib/db';
import { activeConsents } from './consent';
import { HEALTH_KINDS, loadOwnedDevice } from './access';

type Rejected = TelemetryBatchAck['rejected'][number];

/** Ingestão idempotente (F161–F178): cada leitura é única por (tenant, dispositivo, reading_id). */
export async function ingestBatch(
  env: Env,
  p: Principal,
  gatewayId: string,
  batch: TelemetryBatch,
): Promise<TelemetryBatchAck> {
  if (batch.gateway_id !== gatewayId)
    throw new PulseError('FORBIDDEN', 'gateway_id não corresponde à sessão');
  const device = await loadOwnedDevice(env.DB, p, batch.device_id);
  const bound = await first<{ id: string }>(
    env.DB,
    'SELECT id FROM device_bindings WHERE tenant_id=? AND device_id=? AND gateway_id=? AND valid_to IS NULL',
    p.tenantId,
    device.id,
    gatewayId,
  );
  if (!bound) throw new PulseError('FORBIDDEN', 'dispositivo não vinculado a este gateway');

  const consents = await activeConsents(env.DB, p.tenantId, p.userId);
  const healthAllowed = consents.has('health_processing') && consents.has('cloud_sync_health');
  const now = new Date();
  const nowIso = now.toISOString();
  const rejected: Rejected[] = [];
  const duplicates: string[] = [];
  const candidates: Array<{
    id: string;
    kind: TelemetryKind;
    observedAt: string;
    valueNum: number | null;
    valueJson: string | null;
    quality: Quality;
    stmt: D1PreparedStatement;
  }> = [];
  const seen = new Set<string>();

  for (const r of batch.readings) {
    if (seen.has(r.reading_id)) {
      duplicates.push(r.reading_id);
      continue;
    }
    seen.add(r.reading_id);
    if (HEALTH_KINDS.has(r.kind) && !healthAllowed) {
      rejected.push({ reading_id: r.reading_id, code: 'CONSENT_REQUIRED' });
      continue;
    }
    const n = normalizeReading(r, now);
    if ('reject' in n) {
      rejected.push({ reading_id: r.reading_id, code: n.reject });
      continue;
    }
    const v = n.ok;
    candidates.push({
      id: v.readingId,
      kind: v.kind,
      observedAt: v.observedAt,
      valueNum: v.valueNum,
      valueJson: v.valueJson,
      quality: v.quality,
      stmt: stmt(
        env.DB,
        `INSERT INTO telemetry_readings(id,tenant_id,device_id,gateway_id,source_id,reading_id,kind,observed_at,received_at,value_num,value_json,unit,quality,firmware)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,source_id,reading_id) DO NOTHING`,
        newId('rd'),
        p.tenantId,
        device.id,
        gatewayId,
        device.id,
        v.readingId,
        v.kind,
        v.observedAt,
        nowIso,
        v.valueNum,
        v.valueJson,
        v.unit,
        v.quality,
        v.firmware ?? device.firmware,
      ),
    });
  }

  const accepted: string[] = [];
  if (candidates.length > 0) {
    const results = await env.DB.batch(candidates.map((c) => c.stmt));
    const side: D1PreparedStatement[] = [];
    let latestBattery: { at: string; value: number } | null = null;
    let latestConnection: { at: string; value: string } | null = null;
    results.forEach((res, i) => {
      const c = candidates[i]!;
      if (!res.meta.changes) {
        duplicates.push(c.id);
        return;
      }
      accepted.push(c.id);
      if (c.kind === 'sleep_interval' && c.valueJson) {
        const v = JSON.parse(c.valueJson) as { start_at: string; end_at: string; stage: string };
        side.push(
          stmt(
            env.DB,
            `INSERT OR IGNORE INTO sleep_intervals(id,tenant_id,device_id,start_at,end_at,stage,quality,source_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
            `slp_${device.id}_${c.id}`,
            p.tenantId,
            device.id,
            v.start_at,
            v.end_at,
            v.stage,
            c.quality,
            c.id,
            nowIso,
          ),
        );
      }
      if (c.kind === 'activity' && c.valueJson) {
        const v = JSON.parse(c.valueJson) as { kind?: string; start_at?: string; end_at?: string };
        side.push(
          stmt(
            env.DB,
            `INSERT OR IGNORE INTO activity_sessions(id,tenant_id,device_id,owner_user_id,kind,start_at,end_at,details_json,quality) VALUES(?,?,?,?,?,?,?,?,?)`,
            `act_${device.id}_${c.id}`,
            p.tenantId,
            device.id,
            p.userId,
            String(v.kind ?? 'activity'),
            String(v.start_at ?? c.observedAt),
            v.end_at ?? null,
            c.valueJson,
            c.quality,
          ),
        );
      }
      if (
        c.kind === 'battery_percent' &&
        c.valueNum !== null &&
        (!latestBattery || c.observedAt > latestBattery.at)
      ) {
        latestBattery = { at: c.observedAt, value: c.valueNum };
      }
      if (c.kind === 'connection_state' && c.valueJson) {
        const state = JSON.parse(c.valueJson) as string;
        side.push(
          stmt(
            env.DB,
            `INSERT OR IGNORE INTO device_connection_events(id,tenant_id,device_id,gateway_id,state,reason,at) VALUES(?,?,?,?,?,?,?)`,
            `cev_${device.id}_${c.id}`,
            p.tenantId,
            device.id,
            gatewayId,
            state,
            'reported_by_gateway',
            c.observedAt,
          ),
        );
        if (!latestConnection || c.observedAt > latestConnection.at)
          latestConnection = { at: c.observedAt, value: state };
      }
    });
    const lb = latestBattery as { at: string; value: number } | null;
    const lc = latestConnection as { at: string; value: string } | null;
    side.push(
      stmt(
        env.DB,
        `INSERT INTO device_status(device_id,tenant_id,connection_state,battery_percent,battery_observed_at,last_sync_at,updated_at)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(device_id) DO UPDATE SET
           connection_state=COALESCE(?,device_status.connection_state),
           battery_percent=CASE WHEN ? IS NOT NULL AND (device_status.battery_observed_at IS NULL OR ?>device_status.battery_observed_at) THEN ? ELSE device_status.battery_percent END,
           battery_observed_at=CASE WHEN ? IS NOT NULL AND (device_status.battery_observed_at IS NULL OR ?>device_status.battery_observed_at) THEN ? ELSE device_status.battery_observed_at END,
           last_sync_at=?, updated_at=?`,
        device.id,
        p.tenantId,
        lc?.value ?? 'unknown',
        lb?.value ?? null,
        lb?.at ?? null,
        nowIso,
        nowIso,
        lc?.value ?? null,
        lb?.at ?? null,
        lb?.at ?? null,
        lb?.value ?? null,
        lb?.at ?? null,
        lb?.at ?? null,
        lb?.at ?? null,
        nowIso,
        nowIso,
      ),
      stmt(env.DB, 'UPDATE devices SET last_seen_at=?, updated_at=? WHERE id=?', nowIso, nowIso, device.id),
    );
    await env.DB.batch(side);
  }

  if (accepted.length > 0) {
    await env.INGEST_QUEUE.send({
      kind: 'telemetry.batch_ingested',
      event_id: `ing_${device.id}_${batch.batch_id}`,
      tenant_id: p.tenantId,
      owner_user_id: p.userId,
      device_id: device.id,
      reading_ids: accepted,
    });
  }
  return { batch_id: batch.batch_id, accepted, duplicates, rejected, server_time: nowIso };
}

const AGG_KINDS: ReadonlySet<TelemetryKind> = new Set(['heart_rate_bpm', 'steps_delta', 'battery_percent']);
const AGG_BUCKETS = [3600, 86400] as const;

/**
 * Recalcula (idempotente) os agregados dos buckets afetados por um lote ingerido — seguro sob
 * entrega at-least-once e reprocessamento.
 */
export async function recomputeAggregates(
  env: Env,
  tenantId: string,
  deviceId: string,
  readingIds: readonly string[],
): Promise<number> {
  if (readingIds.length === 0) return 0;
  const touched = new Map<string, { kind: TelemetryKind; start: string; size: number }>();
  for (let i = 0; i < readingIds.length; i += 50) {
    const chunk = readingIds.slice(i, i + 50);
    const rows = await all<{ kind: TelemetryKind; observed_at: string }>(
      env.DB,
      `SELECT kind,observed_at FROM telemetry_readings WHERE tenant_id=? AND source_id=? AND reading_id IN (${chunk.map(() => '?').join(',')})`,
      tenantId,
      deviceId,
      ...chunk,
    );
    for (const r of rows) {
      if (!AGG_KINDS.has(r.kind)) continue;
      for (const size of AGG_BUCKETS) {
        const start = bucketStart(r.observed_at, size);
        touched.set(`${r.kind}|${size}|${start}`, { kind: r.kind, start, size });
      }
    }
  }
  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  for (const t of touched.values()) {
    const end = new Date(new Date(t.start).getTime() + t.size * 1000).toISOString();
    const agg = await first<{
      n: number;
      mn: number | null;
      mx: number | null;
      av: number | null;
      sm: number | null;
      est: number;
    }>(
      env.DB,
      `SELECT COUNT(*) n, MIN(value_num) mn, MAX(value_num) mx, AVG(value_num) av, SUM(value_num) sm,
              SUM(CASE WHEN quality='estimated' THEN 1 ELSE 0 END) est
         FROM telemetry_readings WHERE tenant_id=? AND device_id=? AND kind=? AND observed_at>=? AND observed_at<?
          AND quality IN ('measured','estimated') AND value_num IS NOT NULL`,
      tenantId,
      deviceId,
      t.kind,
      t.start,
      end,
    );
    if (!agg || agg.n === 0) continue;
    stmts.push(
      stmt(
        env.DB,
        `INSERT INTO telemetry_aggregates(id,tenant_id,device_id,kind,bucket_start,bucket_size_s,quality,count,value_min,value_max,value_avg,value_sum,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(tenant_id,device_id,kind,bucket_start,bucket_size_s) DO UPDATE SET
           quality=excluded.quality,count=excluded.count,value_min=excluded.value_min,value_max=excluded.value_max,
           value_avg=excluded.value_avg,value_sum=excluded.value_sum,updated_at=excluded.updated_at`,
        newId('agg'),
        tenantId,
        deviceId,
        t.kind,
        t.start,
        t.size,
        agg.est > 0 ? 'estimated' : 'measured',
        agg.n,
        agg.mn,
        agg.mx,
        agg.av,
        agg.sm,
        nowIso,
      ),
    );
  }
  if (stmts.length > 0) await env.DB.batch(stmts);
  return stmts.length;
}

/** Limites de idade para marcar um dado como desatualizado (RF-01, T020). */
export const STALE_AFTER_MS: Record<TelemetryKind, number> = {
  heart_rate_bpm: 60 * 60_000,
  steps_delta: 60 * 60_000,
  steps_total: 60 * 60_000,
  sleep_interval: 36 * 3600_000,
  activity: 24 * 3600_000,
  battery_percent: 6 * 3600_000,
  connection_state: 15 * 60_000,
};
