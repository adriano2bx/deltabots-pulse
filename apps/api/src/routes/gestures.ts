import { Hono } from 'hono';
import { z } from 'zod';
import {
  CreateGestureSessionRequest,
  CreateMappingRequest,
  RegisterTrainingSetRequest,
} from '@pulse/contracts';
import { PulseError, newId, sha256Hex } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireScope } from '../lib/auth';
import { all, first, run } from '../lib/db';
import { parseBody } from '../lib/http';
import { activeConsents } from '../services/consent';

export const gestureRoutes = new Hono<AppEnv>();
gestureRoutes.use('*', requireAuth);

/** Critérios mínimos para um modelo atuar em equipamento (docs/07). */
export const ACTIVATION_GATE = {
  macro_precision: 0.95,
  macro_recall: 0.9,
  max_false_activations_per_hour: 1 / 8,
};

/**
 * Sessão de gestos: a fonte `miband3_raw` só é aceita com capability `raw_accel_stream` SUPPORTED
 * comprovada no dispositivo (T005); fontes alternativas ficam rotuladas.
 */
gestureRoutes.post('/sessions', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'gesture:stream');
  const body = await parseBody(c, CreateGestureSessionRequest);
  if (body.sensor_source === 'miband3_raw') {
    if (!body.device_id) throw new PulseError('VALIDATION_ERROR', 'device_id obrigatório para miband3_raw');
    const cap = await first(
      c.env.DB,
      `SELECT 1 FROM device_capabilities c JOIN devices d ON d.id=c.device_id WHERE c.device_id=? AND d.owner_user_id=? AND d.tenant_id=? AND c.capability='raw_accel_stream' AND c.support_state='SUPPORTED'`,
      body.device_id,
      p.userId,
      p.tenantId,
    );
    if (!cap || c.env.FEATURE_GESTURE_RAW !== 'true')
      throw new PulseError(
        'CAPABILITY_UNVERIFIED',
        'stream bruto do acelerômetro não comprovado neste dispositivo/firmware',
      );
  }
  if (
    body.mode === 'RECORD' &&
    !(await activeConsents(c.env.DB, p.tenantId, p.userId)).has('gesture_raw_recording')
  )
    throw new PulseError('CONSENT_REQUIRED', 'gravação exige consentimento gesture_raw_recording');
  const id = newId('gss');
  const now = new Date().toISOString();
  await run(
    c.env.DB,
    'INSERT INTO gesture_sessions(id,tenant_id,owner_user_id,mode,sensor_source,device_id,created_at) VALUES(?,?,?,?,?,?,?)',
    id,
    p.tenantId,
    p.userId,
    body.mode,
    body.sensor_source,
    body.device_id ?? null,
    now,
  );
  return c.json(
    {
      data: {
        id,
        mode: body.mode,
        sensor_source: body.sensor_source,
        device_id: body.device_id ?? null,
        created_at: now,
      },
    },
    201,
  );
});

gestureRoutes.post('/training-sets', async (c) => {
  const p = c.get('principal');
  const body = await parseBody(c, RegisterTrainingSetRequest);
  const consent = await first(
    c.env.DB,
    `SELECT 1 FROM consents WHERE id=? AND tenant_id=? AND user_id=? AND purpose='gesture_raw_recording' AND revoked_at IS NULL`,
    body.consent_id,
    p.tenantId,
    p.userId,
  );
  if (!consent) throw new PulseError('CONSENT_REQUIRED', 'consentimento gesture_raw_recording inválido');
  const id = newId('gts');
  const key = `tenants/${p.tenantId}/gestures/${p.userId}/${id}.ndjson`;
  await run(
    c.env.DB,
    'INSERT INTO gesture_training_sets(id,tenant_id,owner_user_id,device_id,r2_key,consent_id,dataset_hash,sample_count,created_at,sensor_source,labels_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    id,
    p.tenantId,
    p.userId,
    body.device_id ?? null,
    key,
    body.consent_id,
    body.dataset_hash,
    body.sample_count,
    new Date().toISOString(),
    body.sensor_source,
    JSON.stringify(body.labels),
  );
  return c.json(
    { data: { id, upload_path: `/v1/gestures/training-sets/${id}/data`, dataset_hash: body.dataset_hash } },
    201,
  );
});

/** Upload do dataset (ndjson ≤ 20 MiB) verificado por SHA-256 declarado; guardado no R2 privado do tenant. */
gestureRoutes.put('/training-sets/:id/data', async (c) => {
  const p = c.get('principal');
  const set = await first<{ id: string; r2_key: string; dataset_hash: string }>(
    c.env.DB,
    'SELECT id,r2_key,dataset_hash FROM gesture_training_sets WHERE id=? AND tenant_id=? AND owner_user_id=? AND deleted_at IS NULL',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!set) throw new PulseError('NOT_FOUND');
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > 20 * 1024 * 1024)
    throw new PulseError('VALIDATION_ERROR', 'tamanho inválido');
  if ((await sha256Hex(buf)) !== set.dataset_hash)
    throw new PulseError('VALIDATION_ERROR', 'SHA-256 não confere');
  await c.env.RAW_BUCKET.put(set.r2_key, buf, { httpMetadata: { contentType: 'application/x-ndjson' } });
  return c.json({ data: { stored: true } });
});

gestureRoutes.delete('/training-sets/:id', async (c) => {
  const p = c.get('principal');
  const set = await first<{ id: string; r2_key: string }>(
    c.env.DB,
    'SELECT id,r2_key FROM gesture_training_sets WHERE id=? AND tenant_id=? AND owner_user_id=? AND deleted_at IS NULL',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!set) throw new PulseError('NOT_FOUND');
  await c.env.RAW_BUCKET.delete(set.r2_key);
  await run(
    c.env.DB,
    'UPDATE gesture_training_sets SET deleted_at=? WHERE id=?',
    new Date().toISOString(),
    set.id,
  );
  return c.json({ data: { deleted: true } });
});

gestureRoutes.get('/training-sets', async (c) => {
  const p = c.get('principal');
  const rows = await all(
    c.env.DB,
    'SELECT id,device_id,sensor_source,dataset_hash,sample_count,labels_json,created_at FROM gesture_training_sets WHERE tenant_id=? AND owner_user_id=? AND deleted_at IS NULL ORDER BY created_at DESC',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows, next_cursor: null });
});

const ModelMetrics = z.strictObject({
  macro_precision: z.number().min(0).max(1),
  macro_recall: z.number().min(0).max(1),
  balanced_accuracy: z.number().min(0).max(1),
  false_activations_per_hour: z.number().min(0),
  latency_p95_ms: z.number().min(0),
  holdout_sessions: z.number().int().min(1),
  confusion_matrix: z.array(z.array(z.number().int().min(0))).max(20),
  labels: z.array(z.string()).max(20),
});

/** Modelo treinado no aparelho (inferência local preferida) registra métricas de holdout por sessão. */
gestureRoutes.post('/models', async (c) => {
  const p = c.get('principal');
  const body = await parseBody(
    c,
    z.strictObject({
      model_version: z.string().min(1).max(40),
      algorithm: z.enum(['dtw_template', 'feature_knn', 'tflite_cnn']),
      training_set_id: z.string().optional(),
      sensor_source: z.enum(['miband3_raw', 'android_imu', 'synthetic_lab']),
      metrics: ModelMetrics,
    }),
  );
  const id = newId('gmd');
  await run(
    c.env.DB,
    `INSERT INTO gesture_models(id,tenant_id,owner_user_id,model_version,algorithm,training_set_id,metrics_json,state,created_at,sensor_source) VALUES(?,?,?,?,?,?,?,'evaluated',?,?)`,
    id,
    p.tenantId,
    p.userId,
    body.model_version,
    body.algorithm,
    body.training_set_id ?? null,
    JSON.stringify(body.metrics),
    new Date().toISOString(),
    body.sensor_source,
  );
  return c.json({ data: { id, state: 'evaluated' } }, 201);
});

gestureRoutes.get('/models', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    model_version: string;
    algorithm: string;
    state: string;
    sensor_source: string;
    metrics_json: string;
    created_at: string;
  }>(
    c.env.DB,
    'SELECT id,model_version,algorithm,state,sensor_source,metrics_json,created_at FROM gesture_models WHERE tenant_id=? AND owner_user_id=? ORDER BY created_at DESC',
    p.tenantId,
    p.userId,
  );
  return c.json({
    data: rows.map((r) => ({ ...r, metrics: JSON.parse(r.metrics_json), metrics_json: undefined })),
    next_cursor: null,
    meta: { activation_gate: ACTIVATION_GATE },
  });
});

/** Ativação somente se o modelo cumpre o gate; uma versão ativa por titular (rollback = ativar anterior). */
gestureRoutes.post('/models/:id/activate', async (c) => {
  const p = c.get('principal');
  const m = await first<{ id: string; metrics_json: string; sensor_source: string }>(
    c.env.DB,
    'SELECT id,metrics_json,sensor_source FROM gesture_models WHERE id=? AND tenant_id=? AND owner_user_id=?',
    c.req.param('id'),
    p.tenantId,
    p.userId,
  );
  if (!m) throw new PulseError('NOT_FOUND');
  const metrics = JSON.parse(m.metrics_json) as z.infer<typeof ModelMetrics>;
  const failures = [
    metrics.macro_precision < ACTIVATION_GATE.macro_precision && 'precisão',
    metrics.macro_recall < ACTIVATION_GATE.macro_recall && 'revocação',
    metrics.false_activations_per_hour > ACTIVATION_GATE.max_false_activations_per_hour && 'falsas ativações',
  ].filter(Boolean);
  if (failures.length)
    throw new PulseError('CONFLICT', `modelo abaixo do critério de habilitação: ${failures.join(', ')}`);
  if (m.sensor_source === 'synthetic_lab')
    throw new PulseError(
      'CONFLICT',
      'modelos treinados com dados sintéticos não podem atuar em equipamentos',
    );
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE gesture_models SET state='retired' WHERE tenant_id=? AND owner_user_id=? AND state='active'`,
    ).bind(p.tenantId, p.userId),
    c.env.DB.prepare(`UPDATE gesture_models SET state='active' WHERE id=?`).bind(m.id),
  ]);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'gesture.model_activate',
    resourceType: 'gesture_model',
    resourceId: m.id,
  });
  return c.json({ data: { id: m.id, state: 'active' } });
});

gestureRoutes.get('/mappings', async (c) => {
  const p = c.get('principal');
  const rows = await all<{
    id: string;
    gesture_key: string;
    equipment_id: string;
    action: string;
    args_json: string;
    min_confidence: number;
    requires_approval: number;
    enabled: number;
  }>(c.env.DB, 'SELECT * FROM gesture_mappings WHERE tenant_id=? AND owner_user_id=?', p.tenantId, p.userId);
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      gesture_key: r.gesture_key,
      equipment_id: r.equipment_id,
      action: r.action,
      args: JSON.parse(r.args_json),
      min_confidence: r.min_confidence,
      requires_approval: r.requires_approval === 1,
      enabled: r.enabled === 1,
    })),
    next_cursor: null,
  });
});

gestureRoutes.post('/mappings', async (c) => {
  const p = c.get('principal');
  const body = await parseBody(c, CreateMappingRequest);
  const eq = await first<{ safety_class: string; capabilities_json: string }>(
    c.env.DB,
    'SELECT safety_class,capabilities_json FROM equipment WHERE id=? AND tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
    body.equipment_id,
    p.tenantId,
    p.userId,
  );
  if (!eq) throw new PulseError('NOT_FOUND');
  // Nunca mapear gesto diretamente a operação safety-critical (docs/07).
  if (eq.safety_class === 'safety_critical') throw new PulseError('SAFETY_BLOCKED');
  if (!(JSON.parse(eq.capabilities_json) as Array<{ action: string }>).some((x) => x.action === body.action))
    throw new PulseError('VALIDATION_ERROR', 'ação fora da allowlist do equipamento');
  const active = await first(
    c.env.DB,
    `SELECT 1 FROM gesture_models WHERE tenant_id=? AND owner_user_id=? AND state='active'`,
    p.tenantId,
    p.userId,
  );
  const id = newId('gmp');
  await run(
    c.env.DB,
    'INSERT INTO gesture_mappings(id,tenant_id,owner_user_id,gesture_key,equipment_id,action,args_json,min_confidence,requires_approval,enabled) VALUES(?,?,?,?,?,?,?,?,?,?)',
    id,
    p.tenantId,
    p.userId,
    body.gesture_key,
    body.equipment_id,
    body.action,
    JSON.stringify(body.args),
    body.min_confidence,
    body.requires_approval ? 1 : 0,
    active ? 1 : 0,
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'gesture.mapping_create',
    resourceType: 'gesture_mapping',
    resourceId: id,
    metadata: { gesture: body.gesture_key, action: body.action },
  });
  return c.json({ data: { id, ...body, enabled: Boolean(active) } }, 201);
});

gestureRoutes.get('/metrics', async (c) => {
  const p = c.get('principal');
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const cmds = await all<{ status: string; n: number }>(
    c.env.DB,
    `SELECT cc.status, COUNT(*) n FROM control_commands cc JOIN control_sessions cs ON cs.id=cc.session_id WHERE cs.tenant_id=? AND cs.owner_user_id=? AND cc.issued_at>=? AND json_extract(cc.payload_json,'$.origin')='gesture' GROUP BY cc.status`,
    p.tenantId,
    p.userId,
    since,
  );
  const model = await first<{ model_version: string; metrics_json: string }>(
    c.env.DB,
    `SELECT model_version,metrics_json FROM gesture_models WHERE tenant_id=? AND owner_user_id=? AND state='active'`,
    p.tenantId,
    p.userId,
  );
  return c.json({
    data: {
      window_days: 7,
      gesture_commands: Object.fromEntries(cmds.map((x) => [x.status, x.n])),
      active_model: model ? { version: model.model_version, metrics: JSON.parse(model.metrics_json) } : null,
    },
  });
});
