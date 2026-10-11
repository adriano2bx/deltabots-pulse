export interface ControlSessionInfo {
  id: string;
  tenant_id: string;
  equipment_id: string;
  state: string;
  expires_at: string;
}

/** Acesso à API Pulse (injetável para testes). */
export interface PulseApi {
  listSessions(): Promise<ControlSessionInfo[]>;
  ticket(sessionId: string, equipmentId: string): Promise<{ url: string }>;
}

export interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

export interface BridgeMetrics {
  ws_connected: number;
  mqtt_connected: number;
  commands_forwarded: number;
  commands_rejected: number;
  acks_forwarded: number;
  acl_rejections: number;
  reconnects: number;
}
