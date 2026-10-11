import { z } from 'zod';
import { Id, IsoDateTime } from './common';

export const SafetyClass = z.enum(['safe_demo', 'low_risk', 'safety_critical']);
export type SafetyClass = z.infer<typeof SafetyClass>;

export const EquipmentCapability = z.strictObject({
  action: z.string().regex(/^[a-z_]{2,40}$/),
  semantics: z.enum(['discrete', 'continuous', 'approval_required', 'non_actuating']),
  arguments_schema: z.record(z.string(), z.enum(['boolean', 'integer', 'number', 'string'])).default({}),
  idempotent: z.boolean().default(false),
});

export const Equipment = z.object({
  id: Id,
  kind: z.string(),
  display_name: z.string(),
  connector: z.enum(['WSS', 'MQTT']),
  safety_class: SafetyClass,
  capabilities: z.array(EquipmentCapability),
  watchdog_ms: z.number().int(),
  max_rate_hz: z.number().int(),
  status: z.enum(['online', 'offline', 'unknown']),
  last_seen_at: IsoDateTime.nullable(),
});
export type Equipment = z.infer<typeof Equipment>;

export const RegisterEquipmentRequest = z.strictObject({
  kind: z.string().min(2).max(40),
  display_name: z.string().min(1).max(80),
  connector: z.enum(['WSS', 'MQTT']),
  safety_class: SafetyClass,
  capabilities: z.array(EquipmentCapability).min(1).max(20),
  watchdog_ms: z.number().int().min(100).max(30000),
  max_rate_hz: z.number().int().min(1).max(50).default(10),
  gateway_id: Id.optional(),
});

export const ControlState = z.enum(['DISARMED', 'ARM_REQUESTED', 'ARMED', 'EXPIRED', 'FAULT']);
export type ControlState = z.infer<typeof ControlState>;

export const ControlSession = z.object({
  id: Id,
  equipment_id: Id,
  device_id: Id.nullable(),
  state: ControlState,
  policy_version: z.string(),
  armed_at: IsoDateTime.nullable(),
  expires_at: IsoDateTime,
  last_heartbeat_at: IsoDateTime.nullable(),
});
export type ControlSession = z.infer<typeof ControlSession>;

export const CreateControlSessionRequest = z.strictObject({
  equipment_id: Id,
  device_id: Id.optional(),
  ttl_s: z.number().int().min(30).max(3600).default(300),
});

export const ArmRequest = z.strictObject({
  /** Prova de interação local explícita no gateway (ex.: id do diálogo confirmado). */
  local_confirmation_id: z.string().min(8).max(100),
  arm_ttl_s: z.number().int().min(10).max(900).default(120),
});

export const ControlCommand = z.strictObject({
  command_id: Id,
  session_id: Id,
  equipment_id: Id,
  action: z.string().regex(/^[a-z_]{2,40}$/),
  arguments: z.record(z.string(), z.union([z.boolean(), z.number(), z.string().max(100)])).default({}),
  expires_at: IsoDateTime,
  idempotency_key: z.string().min(8).max(100),
  max_duration_ms: z.number().int().min(1).max(30000).optional(),
  expected_state_version: z.number().int().min(0).optional(),
});
export type ControlCommand = z.infer<typeof ControlCommand>;

export const CommandStatus = z.enum(['accepted', 'executed', 'failed', 'expired', 'rejected']);
export const CommandResult = z.object({
  command_id: Id,
  status: CommandStatus,
  code: z.string().nullable(),
  seq: z.number().int(),
  accepted_at: IsoDateTime,
  executed_at: IsoDateTime.nullable(),
});
export type CommandResult = z.infer<typeof CommandResult>;
