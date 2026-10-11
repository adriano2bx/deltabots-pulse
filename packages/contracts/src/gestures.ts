import { z } from 'zod';
import { Id, IsoDateTime } from './common';

export const GestureMode = z.enum([
  'OBSERVE',
  'RECORD',
  'CALIBRATE',
  'TRAIN',
  'RECOGNIZE_LOCAL',
  'RECOGNIZE_CLOUD_LAB',
  'CONTROL_ARMED',
]);
export const SensorSource = z.enum(['miband3_raw', 'android_imu', 'synthetic_lab']);

export const CreateGestureSessionRequest = z.strictObject({
  mode: GestureMode,
  device_id: Id.optional(),
  sensor_source: SensorSource,
});
export const GestureSession = z.object({
  id: Id,
  mode: GestureMode,
  sensor_source: SensorSource,
  device_id: Id.nullable(),
  created_at: IsoDateTime,
});

export const RegisterTrainingSetRequest = z.strictObject({
  device_id: Id.optional(),
  consent_id: Id,
  sensor_source: SensorSource,
  dataset_hash: z.string().regex(/^[a-f0-9]{64}$/),
  sample_count: z.number().int().min(1).max(10_000_000),
  labels: z.array(z.string().min(2).max(40)).min(1).max(20),
});

export const GestureModel = z.object({
  id: Id,
  model_version: z.string(),
  algorithm: z.enum(['dtw_template', 'feature_knn', 'tflite_cnn']),
  state: z.enum(['training', 'evaluated', 'active', 'retired', 'failed']),
  sensor_source: SensorSource,
  metrics: z.record(z.string(), z.unknown()),
  created_at: IsoDateTime,
});

export const CreateMappingRequest = z.strictObject({
  gesture_key: z.string().min(2).max(40),
  equipment_id: Id,
  action: z.string().regex(/^[a-z_]{2,40}$/),
  args: z.record(z.string(), z.union([z.boolean(), z.number(), z.string().max(100)])).default({}),
  min_confidence: z.number().min(0.5).max(1).default(0.95),
  requires_approval: z.boolean().default(false),
});
export const GestureMapping = z.object({
  id: Id,
  gesture_key: z.string(),
  equipment_id: Id,
  action: z.string(),
  args: z.record(z.string(), z.unknown()),
  min_confidence: z.number(),
  requires_approval: z.boolean(),
  enabled: z.boolean(),
});
