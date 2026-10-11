import { MqttStatus } from '@pulse/contracts';

export const STATUS_FRESH_MS = 10_000;

export interface EquipmentState {
  online: boolean;
  armed: boolean;
  seenAt: number;
}

/** Estado reportado pelo equipamento via tópico `status` (LWT marca offline). */
export class EquipmentRegistry {
  private readonly states = new Map<string, EquipmentState>();

  update(tenantId: string, equipmentId: string, raw: unknown, now = Date.now()): boolean {
    const p = MqttStatus.safeParse(raw);
    if (!p.success || p.data.equipment_id !== equipmentId) return false;
    this.states.set(`${tenantId}/${equipmentId}`, {
      online: p.data.online,
      armed: p.data.armed === true,
      seenAt: now,
    });
    return true;
  }

  /** Pronto para atuar: online, chave física armada e status recente. */
  ready(tenantId: string, equipmentId: string, now = Date.now()): boolean {
    const s = this.states.get(`${tenantId}/${equipmentId}`);
    return !!s && s.online && s.armed && now - s.seenAt <= STATUS_FRESH_MS;
  }

  get(tenantId: string, equipmentId: string): EquipmentState | undefined {
    return this.states.get(`${tenantId}/${equipmentId}`);
  }
}
