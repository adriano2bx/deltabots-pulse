import { newId } from '@pulse/core';
import type { Env } from '../env';
import { decrypt, hmacHex } from '../lib/crypto';
import { first, run } from '../lib/db';

/**
 * Proteção SSRF (docs/13): somente HTTPS, porta padrão, sem IPs literais privados/loopback/metadata e
 * sem hosts internos. Resolução DNS ocorre na rede da Cloudflare (sem acesso a redes privadas do cliente).
 */
export function assertSafeWebhookUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new Error('apenas https');
  if (u.port && u.port !== '443') throw new Error('porta não permitida');
  if (u.username || u.password) throw new Error('credenciais na URL não permitidas');
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.internal') ||
    h.endsWith('.local') ||
    h === 'metadata.google.internal'
  )
    throw new Error('host interno');
  if (/^\[?[0-9a-f:]+\]?$/.test(h) && h.includes(':')) throw new Error('IP literal não permitido');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) throw new Error('IP literal não permitido');
  if (!h.includes('.')) throw new Error('host inválido');
  return u;
}

/** Assinatura `t=<unix>,v1=<hmac-sha256(t.body)>` com segredo por webhook. */
export async function signWebhook(secret: string, body: string, ts: number): Promise<string> {
  return `t=${ts},v1=${await hmacHex(secret, `${ts}.${body}`)}`;
}

export async function deliverWebhook(env: Env, deliveryId: string): Promise<void> {
  const d = await first<{
    id: string;
    tenant_id: string;
    webhook_id: string;
    event_id: string;
    status: string;
    attempts: number;
  }>(
    env.DB,
    'SELECT id,tenant_id,webhook_id,event_id,status,attempts FROM webhook_deliveries WHERE id=?',
    deliveryId,
  );
  if (!d || d.status === 'delivered') return;
  const wh = await first<{ url: string; secret_ref: string; enabled: number }>(
    env.DB,
    'SELECT url,secret_ref,enabled FROM webhooks WHERE id=? AND tenant_id=?',
    d.webhook_id,
    d.tenant_id,
  );
  if (!wh || wh.enabled !== 1) {
    await run(
      env.DB,
      `UPDATE webhook_deliveries SET status='cancelled', updated_at=? WHERE id=?`,
      new Date().toISOString(),
      d.id,
    );
    return;
  }
  const url = assertSafeWebhookUrl(wh.url);
  const secret = await decrypt(env.DATA_ENCRYPTION_KEY, wh.secret_ref);
  // Payload mínimo: identificadores e tipo — nunca dado de saúde bruto.
  const body = JSON.stringify({
    id: newId('evt'),
    type: 'automation.executed',
    delivery_id: d.id,
    source_event_id: d.event_id,
    occurred_at: new Date().toISOString(),
  });
  const ts = Math.floor(Date.now() / 1000);
  let ok = false;
  let err: string | null = null;
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'DeltaBots-Pulse-Webhooks/1',
        'x-pulse-signature': await signWebhook(secret, body, ts),
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    ok = res.status >= 200 && res.status < 300;
    if (!ok) err = `HTTP_${res.status}`;
  } catch (e) {
    err = e instanceof Error && e.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'NETWORK_ERROR';
  }
  await run(
    env.DB,
    `UPDATE webhook_deliveries SET status=?, attempts=attempts+1, last_error=?, updated_at=? WHERE id=?`,
    ok ? 'delivered' : 'failed',
    err,
    new Date().toISOString(),
    d.id,
  );
  if (!ok && d.attempts + 1 < 5) throw new Error(`entrega falhou: ${err}`); // fila reprograma com backoff
}
