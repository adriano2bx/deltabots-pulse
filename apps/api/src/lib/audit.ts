import { newId, redactObject } from '@pulse/core';
import type { Principal } from '@pulse/core';
import { run } from './db';

export interface AuditInput {
  tenantId: string | null;
  actor: Principal | string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reasonCode?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Auditoria minimizada: actor pseudônimo, metadados redigidos, sem payload de saúde. */
export async function audit(db: D1Database, a: AuditInput): Promise<void> {
  const actorRef =
    a.actor === null
      ? null
      : typeof a.actor === 'string'
        ? a.actor
        : `${a.actor.kind}:${a.actor.apiKeyId ?? a.actor.userId}`;
  await run(
    db,
    `INSERT INTO audit_events(id,tenant_id,actor_ref,action,resource_type,resource_id,correlation_id,reason_code,metadata_safe_json,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    newId('aud'),
    a.tenantId,
    actorRef,
    a.action,
    a.resourceType,
    a.resourceId ?? null,
    a.correlationId ?? null,
    a.reasonCode ?? null,
    JSON.stringify(redactObject(a.metadata ?? {})),
    new Date().toISOString(),
  );
}
