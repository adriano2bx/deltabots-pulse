import type { ErrorCode, Problem } from '@pulse/contracts';

const STATUS: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  TOKEN_EXPIRED: 401,
  MFA_REQUIRED: 401,
  CONSENT_REQUIRED: 403,
  FORBIDDEN: 403,
  TENANT_MISMATCH: 404,
  NOT_FOUND: 404,
  DEVICE_UNAVAILABLE: 409,
  CAPABILITY_UNVERIFIED: 409,
  HW_UNSUPPORTED: 409,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
  COMMAND_EXPIRED: 409,
  CONTROL_DISARMED: 409,
  SAFETY_BLOCKED: 403,
  CONFLICT: 409,
  DUPLICATE: 409,
  UPSTREAM_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
  INTEGRATION_BLOCKED: 503,
};

const TITLE: Record<ErrorCode, string> = {
  AUTH_REQUIRED: 'Autenticação necessária',
  TOKEN_EXPIRED: 'Sessão expirada',
  MFA_REQUIRED: 'Segundo fator necessário',
  CONSENT_REQUIRED: 'Consentimento necessário',
  FORBIDDEN: 'Acesso negado',
  TENANT_MISMATCH: 'Recurso não encontrado',
  NOT_FOUND: 'Recurso não encontrado',
  DEVICE_UNAVAILABLE: 'Dispositivo indisponível',
  CAPABILITY_UNVERIFIED: 'Capacidade não verificada no hardware',
  HW_UNSUPPORTED: 'Não suportado pelo hardware',
  RATE_LIMITED: 'Muitas requisições',
  VALIDATION_ERROR: 'Dados inválidos',
  COMMAND_EXPIRED: 'Comando expirado',
  CONTROL_DISARMED: 'Controle desarmado',
  SAFETY_BLOCKED: 'Bloqueado por segurança',
  CONFLICT: 'Conflito de versão',
  DUPLICATE: 'Duplicado',
  UPSTREAM_TIMEOUT: 'Tempo esgotado no serviço externo',
  INTERNAL_ERROR: 'Erro interno',
  INTEGRATION_BLOCKED: 'Integração indisponível',
};

export class PulseError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: Array<{ path: string; message: string }>;
  constructor(code: ErrorCode, detail?: string, fieldErrors?: Array<{ path: string; message: string }>) {
    super(detail ?? TITLE[code]);
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = fieldErrors;
  }
}

export function statusFor(code: ErrorCode): number {
  return STATUS[code];
}

export function toProblem(err: PulseError, traceId: string, instance?: string): Problem {
  return {
    type: `https://pulse.deltabots.com.br/problems/${err.code.toLowerCase().replace(/_/g, '-')}`,
    title: TITLE[err.code],
    status: err.status,
    detail: err.message,
    code: err.code,
    trace_id: traceId,
    ...(instance ? { instance } : {}),
    ...(err.fieldErrors ? { errors: err.fieldErrors } : {}),
  };
}
