import { useState } from 'react';
import { ApiError } from '../lib/api';
import { apiConfigured, client } from '../lib/client';

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfa, setMfa] = useState('');
  const [needMfa, setNeedMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.login(email, password, mfa || undefined);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_REQUIRED') {
        setNeedMfa(true);
        setError('Informe o código do autenticador.');
      } else if (err instanceof ApiError) {
        setError(err.code === 'INVALID_CREDENTIALS' ? 'E-mail ou senha incorretos.' : `${err.message} (${err.code})`);
      } else {
        setError('Sem conexão com o servidor.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>DeltaBots Pulse</h1>
      {!apiConfigured && <p role="alert" className="notice error">VITE_API_BASE_URL não configurada neste build.</p>}
      <form onSubmit={submit}>
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} /></label>
        {needMfa && <label>Código MFA<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={mfa} onChange={(e) => setMfa(e.target.value)} required /></label>}
        {error && <p role="alert" className="notice error">{error}</p>}
        <button disabled={busy || !apiConfigured}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}
