import { AutomationAst, type Action, type ConsentPurpose } from '@pulse/contracts';
import {
  PulseError,
  cooldownActive,
  evaluateConditions,
  localParts,
  matchTrigger,
  newId,
  requiredConsents,
  type AutomationEvent,
  type EvalContext,
} from '@pulse/core';
import type { Env } from '../env';
import { all, first, run } from '../lib/db';
import { activeConsents } from './consent';
import { notify } from './notify';

/** Gatilhos avaliados pelo agendador (eventos `tick`). */
export const TICK_TRIGGERS = new Set(['inactivity_duration', 'sync_stale', 'cron_schedule', 'time_window']);

const EVENT_TRIGGERS: Record<AutomationEvent['kind'], string[]> = {
  telemetry: ['heart_rate_threshold', 'battery_low', 'steps_delta'],
  tick: [...TICK_TRIGGERS],
  sleep_started: ['sleep_started'],
  sleep_ended: ['sleep_ended'],
  device_connected: ['device_connected'],
  device_disconnected: ['device_disconnected'],
  gateway_online: ['gateway_online'],
  gateway_offline: ['gateway_offline'],
  gesture: ['gesture_detected'],
  alert_created: ['alert_created'],
  report_generated: ['report_generated'],
  webhook: ['external_webhook_received'],
};

/** Contexto observado do titular para avaliar condições (sem leituras inventadas). */
export async function buildContext(
  env: Env,
  tenantId: string,
  userId: string,
  at: Date,
  ast?: AutomationAst,
): Promise<EvalContext> {
  const u = await first<{ timezone: string }>(env.DB, 'SELECT timezone FROM users WHERE id=?', userId);
  const tz = u?.timezone ?? 'America/Sao_Paulo';
  const devs = (
    await all<{ id: string }>(
      env.DB,
      'SELECT id FROM devices WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
      tenantId,
      userId,
    )
  ).map((d) => d.id);
  const inDev = devs.length ? `IN (${devs.map(() => '?').join(',')})` : 'IN (NULL)';
  const atIso = at.toISOString();
  const latest = async (kind: string) =>
    first<{ value_num: number; observed_at: string }>(
      env.DB,
      `SELECT value_num,observed_at FROM telemetry_readings WHERE tenant_id=? AND device_id ${inDev} AND kind=? AND observed_at<=? AND quality IN ('measured','estimated') ORDER BY observed_at DESC LIMIT 1`,
      tenantId,
      ...devs,
      kind,
      atIso,
    );
  const hr = await latest('heart_rate_bpm');
  const bat = await latest('battery_percent');
  const sustain = ast?.trigger.kind === 'heart_rate_threshold' ? ast.trigger.sustain_s : 0;
  const recent = sustain
    ? await all<{ observed_at: string; value_num: number }>(
        env.DB,
        `SELECT observed_at,value_num FROM telemetry_readings WHERE tenant_id=? AND device_id ${inDev} AND kind='heart_rate_bpm' AND observed_at>? AND observed_at<=? AND quality IN ('measured','estimated') ORDER BY observed_at`,
        tenantId,
        ...devs,
        new Date(at.getTime() - sustain * 1000).toISOString(),
        atIso,
      )
    : [];
  const local = localParts(at, tz);
  // Início do dia local aproximado em UTC (busca a meia-noite local em passos de 15 min, robusto a DST).
  let dayStart = new Date(at.getTime() - (local.hour * 60 + local.minute) * 60_000);
  while (localParts(dayStart, tz).dateKey !== local.dateKey)
    dayStart = new Date(dayStart.getTime() + 15 * 60_000);
  const stepsToday = await first<{ s: number | null }>(
    env.DB,
    `SELECT SUM(value_num) s FROM telemetry_readings WHERE tenant_id=? AND device_id ${inDev} AND kind='steps_delta' AND observed_at>=? AND observed_at<=?`,
    tenantId,
    ...devs,
    dayStart.toISOString(),
    atIso,
  );
  const windowMin = ast?.trigger.kind === 'steps_delta' ? ast.trigger.window_minutes : null;
  const stepsWindow = windowMin
    ? await first<{ s: number | null }>(
        env.DB,
        `SELECT SUM(value_num) s FROM telemetry_readings WHERE tenant_id=? AND device_id ${inDev} AND kind='steps_delta' AND observed_at>? AND observed_at<=?`,
        tenantId,
        ...devs,
        new Date(at.getTime() - windowMin * 60_000).toISOString(),
        atIso,
      )
    : null;
  const lastActivity = await first<{ observed_at: string }>(
    env.DB,
    `SELECT observed_at FROM telemetry_readings WHERE tenant_id=? AND device_id ${inDev} AND kind='steps_delta' AND value_num>0 AND observed_at<=? ORDER BY observed_at DESC LIMIT 1`,
    tenantId,
    ...devs,
    atIso,
  );
  const status = await first<{ last_sync_at: string | null; connected: number }>(
    env.DB,
    `SELECT MAX(last_sync_at) last_sync_at, MAX(CASE WHEN connection_state='connected' THEN 1 ELSE 0 END) connected FROM device_status WHERE device_id ${inDev}`,
    ...devs,
  );
  return {
    timezone: tz,
    heartRateBpm: hr?.value_num,
    recentHeartRates: recent.map((r) => ({ at: r.observed_at, bpm: r.value_num })),
    stepsToday: stepsToday?.s ?? undefined,
    stepsInWindow: stepsWindow ? (stepsWindow.s ?? 0) : undefined,
    batteryPercent: bat?.value_num,
    deviceConnected: devs.length ? status?.connected === 1 : undefined,
    activeConsents: await activeConsents(env.DB, tenantId, userId),
    minutesSinceLastSync: status?.last_sync_at
      ? Math.floor((at.getTime() - new Date(status.last_sync_at).getTime()) / 60000)
      : undefined,
    lastActivityAt: lastActivity?.observed_at,
  };
}

interface AutomationRow {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  title: string;
  version: number;
  ast_json: string;
  enabled: number;
}

interface ActionOutcome {
  type: Action['type'];
  status: 'completed' | 'rejected' | 'failed';
  code?: string;
  detail?: string;
}

async function executeAction(
  env: Env,
  a: Action,
  r: AutomationRow,
  runId: string,
  explanation: string,
): Promise<ActionOutcome> {
  const t = r.tenant_id;
  const owner = r.owner_user_id;
  switch (a.type) {
    case 'send_push':
    case 'send_email':
      await notify(env, {
        tenantId: t,
        recipientUserId: owner,
        kind: `automation:${a.template_id}`,
        title: r.title,
        body: explanation,
        priority: 'normal',
        data: { automation_id: r.id, run_id: runId },
      });
      return { type: a.type, status: 'completed' };
    case 'notify_family_if_granted': {
      const grants = await all<{ grantee_user_id: string; scope_json: string }>(
        env.DB,
        `SELECT grantee_user_id,scope_json FROM share_grants WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)`,
        t,
        owner,
        new Date().toISOString(),
      );
      let n = 0;
      for (const g of grants) {
        if (!(JSON.parse(g.scope_json) as { metrics: string[] }).metrics.includes('alerts')) continue;
        await notify(env, {
          tenantId: t,
          recipientUserId: g.grantee_user_id,
          kind: `family:${a.template_id}`,
          title: r.title,
          body: 'Um alerta compartilhado com você foi disparado.',
          priority: 'normal',
          data: { automation_id: r.id },
        });
        n += 1;
      }
      return n
        ? { type: a.type, status: 'completed' }
        : { type: a.type, status: 'rejected', code: 'NO_ACTIVE_GRANT' };
    }
    case 'create_checkin': {
      const id = newId('chk');
      await run(
        env.DB,
        `INSERT INTO checkins(id,tenant_id,owner_user_id,kind,status,requested_at,details_json) VALUES(?,?,?,?, 'requested',?,?)`,
        id,
        t,
        owner,
        a.kind,
        new Date().toISOString(),
        JSON.stringify({ automation_id: r.id }),
      );
      await notify(env, {
        tenantId: t,
        recipientUserId: owner,
        kind: 'checkin_request',
        title: 'Está tudo bem?',
        body: 'Confirme seu check-in no app.',
        priority: 'high',
        data: { checkin_id: id },
      });
      return { type: a.type, status: 'completed' };
    }
    case 'generate_report': {
      const { buildReport } = await import('../routes/reports');
      await buildReport(env, t, owner, a.period);
      return { type: a.type, status: 'completed' };
    }
    case 'schedule_reminder': {
      const id = await notify(env, {
        tenantId: t,
        recipientUserId: owner,
        kind: `reminder:${a.template_id}`,
        title: r.title,
        body: `Lembrete agendado (${a.delay_minutes} min).`,
        priority: 'low',
      });
      return id ? { type: a.type, status: 'completed' } : { type: a.type, status: 'rejected', code: 'MUTED' };
    }
    case 'send_signed_webhook': {
      const wh = await first<{ id: string; enabled: number }>(
        env.DB,
        'SELECT id,enabled FROM webhooks WHERE id=? AND tenant_id=?',
        a.webhook_id,
        t,
      );
      if (!wh || wh.enabled !== 1) return { type: a.type, status: 'rejected', code: 'WEBHOOK_DISABLED' };
      const deliveryId = newId('evt');
      const now = new Date().toISOString();
      await run(
        env.DB,
        `INSERT OR IGNORE INTO webhook_deliveries(id,tenant_id,webhook_id,event_id,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)`,
        deliveryId,
        t,
        wh.id,
        runId,
        now,
        now,
      );
      await env.JOBS_QUEUE.send({
        kind: 'webhook.deliver',
        event_id: deliveryId,
        tenant_id: t,
        delivery_id: deliveryId,
      });
      return { type: a.type, status: 'completed' };
    }
    case 'call_mcp_allowlisted': {
      const { MCP_TOOLS } = await import('./mcp');
      const tool = MCP_TOOLS.find((x) => x.name === a.tool);
      if (!tool) return { type: a.type, status: 'rejected', code: 'TOOL_NOT_ALLOWLISTED' };
      if (tool.mutating) {
        await notify(env, {
          tenantId: t,
          recipientUserId: owner,
          kind: 'approval_request',
          title: 'Aprovação necessária',
          body: `A automação "${r.title}" propõe usar ${tool.name}. Revise no app.`,
          priority: 'normal',
        });
        return { type: a.type, status: 'rejected', code: 'APPROVAL_REQUIRED' };
      }
      return { type: a.type, status: 'completed', detail: tool.name };
    }
    case 'propose_jev_decision':
      // Sem endpoint/contrato JEV fornecido: bloqueio transparente (docs/13).
      return { type: a.type, status: 'rejected', code: 'INTEGRATION_BLOCKED' };
    case 'request_control_approval':
      await notify(env, {
        tenantId: t,
        recipientUserId: owner,
        kind: 'control_approval',
        title: 'Ação de equipamento proposta',
        body: `"${r.title}" sugere ${a.action}. Arme o controle no app para aprovar.`,
        priority: 'high',
        data: { equipment_id: a.equipment_id, action: a.action },
      });
      return { type: a.type, status: 'completed' };
    case 'control_discrete_when_armed': {
      const { routeControlFromAutomation } = await import('./control');
      return routeControlFromAutomation(env, {
        tenantId: t,
        ownerUserId: owner,
        equipmentId: a.equipment_id,
        action: a.action,
        args: a.arguments,
        runId,
      });
    }
    case 'vibrate_band': {
      const cap = await first(
        env.DB,
        `SELECT 1 FROM device_capabilities c JOIN devices d ON d.id=c.device_id WHERE c.device_id=? AND d.owner_user_id=? AND c.capability='vibration_alert' AND c.support_state='SUPPORTED'`,
        a.device_id,
        owner,
      );
      if (!cap) return { type: a.type, status: 'rejected', code: 'CAPABILITY_UNVERIFIED' };
      const now = new Date();
      await run(
        env.DB,
        `INSERT OR IGNORE INTO device_commands(id,tenant_id,device_id,requested_by,action,args_json,idempotency_key,status,expires_at,created_at) VALUES(?,?,?,?,'vibrate',?,?,'pending',?,?)`,
        newId('cmd'),
        t,
        a.device_id,
        `automation:${r.id}`,
        JSON.stringify({ pattern: a.pattern }),
        `auto-${runId}`,
        new Date(now.getTime() + 120_000).toISOString(),
        now.toISOString(),
      );
      return { type: a.type, status: 'completed' };
    }
    case 'export_data': {
      const id = newId('exp');
      await run(
        env.DB,
        `INSERT INTO exports(id,tenant_id,owner_user_id,kind,state,created_at) VALUES(?,?,?,?,'queued',?)`,
        id,
        t,
        owner,
        a.kind,
        new Date().toISOString(),
      );
      await env.JOBS_QUEUE.send({ kind: 'export.build', event_id: id, tenant_id: t, export_id: id });
      return { type: a.type, status: 'completed' };
    }
  }
}

/**
 * Avalia um evento contra as automações ativas do titular (at-least-once → dedupe por
 * automação+evento+versão; políticas e consentimento reavaliados no momento da execução).
 */
export async function processAutomationEvent(
  env: Env,
  tenantId: string,
  ownerUserId: string,
  event: AutomationEvent,
): Promise<number> {
  const kinds = EVENT_TRIGGERS[event.kind] ?? [];
  if (!kinds.length) return 0;
  const rules = await all<AutomationRow>(
    env.DB,
    `SELECT id,tenant_id,owner_user_id,title,version,ast_json,enabled FROM automations WHERE tenant_id=? AND owner_user_id=? AND enabled=1 AND deleted_at IS NULL`,
    tenantId,
    ownerUserId,
  );
  const kill = await env.CONFIG_KV.get(`automations-killed:${tenantId}`);
  if (kill) return 0;
  let fired = 0;
  const at = new Date(event.at);
  for (const r of rules) {
    const ast = AutomationAst.parse(JSON.parse(r.ast_json));
    if (!kinds.includes(ast.trigger.kind)) continue;
    if (ast.expires_at && new Date(ast.expires_at) <= at) continue;
    const st = await first<{
      last_run_at: string | null;
      day_key: string | null;
      runs_today: number;
      previously_above: number;
    }>(
      env.DB,
      'SELECT last_run_at,day_key,runs_today,previously_above FROM automation_state WHERE automation_id=?',
      r.id,
    );
    const ctx = await buildContext(env, tenantId, ownerUserId, at, ast);
    ctx.previouslyAboveThreshold = st?.previously_above === 1;
    const t = matchTrigger(ast.trigger, event, ctx);
    if (
      ast.trigger.kind === 'heart_rate_threshold' &&
      ast.trigger.above !== undefined &&
      event.value !== undefined
    ) {
      // Histerese: rearma somente após cair abaixo de (limiar − histerese).
      const above =
        event.value > ast.trigger.above - (st?.previously_above === 1 ? ast.trigger.hysteresis_bpm : 0);
      await upsertState(env, r, {
        previously_above: above && (t.matched || st?.previously_above === 1) ? 1 : 0,
      });
    }
    if (!t.matched) continue;
    const c = evaluateConditions(ast.conditions, event, ctx);
    if (!c.matched) continue;
    const missing = requiredConsents(ast).filter((p: ConsentPurpose) => !ctx.activeConsents.has(p));
    const runId = newId('run');
    const nowIso = new Date().toISOString();
    const day = localParts(at, ctx.timezone).dateKey;
    const runsToday = st?.day_key === day ? st.runs_today : 0;
    let status: string = 'completed';
    let code: string | null = null;
    let explanation = `${t.explanation}; ${c.explanation}`;
    if (missing.length) {
      status = 'rejected';
      code = 'CONSENT_REQUIRED';
      explanation += `; consentimento ausente: ${missing.join(', ')}`;
    } else if (cooldownActive(st?.last_run_at ?? null, ast.cooldown_ms, at)) {
      continue; // cooldown não gera execução
    } else if (ast.max_executions_per_day !== undefined && runsToday >= ast.max_executions_per_day) {
      continue;
    }
    const inserted = await run(
      env.DB,
      `INSERT OR IGNORE INTO automation_runs(id,tenant_id,automation_id,source_event_id,rule_version,status,started_at,error_code,details_json,explanation) VALUES(?,?,?,?,?,'running',?,?,?,?)`,
      runId,
      tenantId,
      r.id,
      event.id,
      r.version,
      nowIso,
      code,
      '{}',
      explanation,
    );
    if (!inserted.meta.changes) continue; // evento já processado para esta versão
    const outcomes: ActionOutcome[] = [];
    if (status === 'completed') {
      for (const a of ast.actions) {
        try {
          outcomes.push(await executeAction(env, a, r, runId, explanation));
        } catch (e) {
          outcomes.push({
            type: a.type,
            status: 'failed',
            code: e instanceof PulseError ? e.code : 'INTERNAL_ERROR',
          });
        }
      }
      if (outcomes.some((o) => o.status === 'failed')) status = 'failed';
      await run(
        env.DB,
        `INSERT INTO alerts(id,tenant_id,owner_user_id,device_id,kind,severity,status,summary,created_at) VALUES(?,?,?,?,?,?, 'open',?,?)`,
        newId('alr'),
        tenantId,
        ownerUserId,
        event.deviceId ?? null,
        `automation:${ast.trigger.kind}`,
        'info',
        `${r.title}: ${t.explanation}`,
        nowIso,
      );
      await upsertState(env, r, { last_run_at: event.at, day_key: day, runs_today: runsToday + 1 });
      fired += 1;
    }
    await run(
      env.DB,
      `UPDATE automation_runs SET status=?, finished_at=?, error_code=?, details_json=? WHERE id=?`,
      status,
      new Date().toISOString(),
      code,
      JSON.stringify({ actions: outcomes }),
      runId,
    );
  }
  return fired;
}

async function upsertState(
  env: Env,
  r: AutomationRow,
  patch: { last_run_at?: string; day_key?: string; runs_today?: number; previously_above?: number },
): Promise<void> {
  await run(
    env.DB,
    `INSERT INTO automation_state(automation_id,tenant_id,last_run_at,day_key,runs_today,previously_above,updated_at) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(automation_id) DO UPDATE SET last_run_at=COALESCE(?,last_run_at), day_key=COALESCE(?,day_key), runs_today=COALESCE(?,runs_today), previously_above=COALESCE(?,previously_above), updated_at=?`,
    r.id,
    r.tenant_id,
    patch.last_run_at ?? null,
    patch.day_key ?? null,
    patch.runs_today ?? 0,
    patch.previously_above ?? 0,
    new Date().toISOString(),
    patch.last_run_at ?? null,
    patch.day_key ?? null,
    patch.runs_today ?? null,
    patch.previously_above ?? null,
    new Date().toISOString(),
  );
}
