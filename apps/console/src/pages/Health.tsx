import { useState } from 'react';
import { client } from '../lib/client';
import { useResource } from '../lib/useResource';
import { View } from './Common';

interface Trend { points: { day: string; value: number | null }[]; summary?: string; timezone: string }

function Spark({ points }: { points: { day: string; value: number | null }[] }) {
  const vals = points.filter((p) => p.value !== null) as { day: string; value: number }[];
  if (vals.length < 2) return <p className="muted">Dados insuficientes para o gráfico.</p>;
  const min = Math.min(...vals.map((v) => v.value));
  const max = Math.max(...vals.map((v) => v.value));
  const span = max - min || 1;
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (vals.length - 1)) * 300},${70 - ((v.value - min) / span) * 60}`).join(' ');
  return (
    <svg viewBox="0 0 300 80" role="img" aria-label={`Série de ${vals.length} dias, de ${min} a ${max}`} width="100%" height="120">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Health() {
  const [kind, setKind] = useState<'heart_rate_bpm' | 'steps_delta'>('steps_delta');
  const [res, retry] = useResource(() => client.request<{ data: Trend }>('GET', '/health/trends', undefined, { kind, days: 30 }), [kind]);
  return (
    <section>
      <h2>Tendências (próprios dados)</h2>
      <p className="muted">Informativo; não é diagnóstico. Exige consentimento de saúde ativo.</p>
      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Métrica">
        <option value="steps_delta">Passos</option>
        <option value="heart_rate_bpm">Frequência cardíaca</option>
      </select>
      <View res={res} retry={retry}>
        {(r) => (
          <>
            {r.data.summary && <p>{r.data.summary}</p>}
            <Spark points={r.data.points} />
          </>
        )}
      </View>
    </section>
  );
}
