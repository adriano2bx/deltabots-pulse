import { z } from 'zod';
import { Id, IsoDateTime } from './common';

export const RealtimeEventType = z.enum([
  'session.hello',
  'session.ready',
  'session.arm.request',
  'session.armed',
  'session.disarm',
  'session.revoked',
  'session.heartbeat',
  'session.status',
  'device.status',
  'telemetry.update',
  'gesture.sample_batch',
  'gesture.detected',
  'gesture.rejected',
  'control.command',
  'control.accepted',
  'control.executed',
  'control.failed',
  'control.expired',
  'command.ack',
  'policy.changed',
  'server.error',
  'rate_limited',
]);
export type RealtimeEventType = z.infer<typeof RealtimeEventType>;

/** Envelope normativo (contracts/schemas/ws-envelope.schema.json, additionalProperties:false). */
export const Envelope = z.strictObject({
  v: z.literal(1),
  id: z.string().min(5).max(100),
  type: RealtimeEventType,
  tenant_id: z.string().optional(),
  session_id: z.string(),
  device_id: z.string().optional(),
  gateway_id: z.string().optional(),
  seq: z.number().int().min(0),
  sent_at: IsoDateTime,
  expires_at: IsoDateTime.optional(),
  trace_id: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});
export type Envelope = z.infer<typeof Envelope>;

export const MAX_JSON_FRAME_BYTES = 16 * 1024;
export const MAX_LAB_BINARY_FRAME_BYTES = 64 * 1024;

export const GestureDetectedPayload = z.strictObject({
  gesture: z.string().min(2).max(40),
  confidence: z.number().min(0).max(1),
  model_version: z.string(),
  quality_flags: z.array(z.string()).optional(),
  capture_monotonic_ns: z.number().int().min(0).optional(),
});

export const HelloPayload = z.strictObject({
  role: z.enum(['android_gateway', 'console', 'equipment_gateway', 'mqtt_bridge']),
  last_event_id: z.string().optional(),
  app_version: z.string().max(40).optional(),
});

export const HeartbeatPayload = z.strictObject({
  gateway_send_monotonic_ns: z.number().int().min(0).optional(),
  ble_connected: z.boolean().optional(),
});

export const ArmRequestPayload = z.strictObject({ local_confirmation_id: z.string().min(8).max(100) });

export const ControlCommandPayload = z.strictObject({
  command_id: Id,
  capability: z.string().max(60).optional(),
  action: z.string().regex(/^[a-z_]{2,40}$/),
  arguments: z.record(z.string(), z.union([z.boolean(), z.number(), z.string().max(100)])).default({}),
  idempotency_key: z.string().min(8).max(100),
  expires_at: IsoDateTime,
  max_duration_ms: z.number().int().min(1).max(30000).optional(),
  expected_state_version: z.number().int().min(0).optional(),
  equipment_id: Id,
});

export const CommandAckPayload = z.strictObject({
  command_id: Id,
  ack: z.enum(['ACK_ACCEPTED', 'ACK_EXECUTED', 'ACK_REJECTED']),
  code: z.string().max(60).optional(),
  actuator_receive_ms: z.number().int().optional(),
  actuator_ack_ms: z.number().int().optional(),
  state_version: z.number().int().min(0).optional(),
});

export const TelemetryUpdatePayload = z.strictObject({
  kind: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string(),
  quality: z.string(),
  observed_at: IsoDateTime,
});

export const DeviceStatusPayload = z.strictObject({
  connection_state: z.enum(['connected', 'disconnected', 'unknown']),
  battery_percent: z.number().int().min(0).max(100).optional(),
  rssi_dbm: z.number().int().optional(),
});

export const SampleBatchPayload = z.strictObject({
  rate_hz: z.number().positive().max(200),
  axes: z.literal('xyz'),
  unit: z.literal('m/s2'),
  first_monotonic_ns: z.number().int().min(0),
  samples: z
    .array(z.tuple([z.number(), z.number(), z.number()]))
    .min(1)
    .max(400),
  crc32: z.number().int().min(0),
});

/** Validadores de payload por tipo que um cliente pode enviar. */
export const ClientPayloads: Partial<Record<RealtimeEventType, z.ZodType>> = {
  'session.hello': HelloPayload,
  'session.heartbeat': HeartbeatPayload,
  'session.arm.request': ArmRequestPayload,
  'session.disarm': z.strictObject({ reason: z.string().max(60).optional() }),
  'gesture.detected': GestureDetectedPayload,
  'gesture.rejected': z.strictObject({
    reason: z.string().max(60),
    confidence: z.number().min(0).max(1).optional(),
  }),
  'gesture.sample_batch': SampleBatchPayload,
  'control.command': ControlCommandPayload,
  'command.ack': CommandAckPayload,
  'telemetry.update': TelemetryUpdatePayload,
  'device.status': DeviceStatusPayload,
};

export const TicketRequest = z.strictObject({
  purpose: z.enum(['telemetry_view', 'control', 'equipment_gateway', 'mqtt_bridge']),
  control_session_id: Id.optional(),
  gateway_id: Id.optional(),
  equipment_id: Id.optional(),
});
export const WssTicket = z.object({ ticket: z.string(), expires_at: IsoDateTime, url: z.string() });
