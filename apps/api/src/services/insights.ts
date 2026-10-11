import { baseline, confidenceFrom, newId, pearson, zScoreOutliers } from '@pulse/core';
import type { Env } from '../env';
import { all, first, run } from '../lib/db';
import { dailySeries, describeTrend, summarizeSleep } from './health';

export const INSIGHT_MODEL_VERSION = 'pulse-insights-stat-1.0';

export interface InsightDto {
  id: string;
  kind: string;
  model_version: string;
  input_window: { from: string; to: string; kinds: string[] };
  confidence: number;
  quality: string;
  quality_flags: string[];
  explanation: string;
  sources: string[];
  generated_at: string;
}

/** InsightPipeline determinístico (F219–F229, F244–F245): sem LLM, com fontes, qualidade e confiança. */
export async function generateInsights(
  env: Env,
  tenantId: string,
  userId: string,
  days = 30,
): Promise<InsightDto[]> {
  const u = await first<{ timezone: string }>(env.DB, 'SELECT timezone FROM users WHERE id=?', userId);
  const tz = u?.timezone ?? 'America/Sao_Paulo';
  const to = new Date();
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
  const sleepRows = devs.length
    ? await all<{ start_at: string; end_at: string; stage: string; quality: string }>(
        env.DB,
        `SELECT start_at,end_at,stage,quality FROM sleep_intervals WHERE tenant_id=? AND device_id IN (${devs.map(() => '?').join(',')}) AND end_at>=?`,
        tenantId,
        ...devs,
        from.toISOString(),
      )
    : [];
  const sleep = summarizeSleep(sleepRows, tz);
  const win = { from: from.toISOString(), to: to.toISOString() };
  const out: Omit<InsightDto, 'id' | 'generated_at' | 'model_version'>[] = [];

  const hrT = describeTrend('heart_rate_bpm', hr, days, 'Frequência cardíaca média', 'bpm');
  out.push({
    kind: 'trend.heart_rate',
    input_window: { ...win, kinds: ['heart_rate_bpm'] },
    confidence: hrT.confidence,
    quality: hrT.quality_flags.length ? 'limited' : 'adequate',
    quality_flags: hrT.quality_flags,
    explanation: hrT.explanation,
    sources: [`telemetry_readings:heart_rate_bpm:${hr.length}d`],
  });
  const stT = describeTrend('steps_delta', steps, days, 'Passos diários', 'passos');
  out.push({
    kind: 'trend.steps',
    input_window: { ...win, kinds: ['steps_delta'] },
    confidence: stT.confidence,
    quality: stT.quality_flags.length ? 'limited' : 'adequate',
    quality_flags: stT.quality_flags,
    explanation: stT.explanation,
    sources: [`telemetry_readings:steps_delta:${steps.length}d`],
  });

  const b = baseline(hr.map((p) => p.value));
  if (b && b.n >= 10) {
    const outliers = zScoreOutliers(
      hr.map((p) => ({ ...p, value: p.value })),
      b,
      2.5,
    );
    out.push({
      kind: 'anomaly.heart_rate_days',
      input_window: { ...win, kinds: ['heart_rate_bpm'] },
      confidence: Math.round(confidenceFrom(b.n, 10) * 100) / 100,
      quality: 'adequate',
      quality_flags: [],
      explanation: outliers.length
        ? `${outliers.length} dia(s) com média de FC fora do seu padrão habitual (${outliers.map((o) => o.day).join(', ')}). Pode refletir atividade, sono ou uso da pulseira; não é diagnóstico.`
        : 'Nenhum dia com média de FC fora do seu padrão habitual.',
      sources: [`baseline:n=${b.n}`],
    });
  }
  if (sleep.nights.length >= 5) {
    out.push({
      kind: 'regularity.sleep',
      input_window: { ...win, kinds: ['sleep_interval'] },
      confidence: Math.round(confidenceFrom(sleep.nights.length, 5) * 100) / 100,
      quality: 'estimated',
      quality_flags: ['device_estimated_stages'],
      explanation: `Sono médio de ${Math.floor((sleep.avg_duration_min ?? 0) / 60)}h${String((sleep.avg_duration_min ?? 0) % 60).padStart(2, '0')}; horário de início varia cerca de ${sleep.onset_spread_min ?? '?'} min entre noites.${sleep.atypical_nights.length ? ` Noites atípicas: ${sleep.atypical_nights.join(', ')}.` : ''}`,
      sources: [`sleep_intervals:${sleep.nights.length} noites`],
    });
  }
  const paired = sleep.nights
    .map((n) => ({ dur: n.duration_min, steps: steps.find((s) => s.day === n.night)?.value }))
    .filter((x): x is { dur: number; steps: number } => x.steps !== undefined);
  const r = pearson(
    paired.map((x) => x.dur),
    paired.map((x) => x.steps),
  );
  if (r !== null && paired.length >= 7) {
    out.push({
      kind: 'correlation.sleep_steps',
      input_window: { ...win, kinds: ['sleep_interval', 'steps_delta'] },
      confidence: Math.round(Math.abs(r) * confidenceFrom(paired.length, 7) * 100) / 100,
      quality: 'estimated',
      quality_flags: ['correlation_not_causation'],
      explanation: `Correlação ${Math.abs(r) < 0.3 ? 'fraca' : Math.abs(r) < 0.6 ? 'moderada' : 'forte'} (r=${r.toFixed(2)}) entre duração do sono e passos do dia seguinte. Correlação não indica causa.`,
      sources: [`pares:${paired.length}`],
    });
  }
  const coverage = hr.length / days;
  if (coverage < 0.5)
    out.push({
      kind: 'data_quality.coverage',
      input_window: { ...win, kinds: ['heart_rate_bpm'] },
      confidence: 1,
      quality: 'limited',
      quality_flags: ['low_coverage'],
      explanation: `Dados de FC em apenas ${hr.length} de ${days} dias; mantenha a pulseira conectada para análises mais confiáveis.`,
      sources: [],
    });

  const now = new Date().toISOString();
  const saved: InsightDto[] = [];
  for (const i of out) {
    const id = newId('ins');
    await run(
      env.DB,
      `INSERT INTO ai_insights(id,tenant_id,owner_user_id,device_id,kind,model_version,input_window_json,quality,explanation,created_at,confidence,quality_flags_json,sources_json) VALUES(?,?,?,NULL,?,?,?,?,?,?,?,?,?)`,
      id,
      tenantId,
      userId,
      i.kind,
      INSIGHT_MODEL_VERSION,
      JSON.stringify(i.input_window),
      i.quality,
      i.explanation,
      now,
      i.confidence,
      JSON.stringify(i.quality_flags),
      JSON.stringify(i.sources),
    );
    saved.push({ ...i, id, model_version: INSIGHT_MODEL_VERSION, generated_at: now });
  }
  return saved;
}
