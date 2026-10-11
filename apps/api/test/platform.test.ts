import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { handleIngest, handleJob } from '../src/queues';
import { scheduled } from '../src/scheduled';
import { processAutomationEvent } from '../src/services/automations';
import { totp } from '../src/lib/totp';
import {
  call,
  grantHealthConsents,
  json,
  registerBand,
  registerGateway,
  registerUser,
  type TestUser,
} from './helpers';

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

async function consent(u: TestUser, purpose: string) {
  const r = await call('/consents', {
    method: 'POST',
    token: u.access,
    json: { purpose, policy_version: '2026-10' },
  });
  expect(r.status).toBe(201);
  return (await json<{ data: { id: string } }>(r)).data.id;
}

const mfaSecrets = new Map<string, string>();
async function withMfa(u: TestUser): Promise<string> {
  const setup = await json<{ data: { secret_base32: string } }>(
    await call('/auth/mfa/setup', { method: 'POST', token: u.access }),
  );
  await call('/auth/mfa/verify', {
    method: 'POST',
    token: u.access,
    json: { code: await totp(setup.data.secret_base32, Date.now()) },
  });
  mfaSecrets.set(u.userId, setup.data.secret_base32);
  return u.access;
}

async function seedHeartRate(u: TestUser, values: number[], stepMin = 10) {
  await grantHealthConsents(u);
  const gw = await registerGateway(u);
  const dev = await registerBand(u, gw);
  const readings = values.map((v, i) => ({
    reading_id: `hr_${dev.slice(-6)}_${i}`,
    kind: 'heart_rate_bpm',
    observed_at: iso((values.length - i) * stepMin),
    value: v,
    unit: 'bpm',
    quality: 'measured',
    source: 'ble_miband3',
  }));
  const ack = await json<{ accepted: string[] }>(
    await gw.signed('/telemetry/batch', 'POST', {
      gateway_id: gw.id,
      device_id: dev,
      batch_id: `b_${dev.slice(-8)}`,
      readings,
    }),
  );
  return { gw, dev, accepted: ack.accepted };
}

describe('família: convite, concessão e revogação (F86–F88, T010)', () => {
  it('beneficiário vê somente métricas concedidas e perde acesso ao revogar', async () => {
    const owner = await registerUser('Titular');
    const { dev } = await seedHeartRate(owner, [70, 72]);
    expect(
      (
        await call('/share/invitations', {
          method: 'POST',
          token: owner.access,
          json: {
            invitee_email: 'x@example.test',
            scope: { role: 'family_viewer', metrics: ['heart_rate'] },
          },
        })
      ).status,
    ).toBe(403);
    await consent(owner, 'family_sharing');
    const fam = await registerUser('Familiar');
    const inv = await json<{ data: { invite_token: string } }>(
      await call('/share/invitations', {
        method: 'POST',
        token: owner.access,
        json: {
          invitee_email: fam.email,
          scope: { role: 'family_viewer', metrics: ['heart_rate'], history_days: 7 },
        },
      }),
    );
    const acc = await json<{ data: { grant_id: string; tenant_id: string } }>(
      await call('/share/invitations/accept', {
        method: 'POST',
        token: fam.access,
        json: { invite_token: inv.data.invite_token },
      }),
    );
    const sw = await json<{ access_token: string }>(
      await call('/auth/switch-tenant', {
        method: 'POST',
        token: fam.access,
        json: { tenant_id: acc.data.tenant_id },
      }),
    );
    const latest = await json<{ data: Array<{ kind: string }> }>(
      await call(`/telemetry/latest?device_id=${dev}`, { token: sw.access_token }),
    );
    expect(latest.data.map((d) => d.kind)).toEqual(['heart_rate_bpm']);
    const care = await json<{ data: Array<{ metrics: string[] }> }>(
      await call('/share/care', { token: sw.access_token }),
    );
    expect(care.data[0]?.metrics).toEqual(['heart_rate']);
    expect(
      (
        await call(`/devices/${dev}/commands`, {
          method: 'POST',
          token: sw.access_token,
          json: { action: 'sync_now', arguments: {}, idempotency_key: 'fam-sync-123' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(`/share/grants/${acc.data.grant_id}`, { method: 'DELETE', token: owner.access })).status,
    ).toBe(200);
    const after = await json<{ data: unknown[] }>(
      await call(`/telemetry/latest?device_id=${dev}`, { token: sw.access_token }),
    );
    expect(after.data).toEqual([]);
  });
});

describe('notificações, preferências e check-in (F67, F92–F95)', () => {
  it('horário silencioso suprime não urgentes; pedido de ajuda alcança cuidador', async () => {
    const owner = await registerUser();
    await consent(owner, 'family_sharing');
    const cg = await registerUser('Cuidador');
    const inv = await json<{ data: { invite_token: string } }>(
      await call('/share/invitations', {
        method: 'POST',
        token: owner.access,
        json: { invitee_email: cg.email, scope: { role: 'caregiver', metrics: ['checkins', 'alerts'] } },
      }),
    );
    await call('/share/invitations/accept', {
      method: 'POST',
      token: cg.access,
      json: { invite_token: inv.data.invite_token },
    });
    const help = await call('/checkins', {
      method: 'POST',
      token: owner.access,
      json: { kind: 'help_request', message: 'preciso de ajuda' },
    });
    expect(help.status).toBe(201);
    const sw = await json<{ access_token: string }>(
      await call('/auth/switch-tenant', {
        method: 'POST',
        token: cg.access,
        json: { tenant_id: owner.tenantId },
      }),
    );
    const inbox = await json<{ data: Array<{ kind: string; priority: string; body: string }> }>(
      await call('/notifications', { token: sw.access_token }),
    );
    expect(inbox.data[0]).toMatchObject({ kind: 'help_request', priority: 'high' });
    expect(inbox.data[0]?.body).toContain('192');
    const loc = await call('/checkins', {
      method: 'POST',
      token: owner.access,
      json: { kind: 'safety', location: { lat: -23.5, lon: -46.6, accuracy_m: 10 } },
    });
    expect((await json<{ code: string }>(loc)).code).toBe('CONSENT_REQUIRED');
  });
});

describe('tendências, sono, relatórios e exportação (F22, F82, F113)', () => {
  it('relatório exige consentimento e não inventa dados; exportação fica disponível ao titular', async () => {
    const u = await registerUser();
    const { accepted } = await seedHeartRate(u, [60, 62, 64, 66, 68]);
    expect(accepted).toHaveLength(5);
    const trend = await json<{ data: { quality_flags: string[]; points: unknown[]; explanation: string } }>(
      await call('/health/trends?kind=heart_rate_bpm&days=30', { token: u.access }),
    );
    expect(trend.data.quality_flags).toContain('insufficient_days');
    expect(trend.data.explanation).toMatch(/Ainda não há dias suficientes/);
    const rep = await json<{
      data: { sections: Array<{ kind: string; metrics: Record<string, number | null>; notes: string[] }> };
    }>(await call('/reports', { method: 'POST', token: u.access, json: { period: 'weekly' } }));
    const sleep = rep.data.sections.find((s) => s.kind === 'sleep');
    expect(sleep?.metrics.nights).toBe(0);
    expect(sleep?.notes[0]).toMatch(/Sem dados de sono/);
    const ex = await json<{ data: { id: string; state: string } }>(
      await call('/exports', { method: 'POST', token: u.access, json: { kind: 'telemetry_csv' } }),
    );
    expect(ex.data.state).toBe('queued');
    await handleJob(env, {
      kind: 'export.build',
      event_id: ex.data.id,
      tenant_id: u.tenantId,
      export_id: ex.data.id,
    });
    const st = await json<{ data: { state: string; download_url: string } }>(
      await call(`/exports/${ex.data.id}`, { token: u.access }),
    );
    expect(st.data.state).toBe('ready');
    const dl = await call(`/exports/${ex.data.id}/download`, { token: u.access });
    const csv = await dl.text();
    expect(csv.split('\n')).toHaveLength(6);
    const other = await registerUser();
    expect((await call(`/exports/${ex.data.id}/download`, { token: other.access })).status).toBe(404);
  });
});

describe('exclusão de conta LGPD (F114, F138, T012)', () => {
  it('revoga acesso imediatamente e remove dados do titular', async () => {
    const u = await registerUser();
    const { dev } = await seedHeartRate(u, [70, 71, 72]);
    const bad = await call('/me/delete', {
      method: 'POST',
      token: u.access,
      json: { confirm_email: 'outro@example.test' },
    });
    expect(bad.status).toBe(400);
    const del = await json<{ data: { id: string } }>(
      await call('/me/delete', { method: 'POST', token: u.access, json: { confirm_email: u.email } }),
    );
    expect((await call('/me', { token: u.access })).status).toBe(401);
    await handleJob(env, {
      kind: 'account.delete',
      event_id: del.data.id,
      tenant_id: u.tenantId,
      deletion_id: del.data.id,
    });
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM telemetry_readings WHERE device_id=?')
      .bind(dev)
      .first<{ n: number }>();
    expect(n?.n).toBe(0);
    const user = await env.DB.prepare('SELECT email,status FROM users WHERE id=?')
      .bind(u.userId)
      .first<{ email: string; status: string }>();
    expect(user?.status).toBe('deleted');
    expect(user?.email).not.toContain('example.test');
    const login = await call('/auth/login', {
      method: 'POST',
      json: { email: u.email, password: u.password },
    });
    expect(login.status).toBe(401);
  });
});

describe('automações (F189–F218, T014)', () => {
  it('cria, versiona, simula com sintético rotulado e executa com dedupe', async () => {
    const u = await registerUser();
    const { dev } = await seedHeartRate(u, [70]);
    const ast = {
      v: 1,
      title: 'FC alta',
      enabled: true,
      trigger: { kind: 'heart_rate_threshold', above: 100, sustain_s: 0, hysteresis_bpm: 5 },
      conditions: { op: 'and', rules: [{ field: 'quality', op: 'eq', value: 'valid' }] },
      cooldown_ms: 0,
      actions: [{ type: 'send_push', target: 'owner', template_id: 'hr_high' }],
    };
    const created = await json<{ data: { id: string; version: number; risk_level: string } }>(
      await call('/automations', { method: 'POST', token: u.access, json: ast }),
    );
    expect(created.data.risk_level).toBe('low');
    const conflict = await call(`/automations/${created.data.id}`, {
      method: 'PATCH',
      token: u.access,
      json: { enabled: true, expected_version: 9 },
    });
    expect(conflict.status).toBe(409);
    const sim = await json<{ data: { synthetic: boolean; evaluated_events: number } }>(
      await call(`/automations/${created.data.id}/simulate`, {
        method: 'POST',
        token: u.access,
        json: { days: 7, source: 'synthetic' },
      }),
    );
    expect(sim.data.synthetic).toBe(true);
    expect(sim.data.evaluated_events).toBeGreaterThan(0);
    const ev = {
      id: 'hr_event_high_1',
      kind: 'telemetry' as const,
      at: iso(1),
      deviceId: dev,
      telemetryKind: 'heart_rate_bpm',
      value: 130,
      quality: 'measured' as const,
    };
    expect(await processAutomationEvent(env, u.tenantId, u.userId, ev)).toBe(1);
    expect(await processAutomationEvent(env, u.tenantId, u.userId, ev)).toBe(0);
    const runs = await json<{ data: Array<{ status: string; actions: Array<{ status: string }> }> }>(
      await call(`/automations/${created.data.id}/executions`, { token: u.access }),
    );
    expect(runs.data).toHaveLength(1);
    expect(runs.data[0]?.status).toBe('completed');
    const inbox = await json<{ data: Array<{ kind: string; delivery_error: string | null }> }>(
      await call('/notifications', { token: u.access }),
    );
    expect(inbox.data[0]?.kind).toBe('automation:hr_high');
  });

  it('rejeita equipamento safety_critical e gesto sem modelo ativo; kill switch pausa', async () => {
    const u = await registerUser();
    const eq = await json<{ data: { id: string } }>(
      await call('/control/equipment', {
        method: 'POST',
        token: u.access,
        json: {
          kind: 'relay',
          display_name: 'Portão',
          connector: 'MQTT',
          safety_class: 'safety_critical',
          capabilities: [{ action: 'open', semantics: 'discrete' }],
          watchdog_ms: 1000,
        },
      }),
    );
    const bad = await call('/automations', {
      method: 'POST',
      token: u.access,
      json: {
        v: 1,
        title: 'Abrir',
        enabled: false,
        trigger: { kind: 'battery_low', below_percent: 10 },
        actions: [{ type: 'control_discrete_when_armed', equipment_id: eq.data.id, action: 'open' }],
      },
    });
    expect((await json<{ code: string }>(bad)).code).toBe('SAFETY_BLOCKED');
    const gesture = await call('/automations', {
      method: 'POST',
      token: u.access,
      json: {
        v: 1,
        title: 'Gesto',
        enabled: false,
        trigger: { kind: 'gesture_detected', gesture: 'wrist_right' },
        actions: [{ type: 'send_push', target: 'owner', template_id: 'g1' }],
      },
    });
    expect((await json<{ code: string }>(gesture)).code).toBe('CAPABILITY_UNVERIFIED');
    expect(
      (await call('/automations/kill-switch', { method: 'POST', token: u.access, json: { enabled: true } }))
        .status,
    ).toBe(200);
  });

  it('agendador avalia inatividade sem presumir dados ausentes', async () => {
    const u = await registerUser();
    await call('/automations', {
      method: 'POST',
      token: u.access,
      json: {
        v: 1,
        title: 'Inatividade',
        enabled: true,
        trigger: { kind: 'inactivity_duration', minutes: 60 },
        actions: [{ type: 'send_push', target: 'owner', template_id: 'idle' }],
      },
    });
    await scheduled(
      { scheduledTime: Date.now(), cron: '* * * * *', noRetry() {} } as ScheduledController,
      env,
    );
    const runs = await env.DB.prepare('SELECT COUNT(*) n FROM automation_runs WHERE tenant_id=?')
      .bind(u.tenantId)
      .first<{ n: number }>();
    expect(runs?.n).toBe(0);
  });
});

describe('IA com guardrails (F69–F85, T011)', () => {
  it('exige consentimento, degrada sem modelo e nunca executa ação mutável', async () => {
    const u = await registerUser();
    await seedHeartRate(u, [70, 72]);
    expect(
      (
        await json<{ code: string }>(
          await call('/ai/chat', { method: 'POST', token: u.access, json: { message: 'oi' } }),
        )
      ).code,
    ).toBe('CONSENT_REQUIRED');
    await consent(u, 'ai_analysis');
    const r = await json<{
      data: {
        degraded: boolean;
        tool_proposals: Array<{ tool: string; policy_decision: string }>;
        reply: string;
      };
    }>(
      await call('/ai/chat', {
        method: 'POST',
        token: u.access,
        json: { message: 'Crie uma automação e ligue a luz da sala' },
      }),
    );
    expect(r.data.degraded).toBe(true);
    expect(
      r.data.tool_proposals.every((t) => t.policy_decision !== 'allowed' || !t.tool.includes('control')),
    ).toBe(true);
    expect(
      r.data.tool_proposals.find((t) => t.tool === 'pulse.control.request_approval')?.policy_decision,
    ).toBe('needs_confirmation');
    const emergency = await json<{ data: { reply: string } }>(
      await call('/ai/chat', {
        method: 'POST',
        token: u.access,
        json: { message: 'estou com dor no peito' },
      }),
    );
    expect(emergency.data.reply).toContain('192');
    const ins = await json<{ data: Array<{ model_version: string; sources: string[] }> }>(
      await call('/ai/insights', { token: u.access }),
    );
    expect(ins.data[0]?.model_version).toBe('pulse-insights-stat-1.0');
  });

  it('servidor MCP lista allowlist e bloqueia ferramentas mutáveis', async () => {
    const u = await registerUser();
    await withMfa(u);
    const keyRes = await call('/api-keys', {
      method: 'POST',
      token: u.access,
      json: { scopes: ['mcp:tools', 'devices:read', 'control:arm'] },
    });
    if (keyRes.status !== 201) throw new Error(await keyRes.text());
    const key = await json<{ data: { secret: string } }>(keyRes);
    const rpc = (method: string, params?: unknown) =>
      call('/mcp-server', {
        method: 'POST',
        token: key.data.secret,
        json: { jsonrpc: '2.0', id: 1, method, params },
      });
    const list = await json<{ result: { tools: Array<{ name: string }> } }>(await rpc('tools/list'));
    expect(list.result.tools.map((t) => t.name)).toEqual([
      'pulse.devices.list',
      'pulse.control.request_approval',
    ]);
    const mut = await json<{ result: { isError: boolean } }>(
      await rpc('tools/call', { name: 'pulse.control.request_approval', arguments: {} }),
    );
    expect(mut.result.isError).toBe(true);
    const ok = await json<{ result: { content: Array<{ text: string }> } }>(
      await rpc('tools/call', { name: 'pulse.devices.list', arguments: {} }),
    );
    expect(JSON.parse(ok.result.content[0]!.text)).toEqual([]);
    const forbidden = await call('/api-keys', {
      method: 'POST',
      token: u.access,
      json: { scopes: ['admin:read'] },
    });
    expect(forbidden.status).toBe(403);
  });
});

describe('plataforma: webhooks SSRF, billing e auditoria', () => {
  it('bloqueia destinos internos e mede consumo real', async () => {
    const u = await registerUser();
    for (const url of [
      'https://localhost/x',
      'https://169.254.169.254/latest',
      'https://10.0.0.1/',
      'http://example.com/',
      'https://metadata.google.internal/',
    ]) {
      expect(
        (
          await call('/webhooks', {
            method: 'POST',
            token: u.access,
            json: { url, event_types: ['alert.created'] },
          })
        ).status,
      ).toBe(400);
    }
    const wh = await json<{ data: { secret: string } }>(
      await call('/webhooks', {
        method: 'POST',
        token: u.access,
        json: { url: 'https://hooks.example.com/pulse', event_types: ['alert.created'] },
      }),
    );
    expect(wh.data.secret).toMatch(/^whsec_/);
    const usage = await json<{ data: Array<{ metric: string; value: number }> }>(
      await call('/billing/usage', { token: u.access }),
    );
    expect(usage.data.find((x) => x.metric === 'devices')?.value).toBe(0);
    expect(
      (await json<{ code: string }>(await call('/billing/checkout', { method: 'POST', token: u.access })))
        .code,
    ).toBe('INTEGRATION_BLOCKED');
    expect((await json<{ code: string }>(await call('/admin/audit', { token: u.access }))).code).toBe(
      'MFA_REQUIRED',
    );
    await withMfa(u);
    const audit = await json<{ data: Array<{ action: string }> }>(
      await call('/admin/audit', { token: u.access }),
    );
    expect(audit.data.map((a) => a.action)).toContain('webhook.create');
  });
});

describe('gestos com gate de hardware (T005, F331–F335)', () => {
  it('fonte miband3_raw sem capability é bloqueada; modelo fraco não ativa', async () => {
    const u = await registerUser();
    const gw = await registerGateway(u);
    const dev = await registerBand(u, gw);
    const raw = await call('/gestures/sessions', {
      method: 'POST',
      token: u.access,
      json: { mode: 'OBSERVE', sensor_source: 'miband3_raw', device_id: dev },
    });
    expect((await json<{ code: string }>(raw)).code).toBe('CAPABILITY_UNVERIFIED');
    expect(
      (
        await call('/gestures/sessions', {
          method: 'POST',
          token: u.access,
          json: { mode: 'OBSERVE', sensor_source: 'android_imu' },
        })
      ).status,
    ).toBe(201);
    const metrics = {
      macro_precision: 0.9,
      macro_recall: 0.95,
      balanced_accuracy: 0.9,
      false_activations_per_hour: 0.05,
      latency_p95_ms: 80,
      holdout_sessions: 3,
      confusion_matrix: [
        [9, 1],
        [0, 10],
      ],
      labels: ['wrist_left', 'wrist_right'],
    };
    const m = await json<{ data: { id: string } }>(
      await call('/gestures/models', {
        method: 'POST',
        token: u.access,
        json: { model_version: 'g1', algorithm: 'dtw_template', sensor_source: 'android_imu', metrics },
      }),
    );
    expect(
      (await call(`/gestures/models/${m.data.id}/activate`, { method: 'POST', token: u.access })).status,
    ).toBe(409);
  });
});

async function openWs(
  ticketUrl: string,
): Promise<{
  ws: WebSocket;
  messages: Array<{ type: string; payload: Record<string, unknown> }>;
  next: (type: string) => Promise<{ type: string; payload: Record<string, unknown> }>;
}> {
  const res = await SELF.fetch(ticketUrl.replace('ws://127.0.0.1:8787', 'https://api.test'), {
    headers: { upgrade: 'websocket' },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket as WebSocket;
  ws.accept();
  const messages: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const waiters: Array<{
    type: string;
    resolve: (m: { type: string; payload: Record<string, unknown> }) => void;
  }> = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(String(e.data));
    messages.push(m);
    const i = waiters.findIndex((w) => w.type === m.type);
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(m);
  });
  return {
    ws,
    messages,
    next: (type) => {
      const found = messages.find((m) => m.type === type && !(m as { _seen?: boolean })._seen);
      if (found) {
        (found as { _seen?: boolean })._seen = true;
        return Promise.resolve(found);
      }
      return new Promise((resolve, reject) => {
        waiters.push({ type, resolve });
        setTimeout(() => reject(new Error(`timeout esperando ${type}`)), 3000);
      });
    },
  };
}

describe('controle físico via Durable Object (T002, T006–T008, T017, T019)', () => {
  it('fluxo completo: armar no gateway, confirmar no equipamento, comando idempotente, desarme ao cair', async () => {
    const u = await registerUser();
    const android = await registerGateway(u);
    const mfaToken = await withMfa(u);
    const espGw = await json<{ data: { id: string } }>(
      await call('/gateways', {
        method: 'POST',
        token: u.access,
        json: { kind: 'ws_gateway', display_name: 'ESP32 bancada' },
      }),
    );
    const cred = await json<{ data: { refresh_token: string } }>(
      await call(`/gateways/${espGw.data.id}/credentials`, { method: 'POST', token: mfaToken }),
    );
    const espTokens = await json<{ access_token: string }>(
      await call('/auth/refresh', { method: 'POST', json: { refresh_token: cred.data.refresh_token } }),
    );
    const eq = await json<{ data: { id: string } }>(
      await call('/control/equipment', {
        method: 'POST',
        token: u.access,
        json: {
          kind: 'led',
          display_name: 'LED bancada',
          connector: 'WSS',
          safety_class: 'safe_demo',
          capabilities: [
            { action: 'set_led', semantics: 'discrete', arguments_schema: { value: 'boolean' } },
          ],
          watchdog_ms: 1500,
          gateway_id: espGw.data.id,
        },
      }),
    );
    const sess = await json<{ data: { id: string } }>(
      await call('/control/sessions', {
        method: 'POST',
        token: u.access,
        json: { equipment_id: eq.data.id, ttl_s: 300 },
      }),
    );
    const cmd = (key: string) => ({
      command_id: `cmd_${key}`,
      session_id: sess.data.id,
      equipment_id: eq.data.id,
      action: 'set_led',
      arguments: { value: true },
      expires_at: new Date(Date.now() + 2000).toISOString(),
      idempotency_key: key,
    });

    // T006: sem armar, comando é rejeitado.
    expect(
      (
        await json<{ code: string }>(
          await call(`/control/sessions/${sess.data.id}/commands`, {
            method: 'POST',
            token: u.access,
            json: cmd('idem-disarmed-1'),
          }),
        )
      ).code,
    ).toBe('CONTROL_DISARMED');
    // Console (sessão sem gateway vinculado) não arma.
    const consoleLogin = await call('/auth/login', {
      method: 'POST',
      json: {
        email: u.email,
        password: u.password,
        mfa_code: await totp(mfaSecrets.get(u.userId)!, Date.now()),
      },
    });
    expect(consoleLogin.status).toBe(200);
    const consoleSession = await json<{ access_token: string }>(consoleLogin);
    const consoleArm = await call(`/control/sessions/${sess.data.id}/arm`, {
      method: 'POST',
      token: consoleSession.access_token,
      json: { local_confirmation_id: 'confirm-local-123' },
    });
    expect(consoleArm.status).toBe(403);

    const espTicket = await json<{ data: { url: string } }>(
      await call('/realtime/ticket', {
        method: 'POST',
        token: espTokens.access_token,
        json: { purpose: 'equipment_gateway', control_session_id: sess.data.id, equipment_id: eq.data.id },
      }),
    );
    const esp = await openWs(espTicket.data.url);
    await esp.next('session.ready');
    // Ticket é de uso único.
    const reuse = await SELF.fetch(espTicket.data.url.replace('ws://127.0.0.1:8787', 'https://api.test'), {
      headers: { upgrade: 'websocket' },
    });
    expect(reuse.status).toBe(401);

    const arm = await android.signed(`/control/sessions/${sess.data.id}/arm`, 'POST', {
      local_confirmation_id: 'confirm-local-123',
      arm_ttl_s: 60,
    });
    expect((await json<{ data: { state: string } }>(arm)).data.state).toBe('ARM_REQUESTED');
    await esp.next('session.arm.request');
    esp.ws.send(
      JSON.stringify({
        v: 1,
        id: 'evt_esp_armed',
        type: 'session.armed',
        session_id: sess.data.id,
        seq: 1,
        sent_at: new Date().toISOString(),
        payload: {},
      }),
    );
    await esp.next('session.armed');

    const ok = await call(`/control/sessions/${sess.data.id}/commands`, {
      method: 'POST',
      token: u.access,
      json: cmd('idem-led-on-1'),
    });
    expect(ok.status).toBe(202);
    const forwarded = await esp.next('control.command');
    expect(forwarded.payload.action).toBe('set_led');
    // T007: mesmo idempotency_key → mesma resposta, nenhum novo envio ao equipamento.
    const dup = await json<{ data: { command_id: string; seq: number } }>(
      await call(`/control/sessions/${sess.data.id}/commands`, {
        method: 'POST',
        token: u.access,
        json: cmd('idem-led-on-1'),
      }),
    );
    expect(dup.data.command_id).toBe('cmd_idem-led-on-1');
    expect(esp.messages.filter((m) => m.type === 'control.command')).toHaveLength(1);
    // T008: comando expirado é rejeitado.
    const expired = { ...cmd('idem-expired-1'), expires_at: new Date(Date.now() - 1000).toISOString() };
    expect(
      (
        await json<{ code: string }>(
          await call(`/control/sessions/${sess.data.id}/commands`, {
            method: 'POST',
            token: u.access,
            json: expired,
          }),
        )
      ).code,
    ).toBe('COMMAND_EXPIRED');
    // Replay de seq do equipamento é rejeitado.
    esp.ws.send(
      JSON.stringify({
        v: 1,
        id: 'evt_esp_armed2',
        type: 'session.armed',
        session_id: sess.data.id,
        seq: 1,
        sent_at: new Date().toISOString(),
        payload: {},
      }),
    );
    expect((await esp.next('server.error')).payload.code).toBe('REPLAY');
    esp.ws.send(
      JSON.stringify({
        v: 1,
        id: 'evt_ack_1',
        type: 'command.ack',
        session_id: sess.data.id,
        seq: 2,
        sent_at: new Date().toISOString(),
        payload: { command_id: 'cmd_idem-led-on-1', ack: 'ACK_EXECUTED' },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    const row = await env.DB.prepare('SELECT status FROM control_commands WHERE id=?')
      .bind('cmd_idem-led-on-1')
      .first<{ status: string }>();
    expect(row?.status).toBe('executed');

    // T002/HW15: equipamento cai → desarma (fail-closed).
    esp.ws.close(1000, 'bye');
    await new Promise((r) => setTimeout(r, 100));
    const state = await json<{ data: { state: string } }>(
      await call(`/control/sessions/${sess.data.id}`, { token: u.access }),
    );
    expect(state.data.state).toBe('DISARMED');
  });
});

describe('fila de ingestão dispara automações', () => {
  it('lote ingerido avalia regras de bateria', async () => {
    const u = await registerUser();
    await grantHealthConsents(u);
    const gw = await registerGateway(u);
    const dev = await registerBand(u, gw);
    await call('/automations', {
      method: 'POST',
      token: u.access,
      json: {
        v: 1,
        title: 'Bateria baixa',
        enabled: true,
        trigger: { kind: 'battery_low', below_percent: 20 },
        actions: [{ type: 'send_push', target: 'owner', template_id: 'battery_low' }],
      },
    });
    const ack = await json<{ accepted: string[] }>(
      await gw.signed('/telemetry/batch', 'POST', {
        gateway_id: gw.id,
        device_id: dev,
        batch_id: 'b_battery_1',
        readings: [
          {
            reading_id: 'bt_low_0001',
            kind: 'battery_percent',
            observed_at: iso(1),
            value: 12,
            unit: '%',
            quality: 'measured',
            source: 'ble_miband3',
          },
        ],
      }),
    );
    await handleIngest(env, {
      kind: 'telemetry.batch_ingested',
      event_id: 'ing_b_battery_1',
      tenant_id: u.tenantId,
      owner_user_id: u.userId,
      device_id: dev,
      reading_ids: ack.accepted,
    });
    const alerts = await json<{ data: Array<{ kind: string }> }>(await call('/alerts', { token: u.access }));
    expect(alerts.data[0]?.kind).toBe('automation:battery_low');
  });
});
