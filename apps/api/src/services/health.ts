import {
  baseline,
  circularTimeStats,
  confidenceFrom,
  linearTrend,
  localParts,
  mean,
  percentChange,
} from '@pulse/core';
import { all } from '../lib/db';

export interface DailyPoint {
  day: string;
  value: number;
  count: number;
}

/** Série diária no fuso do titular para uma métrica numérica. */
export async function dailySeries(
  db: D1Database,
  tenantId: string,
  deviceIds: string[],
  kind: string,
  from: Date,
  to: Date,
  tz: string,
  mode: 'avg' | 'sum',
): Promise<DailyPoint[]> {
  if (deviceIds.length === 0) return [];
  const rows = await all<{ observed_at: string; value_num: number }>(
    db,
    `SELECT observed_at,value_num FROM telemetry_readings WHERE tenant_id=? AND device_id IN (${deviceIds.map(() => '?').join(',')}) AND kind=? AND observed_at>=? AND observed_at<? AND value_num IS NOT NULL AND quality IN ('measured','estimated') LIMIT 100000`,
    tenantId,
    ...deviceIds,
    kind,
    from.toISOString(),
    to.toISOString(),
  );
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const k = localParts(new Date(r.observed_at), tz).dateKey;
    const arr = byDay.get(k) ?? [];
    arr.push(r.value_num);
    byDay.set(k, arr);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, vals]) => ({
      day,
      count: vals.length,
      value: mode === 'sum' ? vals.reduce((a, b) => a + b, 0) : Math.round((mean(vals) as number) * 10) / 10,
    }));
}

export interface TrendResult {
  kind: string;
  window_days: number;
  points: DailyPoint[];
  current_avg: number | null;
  previous_avg: number | null;
  change_percent: number | null;
  slope_per_day: number | null;
  confidence: number;
  quality_flags: string[];
  explanation: string;
}

/** Tendência observacional não clínica (F22, F222, F224) com qualidade e confiança explícitas. */
export function describeTrend(
  kind: string,
  points: DailyPoint[],
  windowDays: number,
  label: string,
  unit: string,
): TrendResult {
  const half = Math.floor(points.length / 2);
  const prev = points.slice(0, half).map((p) => p.value);
  const cur = points.slice(half).map((p) => p.value);
  const flags: string[] = [];
  if (points.length < 7) flags.push('insufficient_days');
  const coverage = points.length / windowDays;
  if (coverage < 0.6) flags.push('low_coverage');
  const tr = linearTrend(points.map((p) => ({ at: `${p.day}T12:00:00Z`, value: p.value })));
  const change = percentChange(mean(prev), mean(cur));
  const confidence =
    Math.round(
      confidenceFrom(points.length, 7, tr ? Math.max(0.3, tr.r2) : 0.3) * Math.min(1, coverage) * 100,
    ) / 100;
  let explanation: string;
  if (flags.includes('insufficient_days'))
    explanation = `Ainda não há dias suficientes de ${label} para indicar tendência (${points.length} dia(s) com dados).`;
  else if (change === null || Math.abs(change) < 3)
    explanation = `${label} estável no período: média recente semelhante à anterior.`;
  else
    explanation = `${label} ${change > 0 ? 'maior' : 'menor'} em ${Math.abs(Math.round(change))}% na metade mais recente do período (média ${Math.round((mean(cur) as number) * 10) / 10} ${unit}). Observação de tendência, não avaliação médica.`;
  return {
    kind,
    window_days: windowDays,
    points,
    current_avg: mean(cur),
    previous_avg: mean(prev),
    change_percent: change === null ? null : Math.round(change * 10) / 10,
    slope_per_day: tr ? Math.round(tr.slopePerDay * 100) / 100 : null,
    confidence,
    quality_flags: flags,
    explanation,
  };
}

export interface SleepNight {
  night: string;
  start_at: string;
  end_at: string;
  duration_min: number;
  intervals: number;
  quality: string;
}

export function summarizeSleep(
  intervals: Array<{ start_at: string; end_at: string; stage: string; quality: string }>,
  tz: string,
): {
  nights: SleepNight[];
  avg_duration_min: number | null;
  onset_spread_min: number | null;
  atypical_nights: string[];
} {
  const nights = new Map<string, SleepNight>();
  for (const i of intervals) {
    if (i.stage === 'awake') continue;
    // A noite é atribuída à data local do fim do sono.
    const night = localParts(new Date(i.end_at), tz).dateKey;
    const dur = (new Date(i.end_at).getTime() - new Date(i.start_at).getTime()) / 60000;
    const n = nights.get(night);
    if (!n)
      nights.set(night, {
        night,
        start_at: i.start_at,
        end_at: i.end_at,
        duration_min: dur,
        intervals: 1,
        quality: i.quality,
      });
    else {
      n.start_at = i.start_at < n.start_at ? i.start_at : n.start_at;
      n.end_at = i.end_at > n.end_at ? i.end_at : n.end_at;
      n.duration_min += dur;
      n.intervals += 1;
      if (i.quality !== 'measured') n.quality = i.quality;
    }
  }
  const list = [...nights.values()]
    .sort((a, b) => a.night.localeCompare(b.night))
    .map((n) => ({ ...n, duration_min: Math.round(n.duration_min) }));
  const durs = list.map((n) => n.duration_min);
  const b = baseline(durs);
  const onset = circularTimeStats(
    list.map((n) => {
      const lp = localParts(new Date(n.start_at), tz);
      return lp.hour * 60 + lp.minute;
    }),
  );
  const atypical =
    b && b.std > 0
      ? list.filter((n) => Math.abs(n.duration_min - b.mean) / b.std >= 2).map((n) => n.night)
      : [];
  return {
    nights: list,
    avg_duration_min: mean(durs) === null ? null : Math.round(mean(durs) as number),
    onset_spread_min: onset ? Math.round(onset.spreadMinutes) : null,
    atypical_nights: atypical,
  };
}
