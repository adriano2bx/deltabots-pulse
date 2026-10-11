import { redact } from '@pulse/core';
import type { Env, IngestMessage, JobMessage, NotifyMessage } from '../env';
import { first, run } from '../lib/db';
import { recomputeAggregates } from '../services/telemetry';
import { processAutomationEvent } from '../services/automations';
import { dispatchNotification } from '../services/notify';
import { handleJob as runJob } from '../services/jobs';
import type { Quality } from '@pulse/contracts';

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
  // Automações: avalia a leitura mais recente de cada tipo do lote (dedupe por reading_id na execução).
  await once(env, 'automations', msg.event_id, msg.tenant_id, async () => {
    const ids = msg.reading_ids.slice(0, 200);
    if (!ids.length) return;
    const rows = await env.DB.prepare(
      `SELECT reading_id,kind,observed_at,value_num,value_json,quality FROM telemetry_readings WHERE tenant_id=? AND source_id=? AND reading_id IN (${ids.map(() => '?').join(',')}) ORDER BY observed_at DESC`,
    )
      .bind(msg.tenant_id, msg.device_id, ...ids)
      .all<{
        reading_id: string;
        kind: string;
        observed_at: string;
        value_num: number | null;
        value_json: string | null;
        quality: Quality;
      }>();
    const latest = new Map<string, (typeof rows.results)[number]>();
    for (const r of rows.results) if (!latest.has(r.kind)) latest.set(r.kind, r);
    for (const r of latest.values()) {
      if (r.kind === 'sleep_interval') {
        await processAutomationEvent(env, msg.tenant_id, msg.owner_user_id, {
          id: r.reading_id,
          kind: 'sleep_ended',
          at: r.observed_at,
          deviceId: msg.device_id,
        });
      } else if (r.value_num !== null) {
        await processAutomationEvent(env, msg.tenant_id, msg.owner_user_id, {
          id: r.reading_id,
          kind: 'telemetry',
          at: r.observed_at,
          deviceId: msg.device_id,
          telemetryKind: r.kind,
          value: r.value_num,
          quality: r.quality,
        });
      }
    }
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

export async function handleNotify(env: Env, msg: NotifyMessage): Promise<void> {
  await dispatchNotification(env, msg.notification_id);
}

export async function handleJob(env: Env, msg: JobMessage): Promise<void> {
  await once(env, `job:${msg.kind}`, msg.event_id, msg.tenant_id, () => runJob(env, msg));
}
