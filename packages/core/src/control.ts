import type { ControlState, SafetyClass } from '@pulse/contracts';

export type ControlEvent =
  | { type: 'arm_request'; localConfirmationId: string; now: Date; armTtlS: number }
  | { type: 'arm_confirmed'; now: Date }
  | { type: 'disarm'; reason: string; now: Date }
  | { type: 'heartbeat'; now: Date }
  | { type: 'tick'; now: Date }
  | { type: 'fault'; reason: string; now: Date };

export interface ControlSnapshot {
  state: ControlState;
  safetyClass: SafetyClass;
  sessionExpiresAt: string;
  armExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  heartbeatTimeoutMs: number;
  stateVersion: number;
}

export interface Transition {
  next: ControlSnapshot;
  changed: boolean;
  reason: string;
}

/**
 * Máquina de estados fail-closed (docs/06): DISARMED → ARM_REQUESTED → ARMED → DISARMED/EXPIRED/FAULT.
 * Equipamento safety_critical nunca arma.
 */
export function transition(s: ControlSnapshot, e: ControlEvent): Transition {
  const now = e.now.getTime();
  const bump = (state: ControlState, reason: string, extra: Partial<ControlSnapshot> = {}): Transition => ({
    next: { ...s, ...extra, state, stateVersion: s.stateVersion + 1 },
    changed: state !== s.state,
    reason,
  });
  const keep = (reason: string): Transition => ({ next: s, changed: false, reason });

  if (now >= new Date(s.sessionExpiresAt).getTime() && s.state !== 'EXPIRED') {
    return bump('EXPIRED', 'sessão de controle expirada', { armExpiresAt: null });
  }
  switch (e.type) {
    case 'arm_request':
      if (s.safetyClass === 'safety_critical')
        return bump('FAULT', 'equipamento safety_critical nunca pode ser armado');
      if (s.state !== 'DISARMED') return keep(`não é possível armar a partir de ${s.state}`);
      if (e.localConfirmationId.length < 8) return keep('confirmação local ausente');
      return bump('ARM_REQUESTED', 'armação solicitada com confirmação local', {
        armExpiresAt: new Date(now + e.armTtlS * 1000).toISOString(),
        lastHeartbeatAt: e.now.toISOString(),
      });
    case 'arm_confirmed':
      if (s.state !== 'ARM_REQUESTED') return keep('nenhuma armação pendente');
      return bump('ARMED', 'gateway físico confirmou armação', { lastHeartbeatAt: e.now.toISOString() });
    case 'disarm':
      if (s.state === 'DISARMED' || s.state === 'EXPIRED') return keep('já desarmado');
      return bump('DISARMED', `desarmado: ${e.reason}`, { armExpiresAt: null });
    case 'fault':
      return bump('FAULT', `falha: ${e.reason}`, { armExpiresAt: null });
    case 'heartbeat':
      if (s.state === 'ARMED' || s.state === 'ARM_REQUESTED')
        return { next: { ...s, lastHeartbeatAt: e.now.toISOString() }, changed: false, reason: 'heartbeat' };
      return keep('heartbeat ignorado fora de sessão armada');
    case 'tick': {
      if (s.state !== 'ARMED' && s.state !== 'ARM_REQUESTED') return keep('sem sessão armada');
      if (s.armExpiresAt && now >= new Date(s.armExpiresAt).getTime()) {
        return bump('DISARMED', 'tempo de armação esgotado', { armExpiresAt: null });
      }
      if (!s.lastHeartbeatAt || now - new Date(s.lastHeartbeatAt).getTime() > s.heartbeatTimeoutMs) {
        return bump('DISARMED', 'heartbeat ausente — desarme por segurança', { armExpiresAt: null });
      }
      return keep('armado e saudável');
    }
  }
}

export type CommandRejection =
  | 'CONTROL_DISARMED'
  | 'COMMAND_EXPIRED'
  | 'SAFETY_BLOCKED'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'CONFLICT';

/** Validação de um comando físico antes de roteá-lo (RF-05, RF-06, T006–T008, T017). */
export function validateCommand(opts: {
  snapshot: ControlSnapshot;
  now: Date;
  expiresAt: string;
  action: string;
  allowedActions: readonly string[];
  maxTtlMs: number;
  lastCommandAt: string | null;
  maxRateHz: number;
  expectedStateVersion?: number;
}): CommandRejection | null {
  const { snapshot: s, now } = opts;
  if (s.safetyClass === 'safety_critical') return 'SAFETY_BLOCKED';
  if (s.state !== 'ARMED') return 'CONTROL_DISARMED';
  const exp = new Date(opts.expiresAt).getTime();
  if (Number.isNaN(exp) || exp <= now.getTime()) return 'COMMAND_EXPIRED';
  if (exp - now.getTime() > opts.maxTtlMs) return 'VALIDATION_ERROR';
  if (!opts.allowedActions.includes(opts.action)) return 'SAFETY_BLOCKED';
  if (opts.lastCommandAt && now.getTime() - new Date(opts.lastCommandAt).getTime() < 1000 / opts.maxRateHz) {
    return 'RATE_LIMITED';
  }
  if (opts.expectedStateVersion !== undefined && opts.expectedStateVersion !== s.stateVersion)
    return 'CONFLICT';
  return null;
}
