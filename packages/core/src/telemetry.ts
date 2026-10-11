import type { Quality, TelemetryKind, TelemetryReading } from '@pulse/contracts';

export const EXPECTED_UNIT: Record<TelemetryKind, string> = {
  heart_rate_bpm: 'bpm',
  steps_delta: 'steps',
  steps_total: 'steps',
  sleep_interval: 'interval',
  activity: 'activity',
  battery_percent: '%',
  connection_state: 'state',
};

/** Faixas plausíveis (não clínicas) para descartar leituras corrompidas. */
const RANGES: Partial<Record<TelemetryKind, [number, number]>> = {
  heart_rate_bpm: [25, 250],
  steps_delta: [0, 50000],
  steps_total: [0, 2_000_000],
  battery_percent: [0, 100],
};

export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const MAX_AGE_MS = 400 * 86400 * 1000;

export type RejectCode =
  'VALIDATION_ERROR' | 'UNIT_MISMATCH' | 'OUT_OF_RANGE' | 'FUTURE_TIMESTAMP' | 'TOO_OLD';

export interface NormalizedReading {
  readingId: string;
  kind: TelemetryKind;
  observedAt: string;
  valueNum: number | null;
  valueJson: string | null;
  unit: string;
  quality: Quality;
  source: string;
  firmware: string | null;
}

/** Valida e normaliza uma leitura; retorna código de rejeição em vez de lançar. */
export function normalizeReading(
  r: TelemetryReading,
  now: Date,
): { ok: NormalizedReading } | { reject: RejectCode } {
  if (r.unit !== EXPECTED_UNIT[r.kind]) return { reject: 'UNIT_MISMATCH' };
  const observed = new Date(r.observed_at);
  if (Number.isNaN(observed.getTime())) return { reject: 'VALIDATION_ERROR' };
  if (observed.getTime() - now.getTime() > MAX_FUTURE_SKEW_MS) return { reject: 'FUTURE_TIMESTAMP' };
  if (now.getTime() - observed.getTime() > MAX_AGE_MS) return { reject: 'TOO_OLD' };
  let valueNum: number | null = null;
  let valueJson: string | null = null;
  if (typeof r.value === 'number') {
    if (!Number.isFinite(r.value)) return { reject: 'VALIDATION_ERROR' };
    const range = RANGES[r.kind];
    if (range && (r.value < range[0] || r.value > range[1])) return { reject: 'OUT_OF_RANGE' };
    valueNum = r.value;
  } else if (r.kind === 'sleep_interval') {
    if (typeof r.value !== 'object') return { reject: 'VALIDATION_ERROR' };
    const v = r.value as Record<string, unknown>;
    const start = new Date(String(v.start_at));
    const end = new Date(String(v.end_at));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
      return { reject: 'VALIDATION_ERROR' };
    if (end.getTime() - start.getTime() > 24 * 3600 * 1000) return { reject: 'OUT_OF_RANGE' };
    valueJson = JSON.stringify({
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      stage: String(v.stage ?? 'unknown'),
    });
  } else if (typeof r.value === 'string') {
    if (r.kind === 'connection_state' && !['connected', 'disconnected'].includes(r.value)) {
      return { reject: 'VALIDATION_ERROR' };
    }
    valueJson = JSON.stringify(r.value);
  } else {
    valueJson = JSON.stringify(r.value);
  }
  return {
    ok: {
      readingId: r.reading_id,
      kind: r.kind,
      observedAt: observed.toISOString(),
      valueNum,
      valueJson,
      unit: r.unit,
      quality: r.quality,
      source: r.source,
      firmware: r.firmware ?? null,
    },
  };
}

/**
 * Converte contadores acumulados de passos em deltas, tratando reset (meia-noite da pulseira,
 * reboot) — quando o total diminui, o novo total é considerado o delta desde o reset (F162).
 */
export function stepsTotalsToDeltas(
  samples: ReadonlyArray<{ at: string; total: number }>,
): Array<{ at: string; delta: number; reset: boolean }> {
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  const out: Array<{ at: string; delta: number; reset: boolean }> = [];
  let prev: number | null = null;
  for (const s of sorted) {
    if (prev === null) {
      prev = s.total;
      continue;
    }
    if (s.total >= prev) out.push({ at: s.at, delta: s.total - prev, reset: false });
    else out.push({ at: s.at, delta: s.total, reset: true });
    prev = s.total;
  }
  return out;
}

export function bucketStart(iso: string, bucketS: number): string {
  const t = new Date(iso).getTime();
  return new Date(Math.floor(t / (bucketS * 1000)) * bucketS * 1000).toISOString();
}

/** Lacunas maiores que o intervalo esperado (F174). */
export function detectGaps(
  timestamps: readonly string[],
  expectedEveryS: number,
  tolerance = 2,
): Array<{ from: string; to: string }> {
  const ts = [...timestamps].sort();
  const gaps: Array<{ from: string; to: string }> = [];
  for (let i = 1; i < ts.length; i++) {
    const a = new Date(ts[i - 1] as string).getTime();
    const b = new Date(ts[i] as string).getTime();
    if (b - a > expectedEveryS * 1000 * tolerance)
      gaps.push({ from: ts[i - 1] as string, to: ts[i] as string });
  }
  return gaps;
}

export function isStale(lastObservedAt: string | null, now: Date, maxAgeMs: number): boolean {
  if (!lastObservedAt) return true;
  return now.getTime() - new Date(lastObservedAt).getTime() > maxAgeMs;
}
