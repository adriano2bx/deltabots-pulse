import { z } from 'zod';
import { IanaTimeZone, Id, IsoDateTime, Locale } from './common';

export const Password = z
  .string()
  .min(12, 'mínimo de 12 caracteres')
  .max(256)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), 'use letras e números');

export const RegisterRequest = z.strictObject({
  email: z.email().max(254),
  password: Password,
  display_name: z.string().trim().min(1).max(80).optional(),
  locale: Locale.default('pt-BR'),
  timezone: IanaTimeZone.default('America/Sao_Paulo'),
  accepted_terms_version: z.string().min(1).max(40),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
  device_label: z.string().max(80).optional(),
  mfa_code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export const RefreshRequest = z.strictObject({ refresh_token: z.string().min(20).max(400) });

export const AuthTokens = z.object({
  access_token: z.string(),
  expires_in: z.number().int(),
  refresh_token: z.string().optional(),
  token_type: z.literal('Bearer'),
  session_id: Id,
  tenant_id: Id,
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const MfaSetupResponse = z.object({ otpauth_uri: z.string(), secret_base32: z.string() });
export const MfaVerifyRequest = z.strictObject({ code: z.string().regex(/^\d{6}$/) });

export const User = z.object({
  id: Id,
  email: z.email(),
  display_name: z.string().nullable(),
  locale: Locale,
  timezone: z.string(),
  mfa_enabled: z.boolean(),
  created_at: IsoDateTime,
});
export type User = z.infer<typeof User>;

export const UpdateMeRequest = z.strictObject({
  display_name: z.string().trim().min(1).max(80).optional(),
  locale: Locale.optional(),
  timezone: IanaTimeZone.optional(),
});

export const SessionInfo = z.object({
  id: Id,
  device_label: z.string().nullable(),
  created_at: IsoDateTime,
  last_seen_at: IsoDateTime.nullable(),
  expires_at: IsoDateTime,
  current: z.boolean(),
});

export const Role = z.enum([
  'owner',
  'org_admin',
  'developer',
  'member',
  'operator',
  'family_viewer',
  'caregiver',
  'superadmin',
]);
export type Role = z.infer<typeof Role>;

/** Escopos de token/API key (docs/06, docs/10). */
export const Scope = z.enum([
  'profile:read',
  'profile:write',
  'devices:read',
  'devices:write',
  'telemetry:read',
  'telemetry:write',
  'automations:read',
  'automations:write',
  'realtime:read',
  'gesture:stream',
  'control:arm',
  'control:execute',
  'device:ack',
  'ai:use',
  'share:manage',
  'org:manage',
  'admin:read',
  'mcp:tools',
]);
export type Scope = z.infer<typeof Scope>;
