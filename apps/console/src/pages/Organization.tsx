import { client } from '../lib/client';
import type { Page } from '../lib/api';
import { useResource } from '../lib/useResource';
import { View } from './Common';

interface Org { id: string; name: string; plan_id: string; status: string; role: string }
interface Member { id: string; user_id: string; display_name: string | null; role: string; status: string }

function Members({ orgId }: { orgId: string }) {
  const [res, retry] = useResource(() => client.request<Page<Member>>('GET', `/organizations/${orgId}/members`), [orgId]);
  return (
    <View res={res} retry={retry} empty={(p) => p.data.length === 0}>
      {(p) => (
        <table>
          <thead><tr><th>Nome</th><th>Papel</th><th>Estado</th></tr></thead>
          <tbody>{p.data.map((m) => <tr key={m.id}><td>{m.display_name ?? m.user_id}</td><td>{m.role}</td><td>{m.status}</td></tr>)}</tbody>
        </table>
      )}
    </View>
  );
}

export function Organization() {
  const [res, retry] = useResource(() => client.request<Page<Org>>('GET', '/organizations'));
  return (
    <section>
      <h2>Organização</h2>
      <View res={res} retry={retry} empty={(p) => p.data.length === 0}>
        {(p) => p.data.map((o) => (
          <article key={o.id}>
            <h3>{o.name}</h3>
            <p className="muted">Plano {o.plan_id} · {o.status} · seu papel: {o.role}</p>
            <Members orgId={o.id} />
          </article>
        ))}
      </View>
    </section>
  );
}
