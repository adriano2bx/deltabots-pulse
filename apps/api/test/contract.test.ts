import { describe, expect, it } from 'vitest';
import openapi from '@pulse/contracts/openapi.yaml';
import { call } from './helpers';

/** Extrai (método, caminho) do OpenAPI sem dependências de parser (formato estável do arquivo da spec). */
function operations(yaml: string): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  let current: string | null = null;
  let inPaths = false;
  for (const line of yaml.split('\n')) {
    if (/^paths:\s*$/.test(line)) inPaths = true;
    else if (/^\S/.test(line)) inPaths = false;
    if (!inPaths) continue;
    const p = line.match(/^ {2}(\/\S*):\s*$/);
    if (p) current = p[1] as string;
    const m = line.match(/^ {4}(get|post|patch|put|delete):\s*$/);
    if (m && current) out.push({ method: m[1]!.toUpperCase(), path: current });
  }
  return out;
}

describe('cobertura do contrato OpenAPI', () => {
  const ops = operations(openapi).filter(
    (o) => !o.path.includes('theme') && !o.path.startsWith('/themes') && !o.path.startsWith('/admin/themes'),
  );
  it('lista as operações da spec (exceto temas — ADR-0005)', () => {
    expect(ops.length).toBeGreaterThanOrEqual(70);
  });
  it.each(ops)('$method $path está implementada', async ({ method, path }) => {
    const concrete = path.replace(/\{[^}]+\}/g, 'id_00000000000');
    const res = await call(concrete, {
      method,
      ...(method === 'GET' || method === 'DELETE' ? {} : { json: {} }),
    });
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    // Rota inexistente → 404 "rota inexistente"; existente sem credencial → 401/400.
    expect(body.detail).not.toBe('rota inexistente');
  });
});
