import { z } from 'zod';
import { Id, IsoDateTime } from './common';
import { Scope } from './auth';

export const ApiKey = z.object({
  id: Id,
  key_prefix: z.string(),
  scopes: z.array(Scope),
  expires_at: IsoDateTime.nullable(),
  revoked_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
  /** Segredo exibido apenas uma vez. */
  secret: z.string().optional(),
});
export const CreateApiKeyRequest = z.strictObject({
  label: z.string().max(60).optional(),
  scopes: z.array(Scope).min(1).max(18),
  expires_at: IsoDateTime.optional(),
});

export const WebhookEventType = z.enum([
  'telemetry.batch_ingested',
  'alert.created',
  'automation.executed',
  'device.status_changed',
  'report.generated',
  'checkin.created',
]);
export const CreateWebhookRequest = z.strictObject({
  url: z.url({ protocol: /^https$/ }).max(500),
  event_types: z.array(WebhookEventType).min(1).max(6),
  integration_id: Id.optional(),
});
export const Webhook = z.object({
  id: Id,
  url: z.string(),
  event_types: z.array(WebhookEventType),
  enabled: z.boolean(),
  created_at: IsoDateTime,
  secret: z.string().optional(),
});

export const IntegrationKind = z.enum(['home_assistant', 'n8n', 'mqtt_bridge', 'ws_gateway', 'jev', 'http']);
export const CreateIntegrationRequest = z.strictObject({
  kind: IntegrationKind,
  label: z.string().min(1).max(60),
  config: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])),
});
export const Integration = z.object({
  id: Id,
  kind: IntegrationKind,
  label: z.string(),
  state: z.enum(['disabled', 'enabled', 'error', 'INTEGRATION_BLOCKED']),
  created_at: IsoDateTime,
});

export const McpTool = z.object({
  name: z.string(),
  description: z.string(),
  mutating: z.boolean(),
  required_scope: Scope,
  input_schema: z.record(z.string(), z.unknown()),
});

export const Plan = z.object({
  id: z.string(),
  name: z.string(),
  price_brl_cents: z.number().int(),
  interval: z.enum(['month', 'year', 'none']),
  limits: z.record(z.string(), z.number()),
});
export const Subscription = z.object({
  plan_id: z.string(),
  status: z.enum(['active', 'trialing', 'past_due', 'canceled', 'none']),
  provider: z.string().nullable(),
  period_end: IsoDateTime.nullable(),
});
export const UsageItem = z.object({
  metric: z.string(),
  value: z.number(),
  limit: z.number().nullable(),
  bucket_start: IsoDateTime,
});

export const ReportRequest = z.strictObject({
  period: z.enum(['daily', 'weekly', 'monthly']),
  from: IsoDateTime.optional(),
  device_id: Id.optional(),
});
export const Report = z.object({
  id: Id,
  period: z.enum(['daily', 'weekly', 'monthly']),
  window: z.object({ from: IsoDateTime, to: IsoDateTime }),
  sections: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      metrics: z.record(z.string(), z.number().nullable()),
      notes: z.array(z.string()),
    }),
  ),
  created_at: IsoDateTime,
});
export const ExportRequest = z.strictObject({
  kind: z.enum(['telemetry_csv', 'telemetry_json', 'full_json']),
});
export const ExportJob = z.object({
  id: Id,
  kind: z.string(),
  state: z.enum(['queued', 'running', 'ready', 'failed', 'expired']),
  download_url: z.string().nullable(),
  expires_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
});
export const DeleteAccountRequest = z.strictObject({
  confirm_email: z.email(),
  reason: z.string().max(200).optional(),
});

export const AuditEvent = z.object({
  id: Id,
  actor_ref: z.string().nullable(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string().nullable(),
  reason_code: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: IsoDateTime,
});
