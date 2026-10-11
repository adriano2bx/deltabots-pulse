import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  AutomationAst,
  Envelope,
  GestureDetectedPayload,
  MqttCommand,
  TelemetryBatch,
  mqttTopic,
  parseMqttTopic,
} from '../src';

const root = join(__dirname, '..');
const fixtures = join(root, '..', 'test-fixtures', 'examples');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

function ajv() {
  const a = new Ajv2020({ strict: false, allErrors: true });
  (addFormats as unknown as (a: Ajv2020) => void)(a);
  return a;
}

describe('JSON Schemas oficiais', () => {
  it('todos os schemas compilam', () => {
    const a = ajv();
    for (const f of readdirSync(join(root, 'schemas')).filter((n) => n.endsWith('.json'))) {
      expect(() => a.compile(readJson(join(root, 'schemas', f)))).not.toThrow();
    }
  });

  it('Zod e JSON Schema concordam sobre o exemplo de telemetria', () => {
    const ex = readJson(join(fixtures, 'telemetry-batch.json'));
    expect(TelemetryBatch.safeParse(ex).success).toBe(true);
  });

  it('Zod e JSON Schema concordam sobre comando MQTT', () => {
    const ex = readJson(join(fixtures, 'mqtt-command.json'));
    const validate = ajv().compile(readJson(join(root, 'schemas', 'mqtt-command.schema.json')));
    expect(validate(ex)).toBe(true);
    expect(MqttCommand.safeParse(ex).success).toBe(true);
    const extra = { ...ex, injected: true };
    expect(validate(extra)).toBe(false);
    expect(MqttCommand.safeParse(extra).success).toBe(false);
  });

  it('Envelope WS: mesma aceitação/rejeição que o JSON Schema', () => {
    const validate = ajv().compile(readJson(join(root, 'schemas', 'ws-envelope.schema.json')));
    const ok = {
      v: 1,
      id: '01JABCDEF',
      type: 'gesture.detected',
      session_id: 'ses_1',
      seq: 3,
      sent_at: '2026-10-11T20:30:00.000Z',
      payload: { gesture: 'wrist_right', confidence: 0.96, model_version: 'g1' },
    };
    const cases: Array<[unknown, boolean]> = [
      [ok, true],
      [{ ...ok, v: 2 }, false],
      [{ ...ok, type: 'shell.exec' }, false],
      [{ ...ok, extra: 1 }, false],
      [{ ...ok, seq: -1 }, false],
      [{ ...ok, payload: undefined }, false],
    ];
    for (const [value, expected] of cases) {
      expect(validate(value)).toBe(expected);
      expect(Envelope.safeParse(value).success).toBe(expected);
    }
  });

  it('gesture.detected usa o schema oficial', () => {
    const ex = readJson(join(fixtures, 'gesture.event.json'));
    const payload = ex.payload ?? ex;
    const validate = ajv().compile(readJson(join(root, 'schemas', 'gesture-detected.schema.json')));
    expect(validate(payload)).toBe(GestureDetectedPayload.safeParse(payload).success);
  });
});

describe('DSL de automações', () => {
  it('aceita o exemplo do doc 14', () => {
    const ast = {
      v: 1,
      title: 'Inatividade prolongada',
      enabled: true,
      trigger: { kind: 'inactivity_duration', minutes: 120 },
      conditions: {
        op: 'and',
        rules: [
          { field: 'quality', op: 'eq', value: 'valid' },
          { field: 'time_local', op: 'between', value: ['08:00', '22:00'] },
        ],
      },
      cooldown_ms: 21600000,
      actions: [{ type: 'send_push', target: 'owner', template_id: 'inactivity_nudge' }],
    };
    expect(AutomationAst.parse(ast).actions).toHaveLength(1);
  });

  it('rejeita campos/operadores livres (sem eval)', () => {
    const bad = {
      v: 1,
      title: 'x1',
      enabled: true,
      trigger: { kind: 'inactivity_duration', minutes: 120 },
      conditions: { op: 'and', rules: [{ field: 'process.env', op: 'eval', value: '1' }] },
      actions: [{ type: 'send_push', target: 'owner', template_id: 'a1' }],
    };
    expect(AutomationAst.safeParse(bad).success).toBe(false);
  });
});

describe('tópicos MQTT', () => {
  it('monta e interpreta tópicos válidos', () => {
    const t = mqttTopic('ten_abc', 'eq_led1', 'cmd');
    expect(t).toBe('pulse/v1/ten_abc/eq_led1/cmd');
    expect(parseMqttTopic(t)).toEqual({ tenantId: 'ten_abc', equipmentId: 'eq_led1', kind: 'cmd' });
  });
  it('rejeita curingas e segmentos extras', () => {
    expect(() => mqttTopic('ten_+', 'eq', 'cmd')).toThrow();
    expect(parseMqttTopic('pulse/v1/ten_abc/#/cmd')).toBeNull();
    expect(parseMqttTopic('pulse/v1/ten_abc/eq_led1/cmd/x')).toBeNull();
  });
});

describe('OpenAPI', () => {
  it('é 3.1 com operationIds únicos', () => {
    const doc = parse(readFileSync(join(root, 'openapi.yaml'), 'utf8'));
    expect(String(doc.openapi)).toMatch(/^3\.1/);
    const ids: string[] = [];
    for (const ops of Object.values<Record<string, { operationId: string }>>(doc.paths)) {
      for (const [m, op] of Object.entries(ops)) if (m !== 'parameters') ids.push(op.operationId);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
