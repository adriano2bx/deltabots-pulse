import { PulseError, newId, sha256Hex } from '@pulse/core';
import { first, run } from './db';

const TTL_MS = 24 * 3600 * 1000;

export interface StoredResponse {
  status: number;
  body: unknown;
}

/**
 * Idempotency-Key para POST críticos (docs/10): mesma chave + mesmo corpo → mesma resposta;
 * mesma chave + corpo diferente → CONFLICT; execução concorrente → CONFLICT.
 */
export async function withIdempotency(
  db: D1Database,
  opts: { tenantId: string; scope: string; key: string | undefined; requestBody: string; required?: boolean },
  fn: () => Promise<StoredResponse>,
): Promise<StoredResponse & { replayed: boolean }> {
  if (!opts.key) {
    if (opts.required) throw new PulseError('VALIDATION_ERROR', 'cabeçalho Idempotency-Key obrigatório');
    return { ...(await fn()), replayed: false };
  }
  if (opts.key.length < 8 || opts.key.length > 100)
    throw new PulseError('VALIDATION_ERROR', 'Idempotency-Key inválida');
  const reqHash = await sha256Hex(opts.requestBody);
  const existing = await first<{
    status: string;
    request_hash: string | null;
    response_status: number | null;
    response_json: string | null;
    expires_at: string;
  }>(
    db,
    'SELECT status,request_hash,response_status,response_json,expires_at FROM idempotency_keys WHERE tenant_id=? AND scope=? AND idem_key=?',
    opts.tenantId,
    opts.scope,
    opts.key,
  );
  if (existing && new Date(existing.expires_at) > new Date()) {
    if (existing.request_hash !== reqHash)
      throw new PulseError('CONFLICT', 'Idempotency-Key reutilizada com corpo diferente');
    if (existing.status !== 'completed') throw new PulseError('CONFLICT', 'requisição idêntica em andamento');
    return {
      status: existing.response_status ?? 200,
      body: JSON.parse(existing.response_json ?? 'null'),
      replayed: true,
    };
  }
  if (existing) {
    await run(
      db,
      'DELETE FROM idempotency_keys WHERE tenant_id=? AND scope=? AND idem_key=?',
      opts.tenantId,
      opts.scope,
      opts.key,
    );
  }
  const now = new Date();
  try {
    await run(
      db,
      `INSERT INTO idempotency_keys(id,tenant_id,scope,idem_key,status,request_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`,
      newId('idm'),
      opts.tenantId,
      opts.scope,
      opts.key,
      'in_progress',
      reqHash,
      now.toISOString(),
      new Date(now.getTime() + TTL_MS).toISOString(),
    );
  } catch {
    throw new PulseError('CONFLICT', 'requisição idêntica em andamento');
  }
  try {
    const res = await fn();
    await run(
      db,
      `UPDATE idempotency_keys SET status='completed',response_status=?,response_json=? WHERE tenant_id=? AND scope=? AND idem_key=?`,
      res.status,
      JSON.stringify(res.body),
      opts.tenantId,
      opts.scope,
      opts.key,
    );
    return { ...res, replayed: false };
  } catch (e) {
    await run(
      db,
      'DELETE FROM idempotency_keys WHERE tenant_id=? AND scope=? AND idem_key=?',
      opts.tenantId,
      opts.scope,
      opts.key,
    );
    throw e;
  }
}
