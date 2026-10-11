import { z } from 'zod';

/** Identificadores opacos (ULID/UUID ou prefixados), nunca dados pessoais. */
export const Id = z
  .string()
  .min(5)
  .max(100)
  .regex(/^[A-Za-z0-9_\-:.]+$/, 'identificador inválido');
export type Id = z.infer<typeof Id>;

export const IsoDateTime = z.iso.datetime({ offset: true });

/** Timezone IANA (validada em runtime via Intl). */
export const IanaTimeZone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'timezone IANA inválida' },
);

export const Locale = z.enum(['pt-BR', 'en-US']);

/** Erros canônicos (docs/10-API.md). */
export const ErrorCode = z.enum([
  'AUTH_REQUIRED',
  'TOKEN_EXPIRED',
  'CONSENT_REQUIRED',
  'FORBIDDEN',
  'TENANT_MISMATCH',
  'DEVICE_UNAVAILABLE',
  'CAPABILITY_UNVERIFIED',
  'HW_UNSUPPORTED',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'COMMAND_EXPIRED',
  'CONTROL_DISARMED',
  'SAFETY_BLOCKED',
  'CONFLICT',
  'DUPLICATE',
  'UPSTREAM_TIMEOUT',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'MFA_REQUIRED',
  'INTEGRATION_BLOCKED',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** RFC 9457 problem+json. */
export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: ErrorCode,
  trace_id: z.string(),
  instance: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof Problem>;

export const PageQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listResponse = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), next_cursor: z.string().nullable() });
export const itemResponse = <T extends z.ZodType>(item: T) => z.object({ data: item });

export const JobResponse = z.object({ id: Id, status: z.string() });

/** Proveniência obrigatória de toda leitura exibida (RF-01). */
export const Quality = z.enum(['measured', 'estimated', 'invalid', 'stale']);
export type Quality = z.infer<typeof Quality>;

export const SupportState = z.enum(['SUPPORTED', 'UNSUPPORTED', 'UNVERIFIED', 'TEMPORARILY_UNAVAILABLE']);
export type SupportState = z.infer<typeof SupportState>;
