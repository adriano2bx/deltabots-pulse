import { z } from 'zod';
import { Id, IsoDateTime } from './common';
import { ConsentPurpose } from './consent';

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM');
const Weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

/** Gatilhos enumerados (docs/14-AUTOMATIONS.md). Nada de expressões livres. */
export const Trigger = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('heart_rate_threshold'),
    above: z.number().int().min(30).max(240).optional(),
    below: z.number().int().min(25).max(200).optional(),
    sustain_s: z.number().int().min(0).max(3600).default(60),
    hysteresis_bpm: z.number().int().min(0).max(30).default(5),
  }),
  z.strictObject({
    kind: z.literal('steps_delta'),
    min_steps: z.number().int().min(1).max(100000),
    window_minutes: z.number().int().min(5).max(1440),
  }),
  z.strictObject({ kind: z.literal('inactivity_duration'), minutes: z.number().int().min(15).max(1440) }),
  z.strictObject({ kind: z.literal('sleep_started') }),
  z.strictObject({ kind: z.literal('sleep_ended') }),
  z.strictObject({ kind: z.literal('device_connected'), device_id: Id.optional() }),
  z.strictObject({
    kind: z.literal('device_disconnected'),
    device_id: Id.optional(),
    grace_minutes: z.number().int().min(0).max(1440).default(10),
  }),
  z.strictObject({ kind: z.literal('sync_stale'), minutes: z.number().int().min(15).max(10080) }),
  z.strictObject({ kind: z.literal('battery_low'), below_percent: z.number().int().min(1).max(50) }),
  z.strictObject({ kind: z.literal('gateway_online') }),
  z.strictObject({
    kind: z.literal('gateway_offline'),
    grace_minutes: z.number().int().min(0).max(1440).default(10),
  }),
  z.strictObject({
    kind: z.literal('cron_schedule'),
    /** Cron de 5 campos interpretado no fuso IANA da regra. */
    cron: z.string().regex(/^(\S+\s+){4}\S+$/),
    timezone: z.string(),
  }),
  z.strictObject({
    kind: z.literal('time_window'),
    start: HHMM,
    end: HHMM,
    days: z.array(Weekday).min(1).max(7),
    timezone: z.string(),
  }),
  z.strictObject({
    kind: z.literal('gesture_detected'),
    gesture: z.string().min(2).max(40),
    min_confidence: z.number().min(0.5).max(1).default(0.95),
  }),
  z.strictObject({
    kind: z.literal('alert_created'),
    severity: z.enum(['info', 'warning', 'critical']).optional(),
  }),
  z.strictObject({ kind: z.literal('report_generated') }),
  z.strictObject({ kind: z.literal('external_webhook_received'), integration_id: Id }),
]);
export type Trigger = z.infer<typeof Trigger>;
export type TriggerKind = Trigger['kind'];

export const ConditionField = z.enum([
  'quality',
  'time_local',
  'weekday',
  'value',
  'heart_rate_bpm',
  'steps_today',
  'battery_percent',
  'device_connected',
  'consent_active',
  'minutes_since_last_sync',
]);
export const ConditionOp = z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in']);

export const ConditionLeaf = z.strictObject({
  field: ConditionField,
  op: ConditionOp,
  value: z.union([
    z.string().max(100),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string().max(100), z.number()])).max(20),
  ]),
});
export type ConditionLeaf = z.infer<typeof ConditionLeaf>;

export type ConditionGroup = { op: 'and' | 'or'; rules: Array<ConditionLeaf | ConditionGroup> };
export const ConditionGroup: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.strictObject({
    op: z.enum(['and', 'or']),
    rules: z
      .array(z.union([ConditionLeaf, ConditionGroup]))
      .min(1)
      .max(20),
  }),
);

export const Action = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('send_push'),
    target: z.enum(['owner']),
    template_id: z.string().min(2).max(60),
  }),
  z.strictObject({
    type: z.literal('send_email'),
    target: z.enum(['owner']),
    template_id: z.string().min(2).max(60),
  }),
  z.strictObject({ type: z.literal('send_signed_webhook'), webhook_id: Id }),
  z.strictObject({ type: z.literal('notify_family_if_granted'), template_id: z.string().min(2).max(60) }),
  z.strictObject({ type: z.literal('create_checkin'), kind: z.enum(['wellbeing', 'safety']) }),
  z.strictObject({ type: z.literal('generate_report'), period: z.enum(['daily', 'weekly', 'monthly']) }),
  z.strictObject({
    type: z.literal('schedule_reminder'),
    delay_minutes: z.number().int().min(1).max(10080),
    template_id: z.string().min(2).max(60),
  }),
  z.strictObject({
    type: z.literal('call_mcp_allowlisted'),
    tool: z.string().regex(/^pulse\.[a-z_.]+$/),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
  z.strictObject({ type: z.literal('propose_jev_decision'), context: z.string().max(200) }),
  z.strictObject({
    type: z.literal('request_control_approval'),
    equipment_id: Id,
    action: z.string().max(60),
  }),
  z.strictObject({
    type: z.literal('control_discrete_when_armed'),
    equipment_id: Id,
    action: z.string().max(60),
    arguments: z.record(z.string(), z.unknown()).default({}),
  }),
  z.strictObject({
    type: z.literal('vibrate_band'),
    device_id: Id,
    pattern: z.enum(['short', 'long', 'double']),
  }),
  z.strictObject({
    type: z.literal('export_data'),
    kind: z.enum(['telemetry_csv', 'telemetry_json', 'full_json']),
  }),
]);
export type Action = z.infer<typeof Action>;
export type ActionType = Action['type'];

export const RiskLevel = z.enum(['low', 'medium', 'high']);

export const AutomationAst = z.strictObject({
  v: z.literal(1),
  title: z.string().trim().min(2).max(80),
  enabled: z.boolean(),
  trigger: Trigger,
  conditions: ConditionGroup.optional(),
  actions: z.array(Action).min(1).max(5),
  cooldown_ms: z
    .number()
    .int()
    .min(0)
    .max(7 * 86400000)
    .default(0),
  max_executions_per_day: z.number().int().min(1).max(100).optional(),
  consent_scopes: z.array(ConsentPurpose).max(5).default([]),
  expires_at: IsoDateTime.optional(),
});
export type AutomationAst = z.infer<typeof AutomationAst>;

export const Automation = z.object({
  id: Id,
  title: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  risk_level: RiskLevel,
  ast: AutomationAst,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export type Automation = z.infer<typeof Automation>;

export const UpdateAutomationRequest = z.strictObject({
  enabled: z.boolean().optional(),
  ast: AutomationAst.optional(),
  expected_version: z.number().int().min(1),
});

export const SimulateRequest = z.strictObject({
  days: z.union([z.literal(7), z.literal(30)]).default(7),
  source: z.enum(['history', 'synthetic']).default('history'),
});

export const RunStatus = z.enum([
  'pending',
  'running',
  'completed',
  'rejected',
  'failed',
  'expired',
  'cancelled',
  'simulated',
]);
export const AutomationRun = z.object({
  id: Id,
  automation_id: Id,
  source_event_id: z.string(),
  rule_version: z.number().int(),
  status: RunStatus,
  started_at: IsoDateTime,
  finished_at: IsoDateTime.nullable(),
  error_code: z.string().nullable(),
  explanation: z.string(),
});
export type AutomationRun = z.infer<typeof AutomationRun>;
