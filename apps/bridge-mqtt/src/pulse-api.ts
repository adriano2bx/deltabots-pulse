import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ControlSessionInfo, PulseApi } from './types';

/**
 * Cliente HTTP da API Pulse com credencial de gateway. O refresh token é rotacionado a cada renovação e
 * persistido em volume gravável (a reutilização de um token antigo revoga a sessão — docs/12).
 */
export class HttpPulseApi implements PulseApi {
  private access: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly initialTokenPath: string,
    private readonly statePath: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async refreshToken(): Promise<string> {
    try {
      return (await readFile(this.statePath, 'utf8')).trim();
    } catch {
      return (await readFile(this.initialTokenPath, 'utf8')).trim();
    }
  }

  private async token(): Promise<string> {
    if (this.access && this.access.expiresAt - Date.now() > 60_000) return this.access.token;
    const res = await this.fetchImpl(`${this.baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: await this.refreshToken() }),
    });
    if (!res.ok) throw new Error(`refresh falhou: HTTP ${res.status}`);
    const t = (await res.json()) as { access_token: string; expires_in: number; refresh_token: string };
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, t.refresh_token, { mode: 0o600 });
    this.access = { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
    return t.access_token;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        authorization: `Bearer ${await this.token()}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async listSessions(): Promise<ControlSessionInfo[]> {
    return (await this.call<{ data: ControlSessionInfo[] }>('/control/gateway-sessions')).data;
  }

  async ticket(sessionId: string, equipmentId: string): Promise<{ url: string }> {
    return (
      await this.call<{ data: { url: string } }>('/realtime/ticket', {
        method: 'POST',
        body: JSON.stringify({
          purpose: 'mqtt_bridge',
          control_session_id: sessionId,
          equipment_id: equipmentId,
        }),
      })
    ).data;
  }
}
