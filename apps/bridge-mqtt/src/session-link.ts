import WebSocket from 'ws';
import { ControlCommandPayload, MqttAck, mqttTopic, type Envelope, type MqttCommand } from '@pulse/contracts';
import { ulid } from '@pulse/core';
import type { EquipmentRegistry } from './equipment';
import type { BridgeMetrics, ControlSessionInfo, Logger, PulseApi } from './types';

export interface MqttPublisher {
  publish(
    topic: string,
    payload: string,
    opts: { qos: 0 | 1; retain: false; properties?: { messageExpiryInterval?: number } },
  ): void;
}

const HEARTBEAT_MS = 5_000;

/**
 * Vínculo de uma sessão de controle (DO) com um equipamento MQTT (docs/08):
 * - confirma armação somente se o equipamento estiver online, armado fisicamente e com status recente;
 * - traduz `control.command` → `cmd` QoS0, sem retain, com expiração;
 * - repassa `ack` ao DO; nunca reenvia comandos após reconexão.
 */
export class SessionLink {
  private ws: WebSocket | null = null;
  private seq = 0;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly published = new Map<string, number>();
  closed = false;

  constructor(
    readonly session: ControlSessionInfo,
    private readonly api: PulseApi,
    private readonly mqtt: MqttPublisher,
    private readonly equipment: EquipmentRegistry,
    private readonly metrics: BridgeMetrics,
    private readonly log: Logger,
    private readonly wsFactory: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {}

  async open(): Promise<void> {
    const { url } = await this.api.ticket(this.session.id, this.session.equipment_id);
    const ws = this.wsFactory(url);
    this.ws = ws;
    ws.on('open', () => {
      this.metrics.ws_connected += 1;
      this.send('session.hello', { role: 'mqtt_bridge' });
      this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
    });
    ws.on('message', (data) => this.onMessage(String(data)));
    ws.on('close', () => this.shutdown());
    ws.on('error', (e) => this.log.warn('ws erro', { session: this.session.id, err: String(e) }));
  }

  private send(type: Envelope['type'], payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.seq += 1;
    const env: Envelope = {
      v: 1,
      id: `evt_${ulid()}`,
      type,
      session_id: this.session.id,
      seq: this.seq,
      sent_at: new Date().toISOString(),
      payload,
    };
    this.ws.send(JSON.stringify(env));
  }

  /** Heartbeat só enquanto o equipamento estiver pronto; caso contrário pede desarme (fail-closed). */
  tick(now = Date.now()): void {
    if (this.equipment.ready(this.session.tenant_id, this.session.equipment_id, now))
      this.send('session.heartbeat', {});
    else this.send('session.disarm', { reason: 'equipamento indisponível ou desarmado localmente' });
  }

  onMessage(raw: string): void {
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      return;
    }
    if (env.type === 'session.arm.request') {
      if (this.equipment.ready(this.session.tenant_id, this.session.equipment_id))
        this.send('session.armed', {});
      else
        this.log.warn('armação não confirmada: equipamento não está armado localmente', {
          session: this.session.id,
        });
      return;
    }
    if (env.type === 'control.command') this.forward(env);
  }

  private forward(env: Envelope): void {
    const p = ControlCommandPayload.safeParse(env.payload);
    const reject = (code: string, commandId: string) => {
      this.metrics.commands_rejected += 1;
      this.send('command.ack', { command_id: commandId, ack: 'ACK_REJECTED', code });
    };
    if (!p.success)
      return reject(
        'VALIDATION_ERROR',
        String((env.payload as { command_id?: string }).command_id ?? 'unknown'),
      );
    const cmd = p.data;
    if (cmd.equipment_id !== this.session.equipment_id) return reject('VALIDATION_ERROR', cmd.command_id);
    const ttl = new Date(cmd.expires_at).getTime() - Date.now();
    if (ttl <= 0) return reject('COMMAND_EXPIRED', cmd.command_id);
    if (this.published.has(cmd.idempotency_key)) return; // nunca publica duas vezes
    if (!this.equipment.ready(this.session.tenant_id, this.session.equipment_id))
      return reject('DEVICE_UNAVAILABLE', cmd.command_id);
    const msg: MqttCommand = {
      v: 1,
      command_id: cmd.command_id,
      session_id: this.session.id,
      equipment_id: cmd.equipment_id,
      seq: env.seq,
      action: cmd.action,
      arguments: cmd.arguments,
      idempotency_key: cmd.idempotency_key,
      expires_at: cmd.expires_at,
      ...(cmd.max_duration_ms ? { max_duration_ms: cmd.max_duration_ms } : {}),
    };
    this.mqtt.publish(
      mqttTopic(this.session.tenant_id, this.session.equipment_id, 'cmd'),
      JSON.stringify(msg),
      {
        qos: 0,
        retain: false,
        properties: { messageExpiryInterval: Math.max(1, Math.ceil(ttl / 1000)) },
      },
    );
    this.published.set(cmd.idempotency_key, Date.now());
    if (this.published.size > 500) this.published.delete(this.published.keys().next().value as string);
    this.metrics.commands_forwarded += 1;
  }

  /** ACK vindo do equipamento (tópico já validado pelo orquestrador). */
  onAck(raw: unknown): void {
    const a = MqttAck.safeParse(raw);
    if (!a.success || a.data.equipment_id !== this.session.equipment_id) return;
    this.metrics.acks_forwarded += 1;
    this.send('command.ack', {
      command_id: a.data.command_id,
      ack: a.data.ack,
      ...(a.data.code ? { code: a.data.code } : {}),
      ...(a.data.state_version !== undefined ? { state_version: a.data.state_version } : {}),
    });
  }

  shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.published.clear();
    try {
      this.ws?.close();
    } catch {
      /* já fechado */
    }
  }
}
