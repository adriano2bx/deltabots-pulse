import type { GrantScope, OrgRole, Scope, ShareMetric } from '@pulse/contracts';

export type PrincipalKind = 'user' | 'api_key' | 'gateway';

export interface Principal {
  kind: PrincipalKind;
  userId: string;
  tenantId: string;
  orgRole: OrgRole | null;
  scopes: ReadonlySet<Scope>;
  mfa: boolean;
  sessionId?: string;
  gatewayId?: string;
  apiKeyId?: string;
}

export interface Decision {
  allow: boolean;
  reason: string;
}

const allow = (reason: string): Decision => ({ allow: true, reason });
const deny = (reason: string): Decision => ({ allow: false, reason });

/** Escopos concedidos a uma sessão interativa do próprio usuário. */
export const USER_SESSION_SCOPES: readonly Scope[] = [
  'profile:read',
  'profile:write',
  'devices:read',
  'devices:write',
  'telemetry:read',
  'telemetry:write',
  'automations:read',
  'automations:write',
  'realtime:read',
  'gesture:stream',
  'control:arm',
  'control:execute',
  'device:ack',
  'ai:use',
  'share:manage',
  'org:manage',
  'mcp:tools',
];

/** Escopos de um gateway Android autenticado (sem gestão de conta). */
export const GATEWAY_SCOPES: readonly Scope[] = [
  'devices:read',
  'devices:write',
  'telemetry:write',
  'realtime:read',
  'gesture:stream',
  'control:arm',
  'device:ack',
];

export function hasScope(p: Principal, scope: Scope): boolean {
  return p.scopes.has(scope);
}

export interface GrantView {
  ownerUserId: string;
  granteeUserId: string;
  scope: GrantScope;
  expiresAt: string | null;
  revokedAt: string | null;
}

/**
 * Leitura de dados de saúde (P0). Regras (docs/12):
 * - titular lê os próprios dados;
 * - family_viewer/caregiver somente via grant ativo, métrica e dispositivo concedidos e dentro da janela;
 * - org_admin/operator/developer NÃO ganham acesso implícito;
 * - API key exige escopo e consentimento explícito do titular.
 */
export function canReadHealth(
  p: Principal,
  ownerUserId: string,
  metric: ShareMetric,
  ctx: {
    grants: readonly GrantView[];
    now: Date;
    deviceId?: string;
    observedFrom?: Date;
    ownerConsentCloudHealth: boolean;
  },
): Decision {
  if (!hasScope(p, 'telemetry:read')) return deny('escopo telemetry:read ausente');
  if (p.userId === ownerUserId) {
    if (p.kind === 'api_key' && !ctx.ownerConsentCloudHealth)
      return deny('consentimento cloud_sync_health ausente');
    return allow('titular');
  }
  if (p.kind !== 'user') return deny('somente o titular ou beneficiário humano');
  const grant = ctx.grants.find(
    (g) =>
      g.ownerUserId === ownerUserId &&
      g.granteeUserId === p.userId &&
      g.revokedAt === null &&
      (g.expiresAt === null || new Date(g.expiresAt) > ctx.now),
  );
  if (!grant) return deny('sem concessão ativa');
  if (!grant.scope.metrics.includes(metric)) return deny(`métrica ${metric} não concedida`);
  if (ctx.deviceId && grant.scope.device_ids.length > 0 && !grant.scope.device_ids.includes(ctx.deviceId)) {
    return deny('dispositivo não concedido');
  }
  if (ctx.observedFrom) {
    const earliest = ctx.now.getTime() - grant.scope.history_days * 86400000;
    if (ctx.observedFrom.getTime() < earliest) return deny('fora da janela de histórico concedida');
  }
  return allow(`grant ${grant.scope.role}`);
}

/** Comandos de dispositivo: nunca por family_viewer/caregiver, nunca por API key sem escopo. */
export function canCommandDevice(p: Principal, ownerUserId: string): Decision {
  if (p.userId !== ownerUserId) return deny('apenas o titular comanda o dispositivo');
  if (!hasScope(p, 'devices:write')) return deny('escopo devices:write ausente');
  return allow('titular');
}

export function canManageOrg(p: Principal): Decision {
  if (!hasScope(p, 'org:manage')) return deny('escopo org:manage ausente');
  if (p.orgRole === 'owner' || p.orgRole === 'org_admin') {
    if (!p.mfa) return deny('MFA obrigatório para administração');
    return allow(p.orgRole);
  }
  return deny('papel insuficiente');
}

export function canReadAudit(p: Principal): Decision {
  if (
    !hasScope(p, 'admin:read') &&
    p.orgRole !== 'owner' &&
    p.orgRole !== 'org_admin' &&
    p.orgRole !== 'operator'
  ) {
    return deny('papel insuficiente');
  }
  if (!p.mfa) return deny('MFA obrigatório');
  return allow('auditoria minimizada');
}

export function canArmControl(p: Principal, equipmentOwnerId: string | null): Decision {
  if (!hasScope(p, 'control:arm')) return deny('escopo control:arm ausente');
  if (equipmentOwnerId !== null && equipmentOwnerId !== p.userId) return deny('equipamento de outro titular');
  return allow('titular do equipamento');
}
