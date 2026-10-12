import { client } from '../lib/client';
import type { Page } from '../lib/api';
import { useResource } from '../lib/useResource';
import { View } from './Common';

interface Report { id: string; period: string; window: { from: string; to: string }; created_at: string }

export function Reports() {
  const [res, retry] = useResource(() => client.request<Page<Report>>('GET', '/reports'));
  async function generate(period: string) {
    await client.request('POST', '/reports', { period });
    retry();
  }
  return (
    <section>
      <h2>Relatórios</h2>
      <p className="muted">Resumos informativos, não diagnósticos. Exigem consentimento de saúde ativo.</p>
      <button onClick={() => void generate('weekly')}>Gerar semanal</button>
      <View res={res} retry={retry} empty={(p) => p.data.length === 0}>
        {(p) => (
          <table>
            <thead><tr><th>Período</th><th>Janela</th><th>Criado</th></tr></thead>
            <tbody>{p.data.map((r) => <tr key={r.id}><td>{r.period}</td><td>{r.window.from} → {r.window.to}</td><td>{r.created_at}</td></tr>)}</tbody>
          </table>
        )}
      </View>
    </section>
  );
}
