import { z } from 'zod';
import { Id, IsoDateTime, SupportState } from './common';

/** Capabilities conhecidas; o estado é sempre por dispositivo+firmware (docs/05). */
export const CapabilityId = z.enum([
  'auth_huami_v2',
  'battery_read',
  'device_info_read',
  'heart_rate_on_demand',
  'heart_rate_continuous',
  'heart_rate_history',
  'steps_realtime',
  'activity_history',
  'sleep_history',
  'vibration_alert',
  'text_notification',
  'call_notification',
  'alarm_config',
  'button_events',
  'find_phone_event',
  'raw_accel_stream',
  'firmware_ota',
]);
export type CapabilityId = z.infer<typeof CapabilityId>;

export const Capability = z.object({
  id: CapabilityId,
  support_state: SupportState,
  firmware: z.string().nullable(),
  driver_version: z.string().nullable(),
  verified_at: IsoDateTime.nullable(),
  test_artifact: z.string().nullable(),
  sample_rate_hz: z.number().nullable().optional(),
  limitations: z.string().nullable().optional(),
});
export type Capability = z.infer<typeof Capability>;

export const Device = z.object({
  id: Id,
  model: z.string(),
  manufacturer: z.string().nullable(),
  alias: z.string().nullable(),
  firmware: z.string().nullable(),
  transport: z.string(),
  gateway_id: Id.nullable(),
  last_seen_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
});
export type Device = z.infer<typeof Device>;

export const RegisterDeviceRequest = z.strictObject({
  model: z.string().min(1).max(60),
  manufacturer: z.string().max(60).optional(),
  alias: z.string().max(60).optional(),
  firmware: z.string().max(60).optional(),
  gateway_id: Id,
  /** Pseudônimo gerado no gateway (HMAC do endereço BLE); nunca o MAC bruto. */
  hardware_fingerprint: z.string().min(16).max(128),
});

export const UpdateDeviceRequest = z.strictObject({
  alias: z.string().max(60).optional(),
  firmware: z.string().max(60).optional(),
  capabilities: z
    .array(
      z.strictObject({
        id: CapabilityId,
        support_state: SupportState,
        firmware: z.string().max(60).nullable(),
        driver_version: z.string().max(40),
        test_artifact: z.string().max(200).nullable().optional(),
        limitations: z.string().max(500).nullable().optional(),
      }),
    )
    .max(40)
    .optional(),
});

export const DeviceStatus = z.object({
  device_id: Id,
  connection_state: z.enum(['connected', 'disconnected', 'unknown']),
  battery_percent: z.number().int().min(0).max(100).nullable(),
  battery_observed_at: IsoDateTime.nullable(),
  last_seen_at: IsoDateTime.nullable(),
  last_sync_at: IsoDateTime.nullable(),
  rssi_dbm: z.number().int().nullable(),
  stale: z.boolean(),
});

export const WearableCommandRequest = z.strictObject({
  action: z.enum(['vibrate', 'sync_now', 'measure_heart_rate', 'send_notification']),
  arguments: z.record(z.string(), z.unknown()).default({}),
  idempotency_key: z.string().min(8).max(100),
  ttl_ms: z.number().int().min(1000).max(300000).default(60000),
});

export const GatewayKind = z.enum(['android', 'mqtt_bridge', 'ws_gateway']);
export const RegisterGatewayRequest = z.strictObject({
  kind: GatewayKind,
  display_name: z.string().max(80).optional(),
  /** Chave pública (SPKI base64url, P-256) para prova de posse do gateway. */
  public_key: z.string().min(40).max(400).optional(),
  app_version: z.string().max(40).optional(),
});
export const Gateway = z.object({
  id: Id,
  kind: GatewayKind,
  display_name: z.string().nullable(),
  last_seen_at: IsoDateTime.nullable(),
  revoked_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
});
export const GatewayHeartbeat = z.strictObject({
  app_version: z.string().max(40),
  os_version: z.string().max(40).optional(),
  clock_skew_ms: z.number().int().optional(),
  battery_percent: z.number().int().min(0).max(100).optional(),
  network: z.enum(['wifi', 'cellular', 'offline', 'unknown']).optional(),
  devices: z
    .array(
      z.strictObject({
        device_id: Id,
        connection_state: z.enum(['connected', 'disconnected', 'unknown']),
        rssi_dbm: z.number().int().min(-127).max(20).optional(),
      }),
    )
    .max(10)
    .default([]),
});
