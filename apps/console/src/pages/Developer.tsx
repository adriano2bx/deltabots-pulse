import { useState } from 'react';
import { client } from '../lib/client';
import type { Page } from '../lib/api';
import { useResource } from '../lib/useResource';
import { View } from './Common';

interface ApiKey { id: string; key_prefix: string; label: string | null; scopes: string[]; expires_at: string | null; revoked_at: string | null; last_used_at: string | null }
interface Webhook { id: string; url: string; event_types: string[]; enabled: boolean }

const KEY_SCOPES = ['profile:read', 'devices:read', 'telemetry:read', 'automations:read'] as const;
const EVENTS = ['telemetry.batch_ingested', 'alert.created', 'automation.executed', 'device.status_changed', 'report.generated', 'checkin.created'] as const;

function Secret({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  return (
    <div role="alert" className="notice">
      <strong>{label} — exibido uma única vez.</strong> Copie agora; não será possível ver de novo.
      <pre style={{ overflowX: 'auto' }}>{value}</pre>
      <button onClick={() => void navigator.clipboard.writeText(value)}>Copiar</button> <button onClick={onClose}>Já guardei</button>
    </div>
  );
}

export function ApiKeys() {
  const [res, retry] = useResource(() => client.request<Page<ApiKey>>('GET', '/api-keys'));
  const [scopes, setScopes] = useState<string[]>(['telemetry:read']);
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const r = await client.request<{ data: { secret: string } }>('POST', '/api-keys', { label: label || undefined, scopes });
      setSecret(r.data.secret);
      retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha');
    }
  }
  async function revoke(id: string) {
    if (!window.confirm('Revogar esta chave? Integrações que a usam deixam de funcionar.')) return;
    await client.request('DELETE', `/api-keys/${id}`);
    retry();
  }
  return (
    <section>
      <h3>Chaves de API</h3>
      <p className="muted">Escopos mínimos; chaves nunca recebem permissões administrativas nem de controle. Exige MFA.</p>
      {secret && <Secret label="Chave criada" value={secret} onClose={() => setSecret(null)} />}
      <fieldset>
        <legend>Nova chave</legend>
        <label>Rótulo<input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} /></label>
        {KEY_SCOPES.map((s) => (
          <label key={s}><input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} /> {s}</label>
        ))}
        {error && <p role="alert" className="notice error">{error}</p>}
        <button disabled={scopes.length === 0} onClick={() => void create()}>Criar chave</button>
      </fieldset>
      <View res={res} retry={retry} empty={(p) => p.data.length === 0}>
        {(p) => (
          <table>
            <thead><tr><th>Prefixo</th><th>Rótulo</th><th>Escopos</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {p.data.map((k) => (
                <tr key={k.id}><td><code>{k.key_prefix}…</code></td><td>{k.label ?? '—'}</td><td>{k.scopes.join(', ')}</td><td>{k.revoked_at ? 'revogada' : 'ativa'}</td>
                  <td>{!k.revoked_at && <button onClick={() => void revoke(k.id)}>Revogar</button>}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </View>
    </section>
  );
}

export function Webhooks() {
  const [res, retry] = useResource(() => client.request<Page<Webhook>>('GET', '/webhooks'));
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['alert.created']);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const r = await client.request<{ data: { secret: string } }>('POST', '/webhooks', { url, event_types: events });
      setSecret(r.data.secret);
      setUrl('');
      retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha');
    }
  }
  async function remove(id: string) {
    if (!window.confirm('Remover este webhook?')) return;
    await client.request('DELETE', `/webhooks/${id}`);
    retry();
  }
  return (
    <section>
      <h3>Webhooks</h3>
      <p className="muted">Somente HTTPS; endereços internos são recusados. Cada entrega é assinada com o segredo abaixo.</p>
      {secret && <Secret label="Segredo de assinatura" value={secret} onClose={() => setSecret(null)} />}
      <fieldset>
        <legend>Novo webhook</legend>
        <label>URL (https)<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        {EVENTS.map((s) => (
          <label key={s}><input type="checkbox" checked={events.includes(s)} onChange={(e) => setEvents(e.target.checked ? [...events, s] : events.filter((x) => x !== s))} /> {s}</label>
        ))}
        {error && <p role="alert" className="notice error">{error}</p>}
        <button disabled={!url.startsWith('https://') || events.length === 0} onClick={() => void create()}>Criar webhook</button>
      </fieldset>
      <View res={res} retry={retry} empty={(p) => p.data.length === 0}>
        {(p) => (
          <table>
            <thead><tr><th>URL</th><th>Eventos</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {p.data.map((w) => (
                <tr key={w.id}><td>{w.url}</td><td>{w.event_types.join(', ')}</td><td>{w.enabled ? 'ativo' : 'inativo'}</td><td><button onClick={() => void remove(w.id)}>Remover</button></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </View>
    </section>
  );
}

export function Developer() {
  return (
    <>
      <h2>Desenvolvedor</h2>
      <ApiKeys />
      <Webhooks />
    </>
  );
}
