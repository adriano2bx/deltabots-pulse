import type { RealtimeEventType, SafetyClass } from '@pulse/contracts';

export type ParticipantRole =
  'android_gateway' | 'console' | 'equipment_gateway' | 'mqtt_bridge' | 'family_viewer';

/** Claims derivadas pelo Worker a partir do ticket validado — o cliente nunca as fornece. */
export interface ParticipantClaims {
  role: ParticipantRole;
  tenantId: string;
  userId: string;
  sessionId: string;
  gatewayId?: string;
  equipmentId?: string;
  /** Métricas permitidas a um beneficiário (fan-out de telemetria). */
  metrics?: string[];
}

export interface Attachment extends ParticipantClaims {
  lastSeq: number;
  connectedAt: string;
}

export interface EquipmentInfo {
  id: string;
  safetyClass: SafetyClass;
  allowedActions: string[];
  watchdogMs: number;
  maxRateHz: number;
}

export interface RoomMeta {
  kind: 'control' | 'telemetry';
  tenantId: string;
  ownerUserId: string;
  controlSessionId?: string;
  equipment?: EquipmentInfo;
  expiresAt?: string;
  policyVersion?: string;
}

export const ALLOWED_TYPES: Record<ParticipantRole, RealtimeEventType[]> = {
  android_gateway: [
    'session.hello',
    'session.heartbeat',
    'session.arm.request',
    'session.disarm',
    'gesture.detected',
    'gesture.rejected',
    'gesture.sample_batch',
    'control.command',
    'telemetry.update',
    'device.status',
  ],
  console: ['session.hello', 'session.heartbeat', 'session.disarm', 'control.command'],
  equipment_gateway: ['session.hello', 'session.heartbeat', 'session.armed', 'command.ack', 'device.status'],
  mqtt_bridge: ['session.hello', 'session.heartbeat', 'session.armed', 'command.ack', 'device.status'],
  family_viewer: ['session.hello', 'session.heartbeat'],
};

export interface RoomEnv {
  DB: D1Database;
}
