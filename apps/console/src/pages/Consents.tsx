import { client } from '../lib/client';
import type { Page } from '../lib/api';
import { useResource } from '../lib/useResource';
import { View } from './Common';

interface Consent { id: string; purpose: string; policy_version: string; granted_at: string; revoked_at: string | null }

export function Consents() {
  const [res, retry] = useResource(() => client.request<Page<Consent>>('GET', '/consents'));
  async function revoke(id: string) {
    if (!window.confirm('Revogar este consentimento? A coleta e o processamento dessa finalidade serão interrompidos.')) return;
    await client.request('DELETE', `/consents/${id}`);
    retry();
  }
  return (
    <section>
      <h2>Consentimentos (LGPD)</h2>
      <View res={res} retry={retry} empty={(p) => p.data.length === 0}>
        {(p) => (
          <table>
            <thead><tr><th>Finalidade</th><th>Política</th><th>Concedido</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {p.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.purpose}</td><td>{c.policy_version}</td><td>{c.granted_at}</td>
                  <td>{c.revoked_at ? `revogado em ${c.revoked_at}` : 'ativo'}</td>
                  <td>{!c.revoked_at && <button onClick={() => void revoke(c.id)}>Revogar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </View>
    </section>
  );
}
