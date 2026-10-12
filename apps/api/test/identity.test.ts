import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { totp } from '../src/lib/totp';
import { call, json, registerUser } from './helpers';

describe('saúde do serviço e contrato', () => {
  it('serve status e o OpenAPI 3.1', async () => {
    const s = await call('/status');
    expect(s.status).toBe(200);
    const o = await call('/openapi.yaml');
    expect(await o.text()).toMatch(/^openapi: 3\.1/m);
  });
  it('erros seguem problem+json com trace_id', async () => {
    const r = await call('/me');
    expect(r.status).toBe(401);
    expect(r.headers.get('content-type')).toContain('application/problem+json');
    const p = await json<{ code: string; trace_id: string }>(r);
    expect(p.code).toBe('AUTH_REQUIRED');
    expect(p.trace_id).toMatch(/^trc_/);
  });
  it('CORS só para origens da allowlist', async () => {
    const ok = await call('/status', { method: 'OPTIONS', headers: { origin: 'https://console.test' } });
    expect(ok.status).toBe(204);
    const bad = await call('/status', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } });
    expect(bad.status).toBe(403);
  });
});

describe('registro, login e sessão', () => {
  it('registra com organização pessoal e papel owner', async () => {
    const u = await registerUser();
    const me = await json<{ data: { org_role: string; email: string; mfa_enabled: boolean } }>(
      await call('/me', { token: u.access }),
    );
    expect(me.data.org_role).toBe('owner');
    expect(me.data.mfa_enabled).toBe(false);
    const audits = await env.DB.prepare('SELECT action FROM audit_events WHERE tenant_id=?')
      .bind(u.tenantId)
      .all<{ action: string }>();
    expect(audits.results.map((a) => a.action)).toContain('auth.register');
  });

  it('rejeita senha fraca e e-mail duplicado', async () => {
    const weak = await call('/auth/register', {
      method: 'POST',
      json: { email: 'x@example.test', password: 'curta', accepted_terms_version: 'v1' },
    });
    expect(weak.status).toBe(400);
    const u = await registerUser();
    const dup = await call('/auth/register', {
      method: 'POST',
      json: { email: u.email, password: 'outra-senha-123', accepted_terms_version: 'v1' },
    });
    expect(dup.status).toBe(409);
  });

  it('login, refresh com rotação e detecção de reuso', async () => {
    const u = await registerUser();
    const login = await json<{ refresh_token: string; access_token: string }>(
      await call('/auth/login', { method: 'POST', json: { email: u.email, password: u.password } }),
    );
    const r1 = await call('/auth/refresh', { method: 'POST', json: { refresh_token: login.refresh_token } });
    expect(r1.status).toBe(200);
    const t1 = await json<{ refresh_token: string; access_token: string }>(r1);
    // Reuso do refresh antigo revoga a sessão inteira.
    const reuse = await call('/auth/refresh', {
      method: 'POST',
      json: { refresh_token: login.refresh_token },
    });
    expect(reuse.status).toBe(401);
    const after = await call('/me', { token: t1.access_token });
    expect(after.status).toBe(401);
  });

  it('senha errada não revela existência e bloqueia após tentativas', async () => {
    const u = await registerUser();
    const bad = await call('/auth/login', {
      method: 'POST',
      json: { email: u.email, password: 'senha-errada-999' },
    });
    const none = await call('/auth/login', {
      method: 'POST',
      json: { email: 'ninguem@example.test', password: 'senha-errada-999' },
    });
    expect(bad.status).toBe(401);
    expect(none.status).toBe(401);
    expect((await json<{ detail: string }>(bad)).detail).toBe((await json<{ detail: string }>(none)).detail);
  });

  it('logout revoga a sessão imediatamente', async () => {
    const u = await registerUser();
    expect((await call('/auth/logout', { method: 'POST', token: u.access })).status).toBe(200);
    expect((await call('/me', { token: u.access })).status).toBe(401);
  });

  it('lista e revoga sessões próprias', async () => {
    const u = await registerUser();
    const other = await json<{ session_id: string }>(
      await call('/auth/login', {
        method: 'POST',
        json: { email: u.email, password: u.password, device_label: 'Tablet' },
      }),
    );
    const list = await json<{ data: Array<{ id: string; current: boolean }> }>(
      await call('/me/sessions', { token: u.access }),
    );
    expect(list.data.length).toBe(2);
    expect(list.data.find((s) => s.current)?.id).toBe(u.sessionId);
    expect(
      (await call(`/me/sessions/${other.session_id}`, { method: 'DELETE', token: u.access })).status,
    ).toBe(200);
  });
});

describe('MFA TOTP (F124)', () => {
  it('configura, exige código no login e eleva sessão', async () => {
    const u = await registerUser();
    const setup = await json<{ data: { secret_base32: string } }>(
      await call('/auth/mfa/setup', { method: 'POST', token: u.access }),
    );
    const code = await totp(setup.data.secret_base32, Date.now());
    expect((await call('/auth/mfa/verify', { method: 'POST', token: u.access, json: { code } })).status).toBe(
      200,
    );
    const noCode = await call('/auth/login', {
      method: 'POST',
      json: { email: u.email, password: u.password },
    });
    expect((await json<{ code: string }>(noCode)).code).toBe('MFA_REQUIRED');
    const withCode = await call('/auth/login', {
      method: 'POST',
      json: {
        email: u.email,
        password: u.password,
        mfa_code: await totp(setup.data.secret_base32, Date.now()),
      },
    });
    expect(withCode.status).toBe(200);
    const me = await json<{ data: { session_mfa: boolean } }>(
      await call('/me', { token: (await json<{ access_token: string }>(withCode)).access_token }),
    );
    expect(me.data.session_mfa).toBe(true);
  });
});

describe('consentimentos (F115, F136)', () => {
  it('concede por finalidade, substitui versão e revoga', async () => {
    const u = await registerUser();
    const a = await call('/consents', {
      method: 'POST',
      token: u.access,
      json: { purpose: 'health_processing', policy_version: '2026-10' },
    });
    expect(a.status).toBe(201);
    const b = await json<{ data: { id: string } }>(
      await call('/consents', {
        method: 'POST',
        token: u.access,
        json: { purpose: 'health_processing', policy_version: '2026-11' },
      }),
    );
    const list = await json<{
      data: Array<{ id: string; revoked_at: string | null; policy_version: string }>;
    }>(await call('/consents', { token: u.access }));
    expect(list.data.filter((x) => x.revoked_at === null)).toHaveLength(1);
    expect((await call(`/consents/${b.data.id}`, { method: 'DELETE', token: u.access })).status).toBe(200);
  });
  it('não revoga consentimento de outra pessoa (T001)', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const cns = await json<{ data: { id: string } }>(
      await call('/consents', {
        method: 'POST',
        token: a.access,
        json: { purpose: 'ai_analysis', policy_version: 'v1' },
      }),
    );
    expect((await call(`/consents/${cns.data.id}`, { method: 'DELETE', token: b.access })).status).toBe(404);
  });
});

describe('organizações e RBAC', () => {
  it('convite exige MFA; membro aceita com a própria conta', async () => {
    const admin = await registerUser('Admin');
    const org = await json<{ data: { id: string } }>(
      await call('/organizations', {
        method: 'POST',
        token: admin.access,
        json: { name: 'Equipe DeltaBots' },
      }),
    );
    const sw = await json<{ access_token: string }>(
      await call('/auth/switch-tenant', {
        method: 'POST',
        token: admin.access,
        json: { tenant_id: org.data.id },
      }),
    );
    const member = await registerUser('Membro');
    const noMfa = await call(`/organizations/${org.data.id}/members`, {
      method: 'POST',
      token: sw.access_token,
      json: { email: member.email, role: 'member' },
    });
    expect((await json<{ code: string }>(noMfa)).code).toBe('MFA_REQUIRED');
    const setup = await json<{ data: { secret_base32: string } }>(
      await call('/auth/mfa/setup', { method: 'POST', token: sw.access_token }),
    );
    await call('/auth/mfa/verify', {
      method: 'POST',
      token: sw.access_token,
      json: { code: await totp(setup.data.secret_base32, Date.now()) },
    });
    const inv = await call(`/organizations/${org.data.id}/members`, {
      method: 'POST',
      token: sw.access_token,
      json: { email: member.email, role: 'member' },
    });
    expect(inv.status).toBe(201);
    const { data } = await json<{ data: { invite_token: string } }>(inv);
    const intruder = await registerUser('Intruso');
    expect(
      (
        await call('/organizations/invitations/accept', {
          method: 'POST',
          token: intruder.access,
          json: { invite_token: data.invite_token },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('/organizations/invitations/accept', {
          method: 'POST',
          token: member.access,
          json: { invite_token: data.invite_token },
        })
      ).status,
    ).toBe(200);
  });
  it('não acessa membros de outro tenant (TENANT_MISMATCH)', async () => {
    const a = await registerUser();
    const b = await registerUser();
    expect((await call(`/organizations/${b.tenantId}/members`, { token: a.access })).status).toBe(404);
  });
  it('limita tentativas de login por e-mail (RATE_LIMITED após 10)', async () => {
    const email = `brute${Date.now()}@example.test`;
    const attempt = () =>
      call('/auth/login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.77' },
        json: { email, password: 'senha-errada-123' },
      });
    for (let i = 0; i < 10; i += 1) expect((await attempt()).status).not.toBe(429);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { code: string }).code).toBe('RATE_LIMITED');
  });
});
