import type {
  Action,
  AutomationAst,
  ConditionGroup,
  ConditionLeaf,
  ConsentPurpose,
  Quality,
  Trigger,
} from '@pulse/contracts';
import { cronMatches, inTimeWindow, localParts, parseCron } from '../time';

export type AutomationEventKind =
  | 'telemetry'
  | 'tick'
  | 'sleep_started'
  | 'sleep_ended'
  | 'device_connected'
  | 'device_disconnected'
  | 'gateway_online'
  | 'gateway_offline'
  | 'gesture'
  | 'alert_created'
  | 'report_generated'
  | 'webhook';

export interface AutomationEvent {
  id: string;
  kind: AutomationEventKind;
  at: string;
  deviceId?: string;
  telemetryKind?: string;
  value?: number;
  quality?: Quality;
  gesture?: string;
  confidence?: number;
  severity?: 'info' | 'warning' | 'critical';
  integrationId?: string;
  /** Minutos desde a desconexão (device/gateway). */
  offlineMinutes?: number;
}

export interface EvalContext {
  timezone: string;
  heartRateBpm?: number;
  /** Leituras de FC (mais recentes) usadas para sustentação do limiar. */
  recentHeartRates?: ReadonlyArray<{ at: string; bpm: number }>;
  stepsToday?: number;
  stepsInWindow?: number;
  batteryPercent?: number;
  deviceConnected?: boolean;
  activeConsents: ReadonlySet<ConsentPurpose>;
  minutesSinceLastSync?: number;
  lastActivityAt?: string;
  /** Último estado do limiar para histerese. */
  previouslyAboveThreshold?: boolean;
}

export interface Match {
  matched: boolean;
  explanation: string;
}

const yes = (explanation: string): Match => ({ matched: true, explanation });
const no = (explanation: string): Match => ({ matched: false, explanation });

export function matchTrigger(t: Trigger, e: AutomationEvent, ctx: EvalContext): Match {
  const at = new Date(e.at);
  switch (t.kind) {
    case 'heart_rate_threshold': {
      if (e.kind !== 'telemetry' || e.telemetryKind !== 'heart_rate_bpm' || e.value === undefined) {
        return no('evento não é leitura de FC');
      }
      if (e.quality === 'invalid' || e.quality === 'stale')
        return no('leitura de FC com qualidade insuficiente');
      const window = (ctx.recentHeartRates ?? []).filter(
        (r) => at.getTime() - new Date(r.at).getTime() <= t.sustain_s * 1000 && new Date(r.at) <= at,
      );
      const series = window.length > 0 ? window.map((r) => r.bpm) : [e.value];
      if (t.above !== undefined) {
        if (ctx.previouslyAboveThreshold && e.value > t.above - t.hysteresis_bpm) {
          return no('ainda acima do limiar (histerese); aguardando retorno');
        }
        if (series.every((b) => b > t.above!)) return yes(`FC acima de ${t.above} bpm por ${t.sustain_s}s`);
      }
      if (t.below !== undefined && series.every((b) => b < t.below!)) {
        return yes(`FC abaixo de ${t.below} bpm por ${t.sustain_s}s`);
      }
      return no('FC dentro dos limites configurados');
    }
    case 'steps_delta':
      if (ctx.stepsInWindow === undefined) return no('sem dados de passos na janela');
      return ctx.stepsInWindow >= t.min_steps
        ? yes(`${ctx.stepsInWindow} passos em ${t.window_minutes} min`)
        : no(`apenas ${ctx.stepsInWindow} passos em ${t.window_minutes} min`);
    case 'inactivity_duration': {
      if (e.kind !== 'tick') return no('avaliado apenas no agendador');
      if (!ctx.lastActivityAt) return no('sem registro de atividade — não presumir inatividade');
      const idle = (at.getTime() - new Date(ctx.lastActivityAt).getTime()) / 60000;
      return idle >= t.minutes
        ? yes(`sem atividade há ${Math.floor(idle)} min`)
        : no(`ativo há ${Math.floor(idle)} min`);
    }
    case 'sleep_started':
      return e.kind === 'sleep_started' ? yes('início de sono verificado') : no('evento diferente');
    case 'sleep_ended':
      return e.kind === 'sleep_ended' ? yes('fim de sono verificado') : no('evento diferente');
    case 'device_connected':
      if (e.kind !== 'device_connected') return no('evento diferente');
      if (t.device_id && t.device_id !== e.deviceId) return no('outro dispositivo');
      return yes('dispositivo conectado');
    case 'device_disconnected':
      if (e.kind !== 'device_disconnected') return no('evento diferente');
      if (t.device_id && t.device_id !== e.deviceId) return no('outro dispositivo');
      return (e.offlineMinutes ?? 0) >= t.grace_minutes
        ? yes(`dispositivo desconectado há ${e.offlineMinutes ?? 0} min`)
        : no('dentro da tolerância de desconexão');
    case 'sync_stale':
      if (e.kind !== 'tick') return no('avaliado apenas no agendador');
      if (ctx.minutesSinceLastSync === undefined) return no('sem registro de sincronização');
      return ctx.minutesSinceLastSync >= t.minutes
        ? yes(`sincronização atrasada há ${ctx.minutesSinceLastSync} min`)
        : no('sincronização em dia');
    case 'battery_low':
      if (e.kind !== 'telemetry' || e.telemetryKind !== 'battery_percent' || e.value === undefined)
        return no('evento não é bateria');
      return e.value < t.below_percent ? yes(`bateria em ${e.value}%`) : no(`bateria em ${e.value}%`);
    case 'gateway_online':
      return e.kind === 'gateway_online' ? yes('gateway voltou a ficar online') : no('evento diferente');
    case 'gateway_offline':
      return e.kind === 'gateway_offline' && (e.offlineMinutes ?? 0) >= t.grace_minutes
        ? yes(`gateway offline há ${e.offlineMinutes ?? 0} min`)
        : no('gateway dentro da tolerância');
    case 'cron_schedule':
      if (e.kind !== 'tick') return no('avaliado apenas no agendador');
      return cronMatches(parseCron(t.cron), at, t.timezone)
        ? yes(`agenda "${t.cron}" (${t.timezone})`)
        : no('fora da agenda');
    case 'time_window': {
      if (e.kind !== 'tick') return no('avaliado apenas no agendador');
      const p = localParts(at, t.timezone);
      return t.days.includes(p.weekday) && p.hhmm === t.start
        ? yes(`início da janela ${t.start}–${t.end} (${t.timezone})`)
        : no('fora do início da janela');
    }
    case 'gesture_detected':
      if (e.kind !== 'gesture' || e.gesture !== t.gesture) return no('gesto diferente');
      return (e.confidence ?? 0) >= t.min_confidence
        ? yes(`gesto ${t.gesture} com confiança ${(e.confidence ?? 0).toFixed(2)}`)
        : no('confiança abaixo do mínimo');
    case 'alert_created':
      if (e.kind !== 'alert_created') return no('evento diferente');
      return !t.severity || t.severity === e.severity ? yes('alerta criado') : no('severidade diferente');
    case 'report_generated':
      return e.kind === 'report_generated' ? yes('relatório gerado') : no('evento diferente');
    case 'external_webhook_received':
      return e.kind === 'webhook' && e.integrationId === t.integration_id
        ? yes('webhook autenticado recebido')
        : no('outra origem');
  }
}

function fieldValue(leaf: ConditionLeaf, e: AutomationEvent, ctx: EvalContext): unknown {
  const at = new Date(e.at);
  switch (leaf.field) {
    case 'quality':
      return e.quality;
    case 'time_local':
      return localParts(at, ctx.timezone).hhmm;
    case 'weekday':
      return localParts(at, ctx.timezone).weekday;
    case 'value':
      return e.value;
    case 'heart_rate_bpm':
      return ctx.heartRateBpm;
    case 'steps_today':
      return ctx.stepsToday;
    case 'battery_percent':
      return ctx.batteryPercent;
    case 'device_connected':
      return ctx.deviceConnected;
    case 'consent_active':
      return typeof leaf.value === 'string'
        ? ctx.activeConsents.has(leaf.value as ConsentPurpose)
        : undefined;
    case 'minutes_since_last_sync':
      return ctx.minutesSinceLastSync;
  }
}

function compare(
  op: ConditionLeaf['op'],
  actual: unknown,
  expected: ConditionLeaf['value'],
  field: ConditionLeaf['field'],
): boolean {
  if (field === 'consent_active')
    return op === 'eq' ? actual === true : op === 'neq' ? actual !== true : false;
  if (field === 'quality' && expected === 'valid') {
    const valid = actual === 'measured' || actual === 'estimated';
    return op === 'eq' ? valid : op === 'neq' ? !valid : false;
  }
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'between': {
      if (!Array.isArray(expected) || expected.length !== 2) return false;
      const [lo, hi] = expected as [string | number, string | number];
      if (field === 'time_local' && typeof actual === 'string')
        return inTimeWindow(actual, String(lo), String(hi));
      return typeof actual === 'number' && actual >= Number(lo) && actual <= Number(hi);
    }
    case 'in':
      return (
        Array.isArray(expected) && (expected as Array<string | number>).includes(actual as string | number)
      );
  }
}

export function evaluateConditions(
  group: ConditionGroup | undefined,
  e: AutomationEvent,
  ctx: EvalContext,
): Match {
  if (!group) return yes('sem condições');
  const results = group.rules.map((rule) => {
    if ('field' in rule) {
      const actual = fieldValue(rule, e, ctx);
      if (actual === undefined) return no(`dado ausente para ${rule.field} — condição falsa por segurança`);
      const ok = compare(rule.op, actual, rule.value, rule.field);
      return ok
        ? yes(`${rule.field} ${rule.op} ${JSON.stringify(rule.value)}`)
        : no(`${rule.field} não satisfaz ${rule.op} ${JSON.stringify(rule.value)}`);
    }
    return evaluateConditions(rule, e, ctx);
  });
  const matched = group.op === 'and' ? results.every((r) => r.matched) : results.some((r) => r.matched);
  return {
    matched,
    explanation: results.map((r) => r.explanation).join(group.op === 'and' ? ' E ' : ' OU '),
  };
}

export type RiskLevel = 'low' | 'medium' | 'high';

const ACTION_RISK: Record<Action['type'], RiskLevel> = {
  send_push: 'low',
  send_email: 'low',
  create_checkin: 'low',
  generate_report: 'low',
  schedule_reminder: 'low',
  send_signed_webhook: 'medium',
  notify_family_if_granted: 'medium',
  vibrate_band: 'medium',
  export_data: 'medium',
  propose_jev_decision: 'medium',
  call_mcp_allowlisted: 'medium',
  request_control_approval: 'medium',
  control_discrete_when_armed: 'high',
};

export function riskLevel(ast: AutomationAst): RiskLevel {
  const order: RiskLevel[] = ['low', 'medium', 'high'];
  let max = 0;
  for (const a of ast.actions) max = Math.max(max, order.indexOf(ACTION_RISK[a.type]));
  if (ast.trigger.kind === 'gesture_detected' && max < 2) max = Math.max(max, 1);
  return order[max] as RiskLevel;
}

/** Ações que exigem consentimento específico além do dono da regra. */
export function requiredConsents(ast: AutomationAst): ConsentPurpose[] {
  const set = new Set<ConsentPurpose>(ast.consent_scopes);
  for (const a of ast.actions) {
    if (a.type === 'notify_family_if_granted') set.add('family_sharing');
    if (a.type === 'propose_jev_decision' || a.type === 'call_mcp_allowlisted') set.add('ai_analysis');
  }
  if (ast.trigger.kind === 'heart_rate_threshold') set.add('health_processing');
  return [...set];
}

export function dedupeKey(automationId: string, eventId: string, version: number): string {
  return `${automationId}:${eventId}:${version}`;
}

export function cooldownActive(lastRunAt: string | null, cooldownMs: number, now: Date): boolean {
  return lastRunAt !== null && now.getTime() - new Date(lastRunAt).getTime() < cooldownMs;
}

export interface SimulationStep {
  eventId: string;
  at: string;
  outcome: 'would_run' | 'no_match' | 'conditions_false' | 'cooldown' | 'daily_limit' | 'expired';
  explanation: string;
  actions: Action['type'][];
}

/** Simulação determinística sem efeitos colaterais (F214). */
export function simulate(
  ast: AutomationAst,
  timeline: ReadonlyArray<{ event: AutomationEvent; ctx: EvalContext }>,
): SimulationStep[] {
  const steps: SimulationStep[] = [];
  let lastRun: string | null = null;
  const perDay = new Map<string, number>();
  for (const { event, ctx } of [...timeline].sort((a, b) => a.event.at.localeCompare(b.event.at))) {
    const base = { eventId: event.id, at: event.at, actions: [] as Action['type'][] };
    if (ast.expires_at && new Date(event.at) > new Date(ast.expires_at)) {
      steps.push({ ...base, outcome: 'expired', explanation: 'regra expirada' });
      continue;
    }
    const t = matchTrigger(ast.trigger, event, ctx);
    if (!t.matched) {
      steps.push({ ...base, outcome: 'no_match', explanation: t.explanation });
      continue;
    }
    const c = evaluateConditions(ast.conditions, event, ctx);
    if (!c.matched) {
      steps.push({ ...base, outcome: 'conditions_false', explanation: `${t.explanation}; ${c.explanation}` });
      continue;
    }
    if (cooldownActive(lastRun, ast.cooldown_ms, new Date(event.at))) {
      steps.push({ ...base, outcome: 'cooldown', explanation: `${t.explanation}; em cooldown` });
      continue;
    }
    const day = localParts(new Date(event.at), ctx.timezone).dateKey;
    const count = perDay.get(day) ?? 0;
    if (ast.max_executions_per_day !== undefined && count >= ast.max_executions_per_day) {
      steps.push({
        ...base,
        outcome: 'daily_limit',
        explanation: `${t.explanation}; limite diário atingido`,
      });
      continue;
    }
    perDay.set(day, count + 1);
    lastRun = event.at;
    steps.push({
      ...base,
      outcome: 'would_run',
      explanation: `${t.explanation}; ${c.explanation}`,
      actions: ast.actions.map((a) => a.type),
    });
  }
  return steps;
}
