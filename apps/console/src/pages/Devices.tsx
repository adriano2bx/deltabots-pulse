import { client } from '../lib/client';
import type { Page } from '../lib/api';
import { useResource } from '../lib/useResource';
import { View } from './Common';

interface Device { id: string; model: string; alias: string | null; firmware: string | null; last_seen_at: string | null }

export function Devices() {
  const [res, retry] = useResource(() => client.request<Page<Device>>('GET', '/devices', undefined, { scope: 'org' }).catch(() => client.request<Page<Device>>('GET', '/devices')));
  return (
    <section>
      <h2>Dispositivos</h2>
      <p className="muted">Inventário de metadados; nenhum dado de saúde aparece aqui.</p>
      <View res={res} retry={retry} empty={(p) => p.data.length === 0}>
        {(p) => (
          <table>
            <thead><tr><th>Modelo</th><th>Apelido</th><th>Firmware</th><th>Visto por último</th></tr></thead>
            <tbody>
              {p.data.map((d) => (
                <tr key={d.id}><td>{d.model}</td><td>{d.alias ?? '—'}</td><td>{d.firmware ?? '—'}</td><td>{d.last_seen_at ?? 'nunca'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </View>
    </section>
  );
}
