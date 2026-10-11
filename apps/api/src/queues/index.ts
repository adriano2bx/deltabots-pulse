import { redact } from '@pulse/core';
import type { Env, IngestMessage, JobMessage, NotifyMessage } from '../env';
import { first, run } from '../lib/db';
import { recomputeAggregates } from '../services/telemetry';

/** Dedupe persistente por event_id (filas são at-least-once — docs/09). */
async function once(
  env: Env,
  consumer: string,
  eventId: string,
  tenantId: string | null,
  fn: () => Promise<void>,
): Promise<void> {
  const key = `${consumer}:${eventId}`;
  if (await first(env.DB, 'SELECT 1 FROM processed_events WHERE id=?', key)) return;
  await fn();
  await run(
    env.DB,
    'INSERT OR IGNORE INTO processed_events(id,tenant_id,consumer,processed_at) VALUES(?,?,?,?)',
    key,
    tenantId,
    consumer,
    new Date().toISOString(),
  );
}

export async function handleIngest(env: Env, msg: IngestMessage): Promise<void> {
  // Agregação é idempotente por recomputação; dedupe evita trabalho repetido.
  await once(env, 'aggregate', msg.event_id, msg.tenant_id, async () => {
    await recomputeAggregates(env, msg.tenant_id, msg.device_id, msg.reading_ids);
  });
}

export async function queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const m of batch.messages) {
    try {
      if (batch.queue.startsWith('pulse-telemetry')) await handleIngest(env, m.body as IngestMessage);
      else if (batch.queue.startsWith('pulse-notifications'))
        await handleNotify(env, m.body as NotifyMessage);
      else if (batch.queue.startsWith('pulse-jobs')) await handleJob(env, m.body as JobMessage);
      m.ack();
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', queue: batch.queue, msg: redact(String(e)) }));
      m.retry({ delaySeconds: Math.min(300, 2 ** m.attempts * 5) });
    }
  }
}

// Registrados pelos módulos de notificações e jobs; sem handler a mensagem é reenviada (nunca descartada).
export let handleNotify: (env: Env, msg: NotifyMessage) => Promise<void> = async () => {
  throw new Error('handler de notificações não registrado');
};
export let handleJob: (env: Env, msg: JobMessage) => Promise<void> = async () => {
  throw new Error('handler de jobs não registrado');
};
export function registerHandlers(h: { notify?: typeof handleNotify; job?: typeof handleJob }): void {
  if (h.notify) handleNotify = h.notify;
  if (h.job) handleJob = h.job;
}
