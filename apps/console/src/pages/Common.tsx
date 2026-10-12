import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import type { Resource } from '../lib/useResource';

export function View<T>({ res, retry, empty, children }: { res: Resource<T>; retry: () => void; empty?: (d: T) => boolean; children: (d: T) => ReactNode }) {
  if (res.status === 'loading') return <p role="status">Carregando…</p>;
  if (res.status === 'error') {
    const e = res.error;
    const code = e instanceof ApiError ? e.code : 'ERRO';
    const msg = code === 'FORBIDDEN' ? 'Seu papel não permite ver este módulo.' : e.message;
    return (
      <div role="alert" className="notice error">
        <strong>{code}</strong> {msg}
        {e instanceof ApiError && e.traceId ? <small> (trace {e.traceId})</small> : null}
        <div>
          <button onClick={retry}>Tentar novamente</button>
        </div>
      </div>
    );
  }
  if (empty?.(res.data)) return <p className="notice">Nada por aqui ainda.</p>;
  return <>{children(res.data)}</>;
}
