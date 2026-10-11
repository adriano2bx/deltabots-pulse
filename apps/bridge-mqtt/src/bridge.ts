import { parseMqttTopic } from '@pulse/contracts';
import type { MqttClient } from 'mqtt';
import { EquipmentRegistry } from './equipment';
import { SessionLink } from './session-link';
import type { BridgeMetrics, Logger, PulseApi } from './types';

/** Orquestrador: descobre sessões ativas, mantém um vínculo por sessão e roteia MQTT ↔ DO. */
export class Bridge {
  readonly equipment = new EquipmentRegistry();
  readonly links = new Map<string, SessionLink>();
  readonly metrics: BridgeMetrics = {
    ws_connected: 0,
    mqtt_connected: 0,
    commands_forwarded: 0,
    commands_rejected: 0,
    acks_forwarded: 0,
    acl_rejections: 0,
    reconnects: 0,
  };
  private readonly tenants = new Set<string>();
  private poller: NodeJS.Timeout | null = null;

  constructor(
    private readonly api: PulseApi,
    private readonly mqtt: MqttClient,
    private readonly log: Logger,
  ) {
    mqtt.on('connect', () => {
      this.metrics.mqtt_connected = 1;
      for (const t of this.tenants) this.subscribe(t);
    });
    mqtt.on('close', () => {
      this.metrics.mqtt_connected = 0;
    });
    mqtt.on('reconnect', () => {
      this.metrics.reconnects += 1;
    });
    mqtt.on('message', (topic, payload) => this.onMqtt(topic, payload));
  }

  private subscribe(tenantId: string): void {
    for (const kind of ['status', 'ack', 'telemetry'])
      this.mqtt.subscribe(`pulse/v1/${tenantId}/+/${kind}`, { qos: kind === 'status' ? 1 : 0 });
  }

  onMqtt(topic: string, payload: Buffer): void {
    const t = parseMqttTopic(topic);
    if (!t || !this.tenants.has(t.tenantId)) {
      this.metrics.acl_rejections += 1;
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    if (t.kind === 'status') {
      this.equipment.update(t.tenantId, t.equipmentId, body);
      if (!this.equipment.ready(t.tenantId, t.equipmentId)) {
        for (const l of this.links.values()) if (l.session.equipment_id === t.equipmentId) l.tick();
      }
    } else if (t.kind === 'ack') {
      for (const l of this.links.values())
        if (l.session.tenant_id === t.tenantId && l.session.equipment_id === t.equipmentId) l.onAck(body);
    }
  }

  async sync(): Promise<void> {
    const sessions = await this.api.listSessions();
    const active = new Set(sessions.map((s) => s.id));
    for (const s of sessions) {
      if (!this.tenants.has(s.tenant_id)) {
        this.tenants.add(s.tenant_id);
        if (this.mqtt.connected) this.subscribe(s.tenant_id);
      }
      const existing = this.links.get(s.id);
      if (existing && !existing.closed) continue;
      const link = new SessionLink(s, this.api, this.mqtt, this.equipment, this.metrics, this.log);
      this.links.set(s.id, link);
      await link
        .open()
        .catch((e) => this.log.warn('falha ao abrir sessão', { session: s.id, err: String(e) }));
    }
    for (const [id, l] of this.links) {
      if (active.has(id) && !l.closed) continue;
      l.shutdown();
      this.links.delete(id);
    }
  }

  start(intervalMs = 5_000): void {
    const loop = () => this.sync().catch((e) => this.log.warn('sync falhou', { err: String(e) }));
    void loop();
    this.poller = setInterval(loop, intervalMs);
  }

  stop(): void {
    if (this.poller) clearInterval(this.poller);
    for (const l of this.links.values()) l.shutdown();
    this.links.clear();
    this.mqtt.end(true);
  }

  prometheus(): string {
    return (
      Object.entries(this.metrics)
        .map(
          ([k, v]) =>
            `# TYPE pulse_bridge_${k} ${k.endsWith('connected') ? 'gauge' : 'counter'}\npulse_bridge_${k} ${v}`,
        )
        .join('\n') + '\n'
    );
  }
}
