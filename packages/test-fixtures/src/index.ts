/**
 * Fixtures sintéticas para testes. TODO dado aqui é ROTULADO como sintético e nunca é
 * exibido como telemetria real (docs/CLAUDE.md, regra 9).
 */
export const SYNTHETIC_SOURCE = 'synthetic_fixture';

/** Gerador determinístico (mulberry32) para fixtures reprodutíveis por seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticHeartRate {
  reading_id: string;
  kind: 'heart_rate_bpm';
  observed_at: string;
  value: number;
  unit: 'bpm';
  quality: 'measured';
  source: typeof SYNTHETIC_SOURCE;
}

/** Série sintética de FC com ritmo circadiano simples. */
export function syntheticHeartRateSeries(opts: {
  start: Date;
  minutes: number;
  everyMinutes?: number;
  seed?: number;
}): SyntheticHeartRate[] {
  const rnd = seededRandom(opts.seed ?? 42);
  const step = opts.everyMinutes ?? 5;
  const out: SyntheticHeartRate[] = [];
  for (let m = 0; m < opts.minutes; m += step) {
    const t = new Date(opts.start.getTime() + m * 60000);
    const hour = t.getUTCHours();
    const base = hour >= 3 && hour < 9 ? 58 : 72;
    out.push({
      reading_id: `syn_hr_${opts.seed ?? 42}_${m}`,
      kind: 'heart_rate_bpm',
      observed_at: t.toISOString(),
      value: Math.round(base + (rnd() - 0.5) * 16),
      unit: 'bpm',
      quality: 'measured',
      source: SYNTHETIC_SOURCE,
    });
  }
  return out;
}
