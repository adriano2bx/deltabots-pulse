import { describe, expect, it } from 'vitest';
import type { AutomationAst, Scope } from '@pulse/contracts';
import {
  PulseError,
  canCommandDevice,
  canReadHealth,
  cronMatches,
  crc32,
  dedupeKey,
  guardEnvelope,
  inTimeWindow,
  linearTrend,
  localParts,
  nextCronRuns,
  normalizeReading,
  parseCron,
  redact,
  redactObject,
  riskLevel,
  simulate,
  stepsTotalsToDeltas,
  toProblem,
  transition,
  ulid,
  validateCommand,
  type ControlSnapshot,
  type GrantView,
  type Principal,
} from '../src';

const scopes = (...s: Scope[]) => new Set<Scope>(s);
const user = (id: string, extra: Partial<Principal> = {}): Principal => ({
  kind: 'user',
  userId: id,
  tenantId: 'ten_A',
  orgRole: 'owner',
  scopes: scopes('telemetry:read', 'devices:write'),
  mfa: false,
  ...extra,
});

describe('ids', () => {
  it('ULID tem 26 chars e é ordenável no tempo', () => {
    const a = ulid(1_000_000);
    const b = ulid(2_000_000);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
  });
});

describe('problem+json', () => {
  it('mapeia código para status e título', () => {
    const p = toProblem(new PulseError('CONTROL_DISARMED'), 'trc_1');
    expect(p.status).toBe(409);
    expect(p.code).toBe('CONTROL_DISARMED');
  });
});

describe('time / DST (T013)', () => {
  it('converte para o fuso IANA', () => {
    const p = localParts(new Date('2026-10-11T12:00:00Z'), 'America/Sao_Paulo');
    expect(p.hhmm).toBe('09:00');
    expect(p.weekday).toBe('sun');
  });
  it('janela que cruza a meia-noite', () => {
    expect(inTimeWindow('23:30', '22:00', '06:00')).toBe(true);
    expect(inTimeWindow('12:00', '22:00', '06:00')).toBe(false);
  });
  it('cron no horário de parede atravessa mudança de horário de verão (Nova York)', () => {
    // 08:00 local todos os dias, antes e depois da mudança de 2026-11-01.
    const runs = nextCronRuns('0 8 * * *', 'America/New_York', new Date('2026-10-31T00:00:00Z'), 3);
    expect(runs.map((d) => d.toISOString())).toEqual([
      '2026-10-31T12:00:00.000Z',
      '2026-11-01T13:00:00.000Z',
      '2026-11-02T13:00:00.000Z',
    ]);
  });
  it('cron dom/dow com semântica Vixie', () => {
    const spec = parseCron('0 9 1 * mon'.replace('mon', '1'));
    // 2026-10-05 é segunda (dow) e não dia 1 → casa por OR.
    expect(cronMatches(spec, new Date('2026-10-05T12:00:00Z'), 'America/Sao_Paulo')).toBe(true);
  });
});

describe('política de saúde (T001, T010)', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const grant: GrantView = {
    ownerUserId: 'usr_owner',
    granteeUserId: 'usr_fam',
    scope: { role: 'family_viewer', metrics: ['heart_rate'], device_ids: [], history_days: 7 },
    expiresAt: null,
    revokedAt: null,
  };
  it('titular lê os próprios dados', () => {
    expect(
      canReadHealth(user('usr_owner'), 'usr_owner', 'heart_rate', {
        grants: [],
        now,
        ownerConsentCloudHealth: true,
      }).allow,
    ).toBe(true);
  });
  it('familiar lê somente métrica concedida', () => {
    const fam = user('usr_fam', { orgRole: null });
    expect(
      canReadHealth(fam, 'usr_owner', 'heart_rate', { grants: [grant], now, ownerConsentCloudHealth: true })
        .allow,
    ).toBe(true);
    expect(
      canReadHealth(fam, 'usr_owner', 'sleep', { grants: [grant], now, ownerConsentCloudHealth: true }).allow,
    ).toBe(false);
  });
  it('grant revogado nega imediatamente', () => {
    const fam = user('usr_fam', { orgRole: null });
    const revoked = { ...grant, revokedAt: '2026-10-11T11:00:00Z' };
    expect(
      canReadHealth(fam, 'usr_owner', 'heart_rate', { grants: [revoked], now, ownerConsentCloudHealth: true })
        .allow,
    ).toBe(false);
  });
  it('fora da janela de histórico concedida', () => {
    const fam = user('usr_fam', { orgRole: null });
    const d = canReadHealth(fam, 'usr_owner', 'heart_rate', {
      grants: [grant],
      now,
      observedFrom: new Date('2026-09-01T00:00:00Z'),
      ownerConsentCloudHealth: true,
    });
    expect(d.allow).toBe(false);
  });
  it('org_admin não ganha acesso implícito à saúde de membros', () => {
    const admin = user('usr_admin', { orgRole: 'org_admin', mfa: true });
    expect(
      canReadHealth(admin, 'usr_owner', 'heart_rate', { grants: [], now, ownerConsentCloudHealth: true })
        .allow,
    ).toBe(false);
  });
  it('API key do titular sem consentimento é negada', () => {
    const key = user('usr_owner', { kind: 'api_key' });
    expect(
      canReadHealth(key, 'usr_owner', 'heart_rate', { grants: [], now, ownerConsentCloudHealth: false })
        .allow,
    ).toBe(false);
  });
  it('familiar nunca comanda dispositivos', () => {
    expect(canCommandDevice(user('usr_fam'), 'usr_owner').allow).toBe(false);
  });
});

describe('telemetria', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const base = {
    reading_id: 'rd_000001',
    observed_at: '2026-10-11T11:59:00Z',
    quality: 'measured' as const,
    source: 'ble_miband3',
  };
  it('rejeita unidade errada, futuro e faixa', () => {
    expect(normalizeReading({ ...base, kind: 'heart_rate_bpm', value: 70, unit: 'hz' }, now)).toEqual({
      reject: 'UNIT_MISMATCH',
    });
    expect(
      normalizeReading(
        { ...base, kind: 'heart_rate_bpm', value: 70, unit: 'bpm', observed_at: '2026-10-11T13:00:00Z' },
        now,
      ),
    ).toEqual({ reject: 'FUTURE_TIMESTAMP' });
    expect(normalizeReading({ ...base, kind: 'heart_rate_bpm', value: 400, unit: 'bpm' }, now)).toEqual({
      reject: 'OUT_OF_RANGE',
    });
  });
  it('aceita leitura válida e normaliza UTC', () => {
    const r = normalizeReading(
      { ...base, kind: 'heart_rate_bpm', value: 72, unit: 'bpm', observed_at: '2026-10-11T08:59:00-03:00' },
      now,
    );
    expect('ok' in r && r.ok.observedAt).toBe('2026-10-11T11:59:00.000Z');
  });
  it('passos acumulados com reset viram deltas', () => {
    const d = stepsTotalsToDeltas([
      { at: '2026-10-11T22:00:00Z', total: 9000 },
      { at: '2026-10-11T23:00:00Z', total: 9500 },
      { at: '2026-10-12T01:00:00Z', total: 200 },
    ]);
    expect(d).toEqual([
      { at: '2026-10-11T23:00:00Z', delta: 500, reset: false },
      { at: '2026-10-12T01:00:00Z', delta: 200, reset: true },
    ]);
  });
});

describe('automações', () => {
  const ast: AutomationAst = {
    v: 1,
    title: 'FC alta',
    enabled: true,
    trigger: { kind: 'heart_rate_threshold', above: 120, sustain_s: 60, hysteresis_bpm: 5 },
    conditions: { op: 'and', rules: [{ field: 'quality', op: 'eq', value: 'valid' }] },
    actions: [{ type: 'send_push', target: 'owner', template_id: 'hr_high' }],
    cooldown_ms: 3600_000,
    consent_scopes: [],
  };
  const ctx = { timezone: 'America/Sao_Paulo', activeConsents: new Set<never>() };
  it('simula com cooldown e explica cada passo', () => {
    const ev = (id: string, at: string, v: number) => ({
      event: {
        id,
        kind: 'telemetry' as const,
        at,
        telemetryKind: 'heart_rate_bpm',
        value: v,
        quality: 'measured' as const,
      },
      ctx,
    });
    const steps = simulate(ast, [
      ev('e1', '2026-10-11T12:00:00Z', 130),
      ev('e2', '2026-10-11T12:10:00Z', 135),
      ev('e3', '2026-10-11T14:00:00Z', 90),
    ]);
    expect(steps.map((s) => s.outcome)).toEqual(['would_run', 'cooldown', 'no_match']);
  });
  it('classifica risco e gera chave de dedupe', () => {
    expect(riskLevel(ast)).toBe('low');
    expect(dedupeKey('aut_1', 'evt_1', 3)).toBe('aut_1:evt_1:3');
  });
  it('inatividade nunca é presumida sem registro de atividade', () => {
    const inact: AutomationAst = {
      ...ast,
      trigger: { kind: 'inactivity_duration', minutes: 120 },
      conditions: undefined,
    };
    const steps = simulate(inact, [{ event: { id: 't1', kind: 'tick', at: '2026-10-11T12:00:00Z' }, ctx }]);
    expect(steps[0]?.outcome).toBe('no_match');
  });
});

describe('controle físico (T006, T007, T008, T017)', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const s: ControlSnapshot = {
    state: 'DISARMED',
    safetyClass: 'safe_demo',
    sessionExpiresAt: '2026-10-11T12:10:00Z',
    armExpiresAt: null,
    lastHeartbeatAt: null,
    heartbeatTimeoutMs: 15000,
    stateVersion: 0,
  };
  it('arma somente com confirmação local e depois do gateway', () => {
    const t1 = transition(s, { type: 'arm_request', localConfirmationId: 'confirm-123', now, armTtlS: 60 });
    expect(t1.next.state).toBe('ARM_REQUESTED');
    const t2 = transition(t1.next, { type: 'arm_confirmed', now });
    expect(t2.next.state).toBe('ARMED');
  });
  it('desarma sem heartbeat (fail-closed)', () => {
    const armed = {
      ...s,
      state: 'ARMED' as const,
      lastHeartbeatAt: '2026-10-11T11:59:00Z',
      armExpiresAt: '2026-10-11T12:05:00Z',
    };
    expect(transition(armed, { type: 'tick', now }).next.state).toBe('DISARMED');
  });
  it('safety_critical nunca arma e comandos são bloqueados', () => {
    const crit = { ...s, safetyClass: 'safety_critical' as const };
    expect(
      transition(crit, { type: 'arm_request', localConfirmationId: 'confirm-123', now, armTtlS: 60 }).next
        .state,
    ).toBe('FAULT');
    expect(
      validateCommand({
        snapshot: { ...crit, state: 'ARMED' },
        now,
        expiresAt: '2026-10-11T12:00:01Z',
        action: 'on',
        allowedActions: ['on'],
        maxTtlMs: 5000,
        lastCommandAt: null,
        maxRateHz: 10,
      }),
    ).toBe('SAFETY_BLOCKED');
  });
  it('comando sem armar ou expirado é rejeitado', () => {
    const base = {
      now,
      action: 'set_led',
      allowedActions: ['set_led'],
      maxTtlMs: 5000,
      lastCommandAt: null,
      maxRateHz: 10,
    };
    expect(validateCommand({ ...base, snapshot: s, expiresAt: '2026-10-11T12:00:01Z' })).toBe(
      'CONTROL_DISARMED',
    );
    expect(
      validateCommand({ ...base, snapshot: { ...s, state: 'ARMED' }, expiresAt: '2026-10-11T11:59:59Z' }),
    ).toBe('COMMAND_EXPIRED');
    expect(
      validateCommand({ ...base, snapshot: { ...s, state: 'ARMED' }, expiresAt: '2026-10-11T12:00:01Z' }),
    ).toBeNull();
  });
});

describe('envelope WS anti-replay', () => {
  const claims = {
    tenantId: 'ten_A',
    sessionId: 'ses_1',
    allowedTypes: new Set(['session.heartbeat', 'gesture.detected'] as const),
  };
  const frame = (seq: number, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      v: 1,
      id: `evt_${seq}xx`,
      type: 'session.heartbeat',
      session_id: 'ses_1',
      seq,
      sent_at: '2026-10-11T12:00:00.000Z',
      payload: {},
      ...extra,
    });
  it('aceita sequência crescente e rejeita replay', () => {
    const st = { lastSeq: 0 };
    const at = new Date('2026-10-11T12:00:00.100Z');
    expect('ok' in guardEnvelope(frame(1), claims, st, at)).toBe(true);
    expect(guardEnvelope(frame(1), claims, st, at)).toEqual({ reject: 'REPLAY' });
  });
  it('rejeita claims forjadas e tipos não permitidos', () => {
    const at = new Date('2026-10-11T12:00:00.100Z');
    expect(guardEnvelope(frame(5, { tenant_id: 'ten_B' }), claims, { lastSeq: 0 }, at)).toEqual({
      reject: 'CLAIM_MISMATCH',
    });
    expect(guardEnvelope(frame(5, { type: 'control.executed' }), claims, { lastSeq: 0 }, at)).toMatchObject({
      reject: 'TYPE_NOT_ALLOWED',
    });
  });
  it('rejeita frame expirado', () => {
    const at = new Date('2026-10-11T12:00:05Z');
    const f = frame(9, { expires_at: '2026-10-11T12:00:00.350Z' });
    expect(guardEnvelope(f, claims, { lastSeq: 0 }, at)).toEqual({ reject: 'EXPIRED' });
  });
});

describe('redação de logs', () => {
  it('remove e-mail, MAC, JWT e tokens', () => {
    const s = redact('user a@b.com mac CC:21:4C:7D:88:63 Bearer abc.def ticket=XYZ');
    expect(s).not.toMatch(/a@b\.com|CC:21|abc\.def|XYZ/);
    expect(redactObject({ password: 'x', nested: { email: 'a@b.com' } })).toEqual({
      password: '[redacted]',
      nested: { email: '[redacted]' },
    });
  });
});

describe('estatística', () => {
  it('crc32 padrão', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('tendência linear', () => {
    const t = linearTrend(
      [0, 1, 2, 3].map((d) => ({ at: new Date(Date.UTC(2026, 9, 1 + d)).toISOString(), value: 60 + d })),
    );
    expect(t?.slopePerDay).toBeCloseTo(1);
    expect(t?.r2).toBeCloseTo(1);
  });
});
