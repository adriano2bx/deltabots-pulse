import { metricForKind, type GrantScope, type ShareMetric, type TelemetryKind } from '@pulse/contracts';
import { PulseError, canReadHealth, type GrantView, type Principal } from '@pulse/core';
import { all, first } from '../lib/db';
import { activeConsents } from './consent';

export interface DeviceRow {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  gateway_id: string | null;
  model: string;
  firmware: string | null;
  manufacturer: string | null;
  alias: string | null;
  transport: string;
  last_seen_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export async function loadGrants(
  db: D1Database,
  tenantId: string,
  granteeUserId: string,
): Promise<GrantView[]> {
  const rows = await all<{
    owner_user_id: string;
    grantee_user_id: string;
    scope_json: string;
    expires_at: string | null;
    revoked_at: string | null;
  }>(
    db,
    'SELECT owner_user_id,grantee_user_id,scope_json,expires_at,revoked_at FROM share_grants WHERE tenant_id=? AND grantee_user_id=? AND revoked_at IS NULL',
    tenantId,
    granteeUserId,
  );
  return rows.map((r) => ({
    ownerUserId: r.owner_user_id,
    granteeUserId: r.grantee_user_id,
    scope: JSON.parse(r.scope_json) as GrantScope,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  }));
}

/** Carrega um dispositivo do tenant da sessão; outro tenant ou inexistente → 404 (sem vazar existência). */
export async function loadDevice(db: D1Database, p: Principal, deviceId: string): Promise<DeviceRow> {
  const d = await first<DeviceRow>(
    db,
    'SELECT * FROM devices WHERE id=? AND tenant_id=? AND revoked_at IS NULL',
    deviceId,
    p.tenantId,
  );
  if (!d) throw new PulseError('NOT_FOUND');
  return d;
}

export async function loadOwnedDevice(db: D1Database, p: Principal, deviceId: string): Promise<DeviceRow> {
  const d = await loadDevice(db, p, deviceId);
  if (d.owner_user_id !== p.userId) throw new PulseError('NOT_FOUND');
  return d;
}

/**
 * Garante leitura de saúde de `ownerUserId` para a métrica; lança 404 para não-autorizado (evita enumeração)
 * exceto quando o próprio titular não consentiu (CONSENT_REQUIRED).
 */
export async function assertHealthRead(
  db: D1Database,
  p: Principal,
  ownerUserId: string,
  metric: ShareMetric,
  opts: { deviceId?: string; observedFrom?: Date } = {},
): Promise<void> {
  const grants = p.userId === ownerUserId ? [] : await loadGrants(db, p.tenantId, p.userId);
  const ownerConsents = await activeConsents(db, p.tenantId, ownerUserId);
  const d = canReadHealth(p, ownerUserId, metric, {
    grants,
    now: new Date(),
    deviceId: opts.deviceId,
    observedFrom: opts.observedFrom,
    ownerConsentCloudHealth: ownerConsents.has('cloud_sync_health'),
  });
  if (!d.allow) {
    if (p.userId === ownerUserId) throw new PulseError('CONSENT_REQUIRED', d.reason);
    throw new PulseError('NOT_FOUND');
  }
}

export function metricOf(kind: TelemetryKind): ShareMetric {
  return metricForKind[kind];
}

/** Tipos que constituem dado de saúde (exigem consentimento de processamento e sincronização). */
export const HEALTH_KINDS: ReadonlySet<TelemetryKind> = new Set([
  'heart_rate_bpm',
  'steps_delta',
  'steps_total',
  'sleep_interval',
  'activity',
]);
