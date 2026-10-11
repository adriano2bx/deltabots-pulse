import { ClientPayloads, Envelope, MAX_JSON_FRAME_BYTES, type RealtimeEventType } from '@pulse/contracts';

export type EnvelopeRejection =
  'FRAME_TOO_LARGE' | 'MALFORMED' | 'SCHEMA' | 'REPLAY' | 'EXPIRED' | 'CLAIM_MISMATCH' | 'TYPE_NOT_ALLOWED';

export interface SenderClaims {
  tenantId: string;
  sessionId: string;
  gatewayId?: string;
  allowedTypes: ReadonlySet<RealtimeEventType>;
}

export interface GuardState {
  lastSeq: number;
}

export const MAX_ENVELOPE_TTL_MS = 10_000;
export const MAX_CLOCK_SKEW_MS = 2_000;

/**
 * Valida um frame recebido: tamanho, schema, claims derivadas da sessão (nunca do payload),
 * anti-replay por seq e TTL calculado no servidor (docs/06).
 */
export function guardEnvelope(
  raw: string,
  claims: SenderClaims,
  state: GuardState,
  receivedAt: Date,
): { ok: Envelope } | { reject: EnvelopeRejection; detail?: string } {
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_FRAME_BYTES) return { reject: 'FRAME_TOO_LARGE' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reject: 'MALFORMED' };
  }
  const env = Envelope.safeParse(parsed);
  if (!env.success) return { reject: 'SCHEMA', detail: env.error.issues[0]?.message };
  const e = env.data;
  if (!claims.allowedTypes.has(e.type)) return { reject: 'TYPE_NOT_ALLOWED', detail: e.type };
  if ((e.tenant_id && e.tenant_id !== claims.tenantId) || e.session_id !== claims.sessionId)
    return { reject: 'CLAIM_MISMATCH' };
  if (claims.gatewayId && e.gateway_id && e.gateway_id !== claims.gatewayId)
    return { reject: 'CLAIM_MISMATCH' };
  if (e.seq <= state.lastSeq) return { reject: 'REPLAY' };
  const payloadSchema = ClientPayloads[e.type];
  if (payloadSchema) {
    const p = payloadSchema.safeParse(e.payload);
    if (!p.success) return { reject: 'SCHEMA', detail: p.error.issues[0]?.message };
  }
  if (e.expires_at) {
    const sent = new Date(e.sent_at).getTime();
    const exp = new Date(e.expires_at).getTime();
    // TTL relativo aplicado ao instante de recepção do servidor; sent_at sozinho não é confiável.
    const ttl = Math.min(Math.max(exp - sent, 0), MAX_ENVELOPE_TTL_MS);
    const skew = Math.abs(receivedAt.getTime() - sent);
    if (skew > MAX_CLOCK_SKEW_MS + ttl || receivedAt.getTime() > sent + ttl + MAX_CLOCK_SKEW_MS) {
      return { reject: 'EXPIRED' };
    }
  }
  state.lastSeq = e.seq;
  return { ok: e };
}
