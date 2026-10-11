import type { Principal } from '@pulse/core';

export interface IngestMessage {
  kind: 'telemetry.batch_ingested';
  event_id: string;
  tenant_id: string;
  owner_user_id: string;
  device_id: string;
  reading_ids: string[];
}
export interface NotifyMessage {
  kind: 'notification.dispatch';
  event_id: string;
  tenant_id: string;
  notification_id: string;
}
export type JobMessage =
  | { kind: 'export.build'; event_id: string; tenant_id: string; export_id: string }
  | { kind: 'account.delete'; event_id: string; tenant_id: string; deletion_id: string }
  | { kind: 'webhook.deliver'; event_id: string; tenant_id: string; delivery_id: string }
  | { kind: 'automation.event'; event_id: string; tenant_id: string; owner_user_id: string; event: unknown };

export interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  RAW_BUCKET: R2Bucket;
  CONFIG_KV: KVNamespace;
  INGEST_QUEUE: Queue<IngestMessage>;
  NOTIFY_QUEUE: Queue<NotifyMessage>;
  JOBS_QUEUE: Queue<JobMessage>;
  SESSIONS?: DurableObjectNamespace;
  AI?: Ai;
  RATE_LIMITER?: RateLimitBinding;
  APP_ENV: string;
  PUBLIC_BASE_URL: string;
  PUBLIC_WS_BASE_URL: string;
  CORS_ORIGINS: string;
  FEATURE_GESTURE_RAW: string;
  ACCESS_TOKEN_TTL_S: string;
  REFRESH_TOKEN_TTL_S: string;
  /** PKCS#8 PEM (ES256). Segredo. */
  JWT_PRIVATE_KEY: string;
  /** SPKI PEM (ES256). */
  JWT_PUBLIC_KEY: string;
  /** 32 bytes base64url para AES-GCM/HMAC de dados sensíveis. Segredo. */
  DATA_ENCRYPTION_KEY: string;
  WEBHOOK_SIGNING_SECRET: string;
}

export interface AppVariables {
  traceId: string;
  principal: Principal;
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };
