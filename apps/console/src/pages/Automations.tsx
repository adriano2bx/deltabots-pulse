import { client } from '../lib/client';
import type { Page } from '../lib/api';
import { useResource } from '../lib/useResource';
import { View } from './Common';

interface Automation { id: string; title: string; enabled: boolean; version: number; risk_level: string; updated_at: string }

export function Automations() {
  const [res, retry] = useResource(() => client.request<Page<Automation>>('GET', '/automations'));
  return (
    <section>
      <h2>Automações</h2>
      <View res={res} retry={retry} empty={(p) => p.data.length === 0}>
        {(p) => (
          <>
            {p.meta?.kill_switch ? <p role="alert" className="notice error">Kill switch ativo: nenhuma automação executa.</p> : null}
            <table>
              <thead><tr><th>Título</th><th>Risco</th><th>Versão</th><th>Estado</th></tr></thead>
              <tbody>
                {p.data.map((a) => (
                  <tr key={a.id}><td>{a.title}</td><td>{a.risk_level}</td><td>v{a.version}</td><td>{a.enabled ? 'ativa' : 'desativada'}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </View>
    </section>
  );
}
