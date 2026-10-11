import { z } from 'zod';
import { Id, IsoDateTime } from './common';

/** Finalidades separadas (docs/12-SECURITY-LGPD.md). Nunca agrupadas. */
export const ConsentPurpose = z.enum([
  'health_processing',
  'cloud_sync_health',
  'family_sharing',
  'ai_analysis',
  'gesture_raw_recording',
  'research_data_donation',
  'location_sharing',
  'notification_mirroring',
  'marketing',
]);
export type ConsentPurpose = z.infer<typeof ConsentPurpose>;

export const CreateConsentRequest = z.strictObject({
  purpose: ConsentPurpose,
  scope: z.record(z.string(), z.unknown()).default({}),
  policy_version: z.string().min(1).max(40),
  expires_at: IsoDateTime.optional(),
});

export const Consent = z.object({
  id: Id,
  purpose: ConsentPurpose,
  scope: z.record(z.string(), z.unknown()),
  policy_version: z.string(),
  granted_at: IsoDateTime,
  revoked_at: IsoDateTime.nullable(),
  expires_at: IsoDateTime.nullable(),
});
export type Consent = z.infer<typeof Consent>;
