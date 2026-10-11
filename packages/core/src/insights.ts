/**
 * Estatística descritiva determinística para insights NÃO clínicos (docs/13).
 * Nenhuma função aqui diagnostica; textos falam de tendências observacionais.
 */
export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function std(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function percentile(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (idx - lo);
}

export interface Baseline {
  mean: number;
  std: number;
  n: number;
}

export function baseline(xs: readonly number[]): Baseline | null {
  const m = mean(xs);
  const s = std(xs);
  if (m === null || s === null) return null;
  return { mean: m, std: s, n: xs.length };
}

export function zScoreOutliers<T extends { value: number }>(
  points: readonly T[],
  b: Baseline,
  threshold = 3,
): T[] {
  if (b.std === 0) return [];
  return points.filter((p) => Math.abs((p.value - b.mean) / b.std) >= threshold);
}

export interface Trend {
  slopePerDay: number;
  r2: number;
  n: number;
}

/** Regressão linear simples sobre (tempo em dias, valor). */
export function linearTrend(points: ReadonlyArray<{ at: string; value: number }>): Trend | null {
  if (points.length < 3) return null;
  const t0 = new Date(points[0]!.at).getTime();
  const xs = points.map((p) => (new Date(p.at).getTime() - t0) / 86400000);
  const ys = points.map((p) => p.value);
  const mx = mean(xs) as number;
  const my = mean(ys) as number;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slopePerDay: slope, r2, n: points.length };
}

export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = mean(xs) as number;
  const my = mean(ys) as number;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    dx += (xs[i]! - mx) ** 2;
    dy += (ys[i]! - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** Regularidade de horário (minutos do dia), com média circular para cruzar a meia-noite. */
export function circularTimeStats(
  minutesOfDay: readonly number[],
): { meanMinute: number; spreadMinutes: number } | null {
  if (minutesOfDay.length < 2) return null;
  let sx = 0;
  let sy = 0;
  for (const m of minutesOfDay) {
    const a = (m / 1440) * 2 * Math.PI;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  const n = minutesOfDay.length;
  const r = Math.sqrt(sx * sx + sy * sy) / n;
  let meanAngle = Math.atan2(sy / n, sx / n);
  if (meanAngle < 0) meanAngle += 2 * Math.PI;
  const circStd = Math.sqrt(-2 * Math.log(Math.max(r, 1e-9)));
  return { meanMinute: (meanAngle / (2 * Math.PI)) * 1440, spreadMinutes: (circStd / (2 * Math.PI)) * 1440 };
}

export function percentChange(before: number | null, after: number | null): number | null {
  if (before === null || after === null || before === 0) return null;
  return ((after - before) / Math.abs(before)) * 100;
}

/** Confiança heurística em [0,1] baseada em tamanho da amostra e ajuste. */
export function confidenceFrom(n: number, minN: number, fit = 1): number {
  if (n < minN) return 0;
  return Math.max(0, Math.min(1, (1 - minN / (n + minN)) * fit));
}
