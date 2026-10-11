import { Hono } from 'hono';
import { AutomationAst, SimulateRequest, UpdateAutomationRequest } from '@pulse/contracts';
import { PulseError, newId, requiredConsents, riskLevel, simulate, type AutomationEvent } from '@pulse/core';
import { syntheticHeartRateSeries } from '@pulse/test-fixtures';
import type { AppEnv, Env } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireScope } from '../lib/auth';
import { all, first, run } from '../lib/db';
import { parseBody } from '../lib/http';
import { TICK_TRIGGERS, buildContext } from '../services/automations';
import { activeConsents } from '../services/consent';
import type { Principal } from '@pulse/core';

export const automationRoutes = new Hono<AppEnv>();
automationRoutes.use('*', requireAuth);

interface Row {
  id: string;
  title: string;
  enabled: number;
  version: number;
  risk_level: string;
  ast_json: string;
  created_at: string;
  updated_at: string;
}
const dto = (r: Row) => ({
  id: r.id,
  title: r.title,
  enabled: r.enabled === 1,
  version: r.version,
  risk_level: r.risk_level,
  ast: JSON.parse(r.ast_json),
  created_at: r.created_at,
  updated_at: r.updated_at,
});

/** Validação semântica além do schema: recursos do próprio titular e gates de hardware/segurança. */
async function validateAst(env: Env, p: Principal, ast: AutomationAst): Promise<void> {
  for (const a of ast.actions) {
    if (a.type === 'control_discrete_when_armed' || a.type === 'request_control_approval') {
      const eq = await first<{ safety_class: string; capabilities_json: string }>(
        env.DB,
        'SELECT safety_class,capabilities_json FROM equipment WHERE id=? AND tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
        a.equipment_id,
        p.tenantId,
        p.userId,
      );
      if (!eq) throw new PulseError('VALIDATION_ERROR', `equipamento ${a.equipment_id} inexistente`);
      if (eq.safety_class === 'safety_critical')
        throw new PulseError('SAFETY_BLOCKED', 'equipamento safety_critical não pode ser automatizado');
      const actions = (JSON.parse(eq.capabilities_json) as Array<{ action: string }>).map((c) => c.action);
      if (!actions.includes(a.action))
        throw new PulseError('VALIDATION_ERROR', `ação ${a.action} fora da allowlist do equipamento`);
    }
    if (
      a.type === 'send_signed_webhook' &&
      !(await first(env.DB, 'SELECT 1 FROM webhooks WHERE id=? AND tenant_id=?', a.webhook_id, p.tenantId))
    ) {
      throw new PulseError('VALIDATION_ERROR', 'webhook inexistente');
    }
    if (
      a.type === 'vibrate_band' &&
      !(await first(
        env.DB,
        'SELECT 1 FROM devices WHERE id=? AND tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
        a.device_id,
        p.tenantId,
        p.userId,
      ))
    ) {
      throw new PulseError('VALIDATION_ERROR', 'dispositivo inexistente');
    }
  }
  if (ast.trigger.kind === 'gesture_detected') {
    const model = await first(
      env.DB,
      `SELECT 1 FROM gesture_models WHERE tenant_id=? AND owner_user_id=? AND state='active'`,
      p.tenantId,
      p.userId,
    );
    if (!model) throw new PulseError('CAPABILITY_UNVERIFIED', 'nenhum modelo de gesto ativo e validado');
  }
  if (
    ast.trigger.kind === 'external_webhook_received' &&
    !(await first(
      env.DB,
      'SELECT 1 FROM integrations WHERE id=? AND tenant_id=?',
      ast.trigger.integration_id,
      p.tenantId,
    ))
  ) {
    throw new PulseError('VALIDATION_ERROR', 'integração inexistente');
  }
  if (ast.enabled) {
    const missing = requiredConsents(ast);
    const consents = await activeConsents(env.DB, p.tenantId, p.userId);
    const lacking = missing.filter((m) => !consents.has(m));
    if (lacking.length)
      throw new PulseError('CONSENT_REQUIRED', `ative os consentimentos: ${lacking.join(', ')}`);
  }
}

automationRoutes.get('/', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'automations:read');
  const rows = await all<Row>(
    c.env.DB,
    'SELECT id,title,enabled,version,risk_level,ast_json,created_at,updated_at FROM automations WHERE tenant_id=? AND owner_user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200',
    p.tenantId,
    p.userId,
  );
  const killed = await c.env.CONFIG_KV.get(`automations-killed:${p.tenantId}`);
  return c.json({ data: rows.map(dto), next_cursor: null, meta: { kill_switch: Boolean(killed) } });
});

/** Modelos prontos (F218): sempre criados desativados para revisão. */
automationRoutes.get('/templates', (c) =>
  c.json({
    data: [
      {
        id: 'inactivity',
        title: 'Inatividade prolongada',
        ast: {
          v: 1,
          title: 'Inatividade prolongada',
          enabled: false,
          trigger: { kind: 'inactivity_duration', minutes: 120 },
          conditions: {
            op: 'and',
            rules: [{ field: 'time_local', op: 'between', value: ['08:00', '22:00'] }],
          },
          cooldown_ms: 21600000,
          actions: [{ type: 'send_push', target: 'owner', template_id: 'inactivity_nudge' }],
        },
      },
      {
        id: 'battery',
        title: 'Bateria da pulseira baixa',
        ast: {
          v: 1,
          title: 'Bateria baixa',
          enabled: false,
          trigger: { kind: 'battery_low', below_percent: 15 },
          cooldown_ms: 43200000,
          actions: [{ type: 'send_push', target: 'owner', template_id: 'battery_low' }],
        },
      },
      {
        id: 'sync',
        title: 'Sincronização atrasada',
        ast: {
          v: 1,
          title: 'Sincronização atrasada',
          enabled: false,
          trigger: { kind: 'sync_stale', minutes: 360 },
          cooldown_ms: 21600000,
          actions: [{ type: 'send_push', target: 'owner', template_id: 'sync_stale' }],
        },
      },
      {
        id: 'hr_high',
        title: 'FC acima do limite pessoal',
        ast: {
          v: 1,
          title: 'FC acima do limite',
          enabled: false,
          trigger: { kind: 'heart_rate_threshold', above: 120, sustain_s: 300, hysteresis_bpm: 5 },
          conditions: { op: 'and', rules: [{ field: 'quality', op: 'eq', value: 'valid' }] },
          cooldown_ms: 3600000,
          actions: [{ type: 'send_push', target: 'owner', template_id: 'hr_high' }],
        },
      },
      {
        id: 'weekly',
        title: 'Relatório semanal',
        ast: {
          v: 1,
          title: 'Relatório semanal',
          enabled: false,
          trigger: { kind: 'cron_schedule', cron: '0 9 * * 1', timezone: 'America/Sao_Paulo' },
          cooldown_ms: 0,
          actions: [{ type: 'generate_report', period: 'weekly' }],
        },
      },
    ],
    next_cursor: null,
  }),
);

automationRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'automations:write');
  const ast = await parseBody(c, AutomationAst);
  await validateAst(c.env, p, ast);
  const id = newId('aut');
  const now = new Date().toISOString();
  const risk = riskLevel(ast);
  await run(
    c.env.DB,
    'INSERT INTO automations(id,tenant_id,owner_user_id,title,enabled,version,ast_json,cooldown_ms,created_at,updated_at,risk_level,expires_at) VALUES(?,?,?,?,?,1,?,?,?,?,?,?)',
    id,
    p.tenantId,
    p.userId,
    ast.title,
    ast.enabled ? 1 : 0,
    JSON.stringify(ast),
    ast.cooldown_ms,
    now,
    now,
    risk,
    ast.expires_at ?? null,
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'automation.create',
    resourceType: 'automation',
    resourceId: id,
    metadata: { trigger: ast.trigger.kind, actions: ast.actions.map((a) => a.type), risk },
  });
  return c.json(
    { data: dto((await first<Row>(c.env.DB, 'SELECT * FROM automations WHERE id=?', id)) as Row) },
    201,
  );
});

async function load(env: Env, p: Principal, id: string): Promise<Row> {
  const r = await first<Row>(
    env.DB,
    'SELECT id,title,enabled,version,risk_level,ast_json,created_at,updated_at FROM automations WHERE id=? AND tenant_id=? AND owner_user_id=? AND deleted_at IS NULL',
    id,
    p.tenantId,
    p.userId,
  );
  if (!r) throw new PulseError('NOT_FOUND');
  return r;
}

automationRoutes.get('/:id', async (c) =>
  c.json({ data: dto(await load(c.env, c.get('principal'), c.req.param('id'))) }),
);

/** Edição com controle otimista de versão (docs/11) — versão nova reavalia consentimentos. */
automationRoutes.patch('/:id', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'automations:write');
  const r = await load(c.env, p, c.req.param('id'));
  const body = await parseBody(c, UpdateAutomationRequest);
  if (body.expected_version !== r.version) throw new PulseError('CONFLICT', `versão atual é ${r.version}`);
  const ast = AutomationAst.parse({
    ...(body.ast ?? JSON.parse(r.ast_json)),
    ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
  });
  await validateAst(c.env, p, ast);
  const now = new Date().toISOString();
  const res = await run(
    c.env.DB,
    'UPDATE automations SET title=?, enabled=?, version=version+1, ast_json=?, cooldown_ms=?, risk_level=?, expires_at=?, updated_at=? WHERE id=? AND version=?',
    ast.title,
    ast.enabled ? 1 : 0,
    JSON.stringify(ast),
    ast.cooldown_ms,
    riskLevel(ast),
    ast.expires_at ?? null,
    now,
    r.id,
    r.version,
  );
  if (!res.meta.changes) throw new PulseError('CONFLICT');
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'automation.update',
    resourceType: 'automation',
    resourceId: r.id,
    metadata: { version: r.version + 1, enabled: ast.enabled },
  });
  return c.json({ data: dto(await load(c.env, p, r.id)) });
});

automationRoutes.delete('/:id', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'automations:write');
  const r = await load(c.env, p, c.req.param('id'));
  await run(
    c.env.DB,
    'UPDATE automations SET enabled=0, deleted_at=?, updated_at=? WHERE id=?',
    new Date().toISOString(),
    new Date().toISOString(),
    r.id,
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'automation.delete',
    resourceType: 'automation',
    resourceId: r.id,
  });
  return c.json({ data: { deleted: true } });
});

/** Simulação sem efeitos colaterais (F214, A39): histórico consentido ou série sintética rotulada. */
automationRoutes.post('/:id/simulate', async (c) => {
  const p = c.get('principal');
  const r = await load(c.env, p, c.req.param('id'));
  const body = await parseBody(c, SimulateRequest);
  const ast = AutomationAst.parse(JSON.parse(r.ast_json));
  const to = new Date();
  const from = new Date(to.getTime() - body.days * 86400_000);
  const events: AutomationEvent[] = [];
  if (body.source === 'synthetic') {
    for (const s of syntheticHeartRateSeries({
      start: from,
      minutes: body.days * 1440,
      everyMinutes: 30,
      seed: 7,
    })) {
      events.push({
        id: s.reading_id,
        kind: 'telemetry',
        at: s.observed_at,
        telemetryKind: 'heart_rate_bpm',
        value: s.value,
        quality: 'measured',
      });
    }
  } else {
    const devs = (
      await all<{ id: string }>(
        c.env.DB,
        'SELECT id FROM devices WHERE tenant_id=? AND owner_user_id=?',
        p.tenantId,
        p.userId,
      )
    ).map((d) => d.id);
    if (devs.length) {
      const kinds =
        ast.trigger.kind === 'battery_low' ? ['battery_percent'] : ['heart_rate_bpm', 'steps_delta'];
      const rows = await all<{
        reading_id: string;
        kind: string;
        observed_at: string;
        value_num: number;
        quality: 'measured';
      }>(
        c.env.DB,
        `SELECT reading_id,kind,observed_at,value_num,quality FROM telemetry_readings WHERE tenant_id=? AND device_id IN (${devs.map(() => '?').join(',')}) AND kind IN (${kinds.map(() => '?').join(',')}) AND observed_at>=? ORDER BY observed_at LIMIT 300`,
        p.tenantId,
        ...devs,
        ...kinds,
        from.toISOString(),
      );
      for (const x of rows)
        events.push({
          id: x.reading_id,
          kind: 'telemetry',
          at: x.observed_at,
          telemetryKind: x.kind,
          value: x.value_num,
          quality: x.quality,
        });
    }
  }
  if (TICK_TRIGGERS.has(ast.trigger.kind)) {
    const step = ast.trigger.kind === 'cron_schedule' || ast.trigger.kind === 'time_window' ? 15 : 60;
    for (let t = from.getTime(); t < to.getTime(); t += step * 60_000)
      events.push({ id: `tick_${t}`, kind: 'tick', at: new Date(t).toISOString() });
  }
  const sample = events.slice(-200);
  const timeline = [];
  for (const e of sample)
    timeline.push({
      event: e,
      ctx:
        body.source === 'synthetic'
          ? { timezone: 'America/Sao_Paulo', activeConsents: new Set<never>() }
          : await buildContext(c.env, p.tenantId, p.userId, new Date(e.at), ast),
    });
  const steps = simulate(ast, timeline);
  const wouldRun = steps.filter((s) => s.outcome === 'would_run');
  return c.json({
    data: {
      automation_id: r.id,
      version: r.version,
      source: body.source,
      synthetic: body.source === 'synthetic',
      evaluated_events: steps.length,
      truncated: events.length > sample.length,
      would_run: wouldRun.length,
      steps: steps.filter((s) => s.outcome !== 'no_match').slice(-100),
    },
  });
});

automationRoutes.get('/:id/executions', async (c) => {
  const p = c.get('principal');
  const r = await load(c.env, p, c.req.param('id'));
  const rows = await all<{
    id: string;
    source_event_id: string;
    rule_version: number;
    status: string;
    started_at: string;
    finished_at: string | null;
    error_code: string | null;
    explanation: string | null;
    details_json: string;
  }>(
    c.env.DB,
    'SELECT id,source_event_id,rule_version,status,started_at,finished_at,error_code,explanation,details_json FROM automation_runs WHERE automation_id=? AND tenant_id=? ORDER BY started_at DESC LIMIT 200',
    r.id,
    p.tenantId,
  );
  return c.json({
    data: rows.map((x) => ({
      ...x,
      details_json: undefined,
      actions: (JSON.parse(x.details_json) as { actions?: unknown[] }).actions ?? [],
      automation_id: r.id,
    })),
    next_cursor: null,
  });
});

/** Kill switch (F217): pausa imediatamente todas as automações do tenant. */
automationRoutes.post('/kill-switch', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'automations:write');
  const { enabled } = (await c.req.json().catch(() => ({ enabled: true }))) as { enabled?: boolean };
  if (enabled === false) await c.env.CONFIG_KV.delete(`automations-killed:${p.tenantId}`);
  else await c.env.CONFIG_KV.put(`automations-killed:${p.tenantId}`, new Date().toISOString());
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: enabled === false ? 'automation.kill_switch_off' : 'automation.kill_switch_on',
    resourceType: 'tenant',
    resourceId: p.tenantId,
  });
  return c.json({ data: { kill_switch: enabled !== false } });
});
