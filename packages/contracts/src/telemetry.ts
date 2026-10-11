import { z } from 'zod';
import { Id, IsoDateTime, Quality } from './common';

export const TelemetryKind = z.enum([
  'heart_rate_bpm',
  'steps_delta',
  'steps_total',
  'sleep_interval',
  'activity',
  'battery_percent',
  'connection_state',
]);
export type TelemetryKind = z.infer<typeof TelemetryKind>;

export const TelemetryReading = z.strictObject({
  reading_id: z.string().min(6).max(100),
  kind: TelemetryKind,
  observed_at: IsoDateTime,
  value: z.union([z.number(), z.string(), z.record(z.string(), z.unknown())]),
  unit: z.string().max(32),
  quality: Quality,
  source: z.string().min(1).max(60),
  firmware: z.string().max(60).optional(),
  device_monotonic_ns: z.number().int().min(0).optional(),
});
export type TelemetryReading = z.infer<typeof TelemetryReading>;

export const TelemetryBatch = z.strictObject({
  gateway_id: Id,
  device_id: Id,
  batch_id: z.string().min(6).max(100),
  readings: z.array(TelemetryReading).min(1).max(200),
});
export type TelemetryBatch = z.infer<typeof TelemetryBatch>;

export const RejectCode = z.enum([
  'VALIDATION_ERROR',
  'UNIT_MISMATCH',
  'OUT_OF_RANGE',
  'FUTURE_TIMESTAMP',
  'TOO_OLD',
  'CONSENT_REQUIRED',
]);

export const TelemetryBatchAck = z.object({
  batch_id: z.string(),
  accepted: z.array(z.string()),
  duplicates: z.array(z.string()),
  rejected: z.array(z.object({ reading_id: z.string(), code: RejectCode })),
  server_time: IsoDateTime,
});
export type TelemetryBatchAck = z.infer<typeof TelemetryBatchAck>;

export const StoredReading = z.object({
  reading_id: z.string(),
  device_id: Id,
  kind: TelemetryKind,
  observed_at: IsoDateTime,
  received_at: IsoDateTime,
  value: z.union([z.number(), z.string(), z.record(z.string(), z.unknown())]).nullable(),
  unit: z.string(),
  quality: Quality,
  source: z.string(),
  firmware: z.string().nullable(),
});
export type StoredReading = z.infer<typeof StoredReading>;

export const HistoryQuery = z.object({
  device_id: Id.optional(),
  kind: TelemetryKind,
  from: IsoDateTime,
  to: IsoDateTime,
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const BucketSize = z.enum(['60', '300', '3600', '86400']);
export const SummaryQuery = z.object({
  device_id: Id.optional(),
  kind: TelemetryKind,
  from: IsoDateTime,
  to: IsoDateTime,
  bucket_s: BucketSize.default('3600'),
});

export const AggregateBucket = z.object({
  bucket_start: IsoDateTime,
  bucket_size_s: z.number().int(),
  count: z.number().int(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  avg: z.number().nullable(),
  sum: z.number().nullable(),
  quality: Quality,
});
export type AggregateBucket = z.infer<typeof AggregateBucket>;
