import { createServer, type AddressInfo } from 'node:net';
import { Aedes } from 'aedes';
import mqtt from 'mqtt';
import { WebSocketServer, type WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Bridge } from '../src/bridge';
import type { Logger, PulseApi } from '../src/types';

const silent: Logger = { info() {}, warn() {}, error() {} };
const TENANT = 'ten_test01';
const EQUIP = 'eqp_led001';
const SESSION = 'ctl_session1';

let broker: Aedes;
let mqttPort = 0;
let wss: WebSocketServer;
let wsPort = 0;
let doSocket: WebSocket | null = null;
const doInbox: Array<{ type: string; payload: Record<string, unknown>; seq: number }> = [];

const until = async (pred: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

beforeAll(async () => {
  broker = await Aedes.createBroker();
  const server = createServer((socket) => broker.handle(socket));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  mqttPort = (server.address() as AddressInfo).port;
  wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.on('listening', r));
  wsPort = (wss.address() as AddressInfo).port;
  wss.on('connection', (ws) => {
    doSocket = ws;
    ws.on('message', (d) => doInbox.push(JSON.parse(String(d))));
  });
});

afterAll(async () => {
  wss.close();
  await new Promise<void>((r) => broker.close(() => r()));
});

let doSeq = 100;
function fromDo(type: string, payload: Record<string, unknown>) {
  doSeq += 1;
  doSocket!.send(
    JSON.stringify({
      v: 1,
      id: `evt_do_${doSeq}`,
      type,
      session_id: SESSION,
      seq: doSeq,
      sent_at: new Date().toISOString(),
      payload,
    }),
  );
}

describe('bridge MQTT ↔ sessão de controle', () => {
  it('confirma armação só com equipamento armado, publica comando sem retain e repassa ACK; nunca duplica', async () => {
    const api: PulseApi = {
      listSessions: async () => [
        {
          id: SESSION,
          tenant_id: TENANT,
          equipment_id: EQUIP,
          state: 'DISARMED',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
      ticket: async () => ({ url: `ws://127.0.0.1:${wsPort}` }),
    };
    const bridgeClient = mqtt.connect(`mqtt://127.0.0.1:${mqttPort}`, { protocolVersion: 4 });
    const bridge = new Bridge(api, bridgeClient, silent);
    await until(() => bridgeClient.connected);
    await bridge.sync();
    await until(() => doSocket !== null && doInbox.some((m) => m.type === 'session.hello'));

    const equipment = mqtt.connect(`mqtt://127.0.0.1:${mqttPort}`, { protocolVersion: 4 });
    await until(() => equipment.connected);
    const received: Array<{ topic: string; body: Record<string, unknown>; retain: boolean }> = [];
    equipment.on('message', (topic, payload, packet) =>
      received.push({ topic, body: JSON.parse(payload.toString()), retain: packet.retain }),
    );
    await new Promise<void>((r) => equipment.subscribe(`pulse/v1/${TENANT}/${EQUIP}/cmd`, () => r()));

    // Equipamento online mas desarmado localmente → armação não é confirmada.
    equipment.publish(
      `pulse/v1/${TENANT}/${EQUIP}/status`,
      JSON.stringify({ v: 1, equipment_id: EQUIP, online: true, armed: false }),
    );
    await new Promise((r) => setTimeout(r, 100));
    fromDo('session.arm.request', {});
    await new Promise((r) => setTimeout(r, 100));
    expect(doInbox.some((m) => m.type === 'session.armed')).toBe(false);

    // Chave física armada → confirma.
    equipment.publish(
      `pulse/v1/${TENANT}/${EQUIP}/status`,
      JSON.stringify({ v: 1, equipment_id: EQUIP, online: true, armed: true }),
    );
    await new Promise((r) => setTimeout(r, 100));
    fromDo('session.arm.request', {});
    await until(() => doInbox.some((m) => m.type === 'session.armed'));

    const cmd = {
      command_id: 'cmd_led_on1',
      action: 'set_led',
      arguments: { value: true },
      idempotency_key: 'idem-led-on1',
      expires_at: new Date(Date.now() + 2000).toISOString(),
      equipment_id: EQUIP,
    };
    fromDo('control.command', cmd);
    fromDo('control.command', cmd); // duplicado
    await until(() => received.length >= 1);
    await new Promise((r) => setTimeout(r, 150));
    expect(received).toHaveLength(1);
    expect(received[0]!.retain).toBe(false);
    expect(received[0]!.body).toMatchObject({
      v: 1,
      command_id: 'cmd_led_on1',
      action: 'set_led',
      session_id: SESSION,
    });

    // Comando expirado não chega ao equipamento e gera ACK_REJECTED.
    fromDo('control.command', {
      ...cmd,
      command_id: 'cmd_expired',
      idempotency_key: 'idem-expired',
      expires_at: new Date(Date.now() - 10).toISOString(),
    });
    await until(() => doInbox.some((m) => m.type === 'command.ack' && m.payload.code === 'COMMAND_EXPIRED'));
    expect(received).toHaveLength(1);

    // ACK do equipamento é repassado ao DO.
    equipment.publish(
      `pulse/v1/${TENANT}/${EQUIP}/ack`,
      JSON.stringify({ v: 1, command_id: 'cmd_led_on1', equipment_id: EQUIP, ack: 'ACK_EXECUTED' }),
    );
    await until(() => doInbox.some((m) => m.type === 'command.ack' && m.payload.ack === 'ACK_EXECUTED'));

    // Tópico de outro tenant é ignorado (ACL lógica).
    bridge.onMqtt(
      `pulse/v1/ten_other1/${EQUIP}/ack`,
      Buffer.from(JSON.stringify({ v: 1, command_id: 'x', equipment_id: EQUIP, ack: 'ACK_EXECUTED' })),
    );
    bridge.onMqtt('pulse/v1/ten_test01/#/ack', Buffer.from('{}'));
    expect(bridge.metrics.acl_rejections).toBe(2);
    expect(doInbox.filter((m) => m.type === 'command.ack' && m.payload.command_id === 'x')).toHaveLength(0);

    // Equipamento fica offline (LWT) → bridge pede desarme (T009).
    equipment.publish(
      `pulse/v1/${TENANT}/${EQUIP}/status`,
      JSON.stringify({ v: 1, equipment_id: EQUIP, online: false }),
    );
    await until(() => doInbox.some((m) => m.type === 'session.disarm'));

    // Sequência do bridge é estritamente crescente (anti-replay no DO).
    const seqs = doInbox.map((m) => m.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(bridge.prometheus()).toContain('pulse_bridge_commands_forwarded 1');
    bridge.stop();
    equipment.end(true);
  });
});
