import { z } from 'zod';
import { Id, IsoDateTime } from './common';
import type { TelemetryKind } from './telemetry';

export const ShareMetric = z.enum([
  'heart_rate',
  'steps',
  'sleep',
  'battery',
  'connection',
  'checkins',
  'alerts',
]);
export type ShareMetric = z.infer<typeof ShareMetric>;

export const GrantScope = z.strictObject({
  role: z.enum(['family_viewer', 'caregiver']),
  metrics: z.array(ShareMetric).min(1).max(7),
  device_ids: z.array(Id).max(10).default([]),
  /** Janela máxima de histórico visível ao beneficiário. */
  history_days: z.number().int().min(1).max(365).default(7),
});
export type GrantScope = z.infer<typeof GrantScope>;

export const CreateInvitationRequest = z.strictObject({
  invitee_email: z.email(),
  scope: GrantScope,
  expires_at: IsoDateTime.optional(),
});
export const Invitation = z.object({
  id: Id,
  scope: GrantScope,
  expires_at: IsoDateTime,
  accepted_at: IsoDateTime.nullable(),
  revoked_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
  /** Retornado apenas uma vez na criação. */
  invite_token: z.string().optional(),
});
export const AcceptInvitationRequest = z.strictObject({ invite_token: z.string().min(20).max(200) });
export const Grant = z.object({
  id: Id,
  owner_user_id: Id,
  grantee_user_id: Id,
  owner_display_name: z.string().nullable(),
  grantee_display_name: z.string().nullable(),
  scope: GrantScope,
  expires_at: IsoDateTime.nullable(),
  revoked_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
});
export type Grant = z.infer<typeof Grant>;

export const metricForKind: Record<z.infer<typeof TelemetryKind>, ShareMetric> = {
  heart_rate_bpm: 'heart_rate',
  steps_delta: 'steps',
  steps_total: 'steps',
  activity: 'steps',
  sleep_interval: 'sleep',
  battery_percent: 'battery',
  connection_state: 'connection',
};
