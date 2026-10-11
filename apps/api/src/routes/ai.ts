import { Hono } from 'hono';
import { z } from 'zod';
import { ChatRequest, InsightFeedbackRequest } from '@pulse/contracts';
import { PulseError, newId, type Principal } from '@pulse/core';
import type { AppEnv, Env } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireScope } from '../lib/auth';
import { all, first, run } from '../lib/db';
import { parseBody } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { chat } from '../services/assistant';
import { activeConsents } from '../services/consent';
import { INSIGHT_MODEL_VERSION, generateInsights } from '../services/insights';
import { MCP_TOOLS } from '../services/mcp';

async function requireConsents(
  env: Env,
  p: Principal,
  purposes: Array<'health_processing' | 'ai_analysis'>,
): Promise<void> {
  const active = await activeConsents(env.DB, p.tenantId, p.userId);
  const missing = purposes.filter((x) => !active.has(x));
  if (missing.length)
    throw new PulseError('CONSENT_REQUIRED', `consentimentos necessários: ${missing.join(', ')}`);
}

export const aiRoutes = new Hono<AppEnv>();
aiRoutes.use('*', requireAuth);

aiRoutes.post('/chat', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'ai:use');
  await requireConsents(c.env, p, ['health_processing', 'ai_analysis']);
  await rateLimit(c.env, `ai:${p.userId}`, 30, 3600_000);
  const body = await parseBody(c, ChatRequest);
  const res = await chat(c.env, {
    tenantId: p.tenantId,
    userId: p.userId,
    message: body.message,
    conversationId: body.conversation_id,
    scopes: p.scopes,
  });
  return c.json({ data: res });
});

aiRoutes.get('/conversations', async (c) => {
  const p = c.get('principal');
  const rows = await all(
    c.env.DB,
    'SELECT id,created_at,updated_at FROM ai_conversations WHERE tenant_id=? AND owner_user_id=? ORDER BY updated_at DESC LIMIT 50',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows, next_cursor: null });
});

aiRoutes.get('/conversations/:id', async (c) => {
  const p = c.get('principal');
  const conv = await first(
    c.env.DB,
    'SELECT id FROM ai_conversations WHERE id=? AND tenant_id=? AND owner_user_id=?',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!conv) throw new PulseError('NOT_FOUND');
  const msgs = await all(
    c.env.DB,
    'SELECT id,role,content,created_at FROM ai_messages WHERE conversation_id=? ORDER BY created_at LIMIT 200',
    c.req.param('id'),
  );
  return c.json({ data: msgs, next_cursor: null });
});

aiRoutes.delete('/conversations/:id', async (c) => {
  const p = c.get('principal');
  const conv = await first(
    c.env.DB,
    'SELECT id FROM ai_conversations WHERE id=? AND tenant_id=? AND owner_user_id=?',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!conv) throw new PulseError('NOT_FOUND');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM ai_messages WHERE conversation_id=?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM ai_conversations WHERE id=?').bind(c.req.param('id')),
  ]);
  return c.json({ data: { deleted: true } });
});

/** Insights estatísticos (sem LLM) com cache de 6 h; `refresh=true` recalcula. */
aiRoutes.get('/insights', async (c) => {
  const p = c.get('principal');
  await requireConsents(c.env, p, ['health_processing']);
  const refresh = c.req.query('refresh') === 'true';
  const recent = await all<{
    id: string;
    kind: string;
    model_version: string;
    input_window_json: string;
    confidence: number;
    quality: string;
    quality_flags_json: string;
    explanation: string;
    sources_json: string;
    created_at: string;
  }>(
    c.env.DB,
    `SELECT id,kind,model_version,input_window_json,confidence,quality,quality_flags_json,explanation,sources_json,created_at FROM ai_insights WHERE tenant_id=? AND owner_user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 20`,
    p.tenantId,
    p.userId,
    new Date(Date.now() - 6 * 3600_000).toISOString(),
  );
  if (!refresh && recent.length) {
    const latestBatch = recent.filter((r) => r.created_at === recent[0]!.created_at);
    return c.json({
      data: latestBatch.map((r) => ({
        id: r.id,
        kind: r.kind,
        model_version: r.model_version,
        input_window: JSON.parse(r.input_window_json),
        confidence: r.confidence,
        quality: r.quality,
        quality_flags: JSON.parse(r.quality_flags_json),
        explanation: r.explanation,
        sources: JSON.parse(r.sources_json),
        generated_at: r.created_at,
      })),
      next_cursor: null,
    });
  }
  return c.json({ data: await generateInsights(c.env, p.tenantId, p.userId, 30), next_cursor: null });
});

aiRoutes.post('/feedback', async (c) => {
  const p = c.get('principal');
  const body = await parseBody(c, InsightFeedbackRequest);
  const ins = await first(
    c.env.DB,
    'SELECT id FROM ai_insights WHERE id=? AND tenant_id=? AND owner_user_id=?',
    body.insight_id,
    p.tenantId,
    p.userId,
  );
  if (!ins) throw new PulseError('NOT_FOUND');
  const id = newId('fbk');
  await run(
    c.env.DB,
    'INSERT INTO ai_feedback(id,tenant_id,owner_user_id,insight_id,feedback,created_at) VALUES(?,?,?,?,?,?)',
    id,
    p.tenantId,
    p.userId,
    body.insight_id,
    body.feedback,
    new Date().toISOString(),
  );
  return c.json({ data: { id } }, 201);
});

aiRoutes.get('/models', (c) =>
  c.json({
    data: [
      {
        id: INSIGHT_MODEL_VERSION,
        kind: 'statistical',
        description: 'Estatística descritiva determinística (tendências, z-score, regularidade, correlação).',
        available: true,
      },
      {
        id: '@cf/meta/llama-3.1-8b-instruct',
        kind: 'llm',
        description: 'Explicações em linguagem natural via Workers AI, com guardrails.',
        available: Boolean(c.env.AI),
      },
    ],
    next_cursor: null,
  }),
);

/**
 * Servidor MCP mínimo (JSON-RPC 2.0, F267): `initialize`, `tools/list`, `tools/call` somente para
 * ferramentas de leitura; ferramentas de alteração retornam pedido de aprovação, nunca executam.
 */
export const mcpServerRoutes = new Hono<AppEnv>();
mcpServerRoutes.use('*', requireAuth);
mcpServerRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'mcp:tools');
  const req = z
    .object({
      jsonrpc: z.literal('2.0'),
      id: z.union([z.string(), z.number()]),
      method: z.string(),
      params: z.record(z.string(), z.unknown()).optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!req.success)
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  const { id, method, params } = req.data;
  const ok = (result: unknown) => c.json({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string) => c.json({ jsonrpc: '2.0', id, error: { code, message } });
  if (method === 'initialize')
    return ok({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'deltabots-pulse', version: '1.1.0' },
      capabilities: { tools: {} },
    });
  const allowed = MCP_TOOLS.filter((t) => p.scopes.has(t.required_scope));
  if (method === 'tools/list')
    return ok({
      tools: allowed.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.input_schema,
        annotations: { readOnlyHint: !t.mutating },
      })),
    });
  if (method !== 'tools/call') return err(-32601, 'Method not found');
  const name = String(params?.name ?? '');
  const tool = allowed.find((t) => t.name === name);
  if (!tool) return err(-32602, 'ferramenta não permitida');
  if (tool.mutating) {
    await audit(c.env.DB, {
      tenantId: p.tenantId,
      actor: p,
      action: 'mcp.approval_required',
      resourceType: 'mcp_tool',
      resourceId: name,
    });
    return ok({
      isError: true,
      content: [{ type: 'text', text: 'Ação requer aprovação explícita do titular no app DeltaBots Pulse.' }],
    });
  }
  const args = (params?.arguments ?? {}) as Record<string, unknown>;
  let data: unknown;
  if (name === 'pulse.devices.list')
    data = await all(
      c.env.DB,
      'SELECT id,model,firmware,last_seen_at FROM devices WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
      p.tenantId,
      p.userId,
    );
  else if (name === 'pulse.insights.get') {
    await requireConsents(c.env, p, ['health_processing', 'ai_analysis']);
    data = await generateInsights(c.env, p.tenantId, p.userId, 30);
  } else {
    const path = {
      'pulse.telemetry.latest': `/v1/telemetry/latest?device_id=${encodeURIComponent(String(args.device_id ?? ''))}`,
      'pulse.sleep.summary': `/v1/health/sleep?days=${Number(args.days ?? 7)}`,
      'pulse.activity.summary': `/v1/health/activities?days=${Number(args.days ?? 7)}`,
      'pulse.notifications.list': '/v1/notifications',
      'pulse.telemetry.history': `/v1/health/trends?kind=${encodeURIComponent(String(args.kind ?? 'heart_rate_bpm'))}&days=${Number(args.days ?? 7)}`,
      'pulse.automations.simulate': `/v1/automations/${encodeURIComponent(String(args.automation_id ?? ''))}`,
    }[name];
    if (!path) return err(-32602, 'ferramenta sem executor');
    const { createApp } = await import('../app');
    const sub = await createApp().fetch(
      new Request(new URL(path, c.req.url), {
        headers: { authorization: c.req.header('authorization') ?? '' },
      }),
      c.env,
      c.executionCtx,
    );
    data = await sub.json();
  }
  // Saída de ferramenta é dado, não instrução: entregue como texto JSON.
  return ok({ content: [{ type: 'text', text: JSON.stringify(data) }] });
});
