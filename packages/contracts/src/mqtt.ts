import { z } from 'zod';
import { IsoDateTime } from './common';

/** contracts/schemas/mqtt-command.schema.json */
export const MqttCommand = z.strictObject({
  v: z.literal(1),
  command_id: z.string(),
  session_id: z.string(),
  equipment_id: z.string(),
  seq: z.number().int().min(0),
  action: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  idempotency_key: z.string(),
  expires_at: IsoDateTime,
  max_duration_ms: z.number().int().min(1).max(30000).optional(),
});
export type MqttCommand = z.infer<typeof MqttCommand>;

export const MqttAck = z.strictObject({
  v: z.literal(1),
  command_id: z.string(),
  equipment_id: z.string(),
  ack: z.enum(['ACK_ACCEPTED', 'ACK_EXECUTED', 'ACK_REJECTED']),
  code: z.string().max(60).optional(),
  state_version: z.number().int().min(0).optional(),
  uptime_ms: z.number().int().min(0).optional(),
});
export type MqttAck = z.infer<typeof MqttAck>;

export const MqttStatus = z.strictObject({
  v: z.literal(1),
  equipment_id: z.string(),
  online: z.boolean(),
  armed: z.boolean().optional(),
  outputs: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
  firmware: z.string().max(40).optional(),
});

const SEGMENT = /^[A-Za-z0-9_-]{3,100}$/;

/** Tópicos pulse/v1/{tenant}/{equipment}/{kind} (docs/08). Segmentos validados — nunca curingas. */
export function mqttTopic(
  tenantId: string,
  equipmentId: string,
  kind: 'status' | 'cmd' | 'ack' | 'telemetry',
): string {
  if (!SEGMENT.test(tenantId) || !SEGMENT.test(equipmentId)) {
    throw new Error('segmento de tópico inválido');
  }
  return `pulse/v1/${tenantId}/${equipmentId}/${kind}`;
}

export function parseMqttTopic(
  topic: string,
): { tenantId: string; equipmentId: string; kind: 'status' | 'cmd' | 'ack' | 'telemetry' } | null {
  const parts = topic.split('/');
  if (parts.length !== 5 || parts[0] !== 'pulse' || parts[1] !== 'v1') return null;
  const [, , tenantId, equipmentId, kind] = parts as [string, string, string, string, string];
  if (!SEGMENT.test(tenantId) || !SEGMENT.test(equipmentId)) return null;
  if (kind !== 'status' && kind !== 'cmd' && kind !== 'ack' && kind !== 'telemetry') return null;
  return { tenantId, equipmentId, kind };
}
