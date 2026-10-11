import { z } from 'zod';
import { Id, IsoDateTime } from './common';

export const NotificationChannel = z.enum(['push', 'email', 'in_app', 'band']);
export const Notification = z.object({
  id: Id,
  kind: z.string(),
  channel: NotificationChannel,
  status: z.enum(['pending', 'sent', 'failed', 'read', 'suppressed']),
  title: z.string(),
  body: z.string(),
  priority: z.enum(['low', 'normal', 'high']),
  created_at: IsoDateTime,
  read_at: IsoDateTime.nullable(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationPreferences = z.strictObject({
  channels: z.record(z.string(), z.array(NotificationChannel)).default({}),
  quiet_hours: z
    .strictObject({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.string(),
    })
    .nullable()
    .default(null),
  muted_kinds: z.array(z.string().max(60)).max(50).default([]),
  escalation_minutes: z.number().int().min(1).max(240).nullable().default(null),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferences>;

export const Alert = z.object({
  id: Id,
  kind: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  status: z.enum(['open', 'acknowledged', 'resolved', 'suppressed']),
  summary: z.string(),
  device_id: Id.nullable(),
  created_at: IsoDateTime,
  ack_at: IsoDateTime.nullable(),
});

export const CreateCheckinRequest = z.strictObject({
  kind: z.enum(['wellbeing', 'safety', 'help_request']),
  message: z.string().max(280).optional(),
  /** Localização do celular apenas com consentimento location_sharing ativo. */
  location: z
    .strictObject({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      accuracy_m: z.number().min(0),
    })
    .optional(),
});
export const Checkin = z.object({
  id: Id,
  kind: z.string(),
  status: z.enum(['requested', 'ok', 'help_needed', 'escalated', 'expired']),
  requested_at: IsoDateTime,
  responded_at: IsoDateTime.nullable(),
});
