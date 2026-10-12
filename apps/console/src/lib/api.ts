/** Cliente da API Pulse. Token de acesso só em memória; refresh em sessionStorage (some ao fechar a aba). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly traceId = '',
  ) {
    super(message);
  }
}

export interface Session {
  accessToken: string;
  expiresAtMs: number;
  refreshToken: string;
}

export interface SessionStorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const REFRESH_KEY = 'pulse.refresh';

export class PulseClient {
  private session: Session | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly storage: SessionStorageLike,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    private readonly now: () => number = Date.now,
  ) {}

  get signedIn(): boolean {
    return this.session !== null || this.storage.getItem(REFRESH_KEY) !== null;
  }

  private setSession(t: { access_token: string; expires_in: number; refresh_token?: string }) {
    const refreshToken = t.refresh_token ?? this.session?.refreshToken ?? this.storage.getItem(REFRESH_KEY) ?? '';
    this.session = { accessToken: t.access_token, expiresAtMs: this.now() + t.expires_in * 1000, refreshToken };
    this.storage.setItem(REFRESH_KEY, refreshToken);
  }

  async login(email: string, password: string, mfaCode?: string): Promise<void> {
    const t = await this.raw<{ access_token: string; expires_in: number; refresh_token: string }>('POST', '/auth/login', {
      email,
      password,
      device_label: 'console-web',
      ...(mfaCode ? { mfa_code: mfaCode } : {}),
    });
    this.setSession(t);
  }

  async logout(): Promise<void> {
    try {
      if (this.session) await this.request('POST', '/auth/logout');
    } finally {
      this.session = null;
      this.storage.removeItem(REFRESH_KEY);
    }
  }

  private async refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      const refresh = this.session?.refreshToken ?? this.storage.getItem(REFRESH_KEY);
      if (!refresh) throw new ApiError(401, 'AUTH_REQUIRED', 'sessão ausente');
      try {
        const t = await this.raw<{ access_token: string; expires_in: number; refresh_token?: string }>('POST', '/auth/refresh', {
          refresh_token: refresh,
        });
        this.setSession(t);
      } catch (e) {
        this.session = null;
        this.storage.removeItem(REFRESH_KEY);
        throw e;
      }
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    if (!this.session || this.session.expiresAtMs - this.now() < 60_000) await this.refresh();
    const token = this.session?.accessToken;
    return this.raw<T>(method, path, body, query, token);
  }

  private async raw<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>, token?: string): Promise<T> {
    const qs = query
      ? '?' +
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const res = await this.fetchImpl(`${this.baseUrl}/v1${path}${qs === '?' ? '' : qs}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new ApiError(res.status, String(json.code ?? 'INTERNAL_ERROR'), String(json.detail ?? json.title ?? 'erro'), String(json.trace_id ?? ''));
    }
    return json as T;
  }
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
  meta?: Record<string, unknown>;
}
