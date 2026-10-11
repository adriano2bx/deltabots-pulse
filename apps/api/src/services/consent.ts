import type { ConsentPurpose } from '@pulse/contracts';
import type { Env } from '../env';
import { all, run } from '../lib/db';

/** Consentimentos ativos (não revogados e não expirados) de um titular. */
export async function activeConsents(
  db: D1Database,
  tenantId: string,
  userId: string,
): Promise<Set<ConsentPurpose>> {
  const rows = await all<{ purpose: ConsentPurpose }>(
    db,
    `SELECT purpose FROM consents WHERE tenant_id=? AND user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)`,
    tenantId,
    userId,
    new Date().toISOString(),
  );
  return new Set(rows.map((r) => r.purpose));
}

/**
 * Efeitos da revogação (docs/12): impede novas operações imediatamente e inicia remoção conforme política.
 */
export async function onConsentRevoked(
  env: Env,
  opts: { tenantId: string; userId: string; purpose: ConsentPurpose },
): Promise<void> {
  const now = new Date().toISOString();
  switch (opts.purpose) {
    case 'family_sharing':
      await run(
        env.DB,
        'UPDATE share_grants SET revoked_at=? WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL',
        now,
        opts.tenantId,
        opts.userId,
      );
      await run(
        env.DB,
        'UPDATE share_invitations SET revoked_at=? WHERE tenant_id=? AND owner_user_id=? AND revoked_at IS NULL AND accepted_at IS NULL',
        now,
        opts.tenantId,
        opts.userId,
      );
      break;
    case 'ai_analysis':
      await run(
        env.DB,
        'DELETE FROM ai_messages WHERE tenant_id=? AND conversation_id IN (SELECT id FROM ai_conversations WHERE tenant_id=? AND owner_user_id=?)',
        opts.tenantId,
        opts.tenantId,
        opts.userId,
      );
      await run(
        env.DB,
        'DELETE FROM ai_conversations WHERE tenant_id=? AND owner_user_id=?',
        opts.tenantId,
        opts.userId,
      );
      break;
    case 'gesture_raw_recording':
      await run(
        env.DB,
        'UPDATE gesture_training_sets SET deleted_at=? WHERE tenant_id=? AND owner_user_id=? AND deleted_at IS NULL',
        now,
        opts.tenantId,
        opts.userId,
      );
      break;
    default:
      break;
  }
}
