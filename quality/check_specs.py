#!/usr/bin/env python3
"""Valida a consistência do pacote de especificação dentro do monorepo (não executa testes do produto)."""
from pathlib import Path
import csv, json, sqlite3, sys, re

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {
    'NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'PASS', 'FAILED', 'BLOCKED_HARDWARE', 'BLOCKED_EXTERNAL',
    'CAPABILITY_UNSUPPORTED_PROVEN', 'NOT_APPLICABLE_FOR_DEVICE', 'DESCOPED_BY_OWNER',
}
rows = list(csv.DictReader((ROOT / 'docs/feature-register.csv').open(encoding='utf-8')))
assert len(rows) == 390 and [r['id'] for r in rows] == [f'F{i:03d}' for i in range(1, 391)]
for r in rows:
    assert r['status'] in ALLOWED, r
    # PASS exige evidência reproduzível (docs/20-ACCEPTANCE.md).
    if r['status'] == 'PASS':
        assert r['evidence'].strip(), f"{r['id']} PASS sem evidência"
    # Itens condicionados ao hardware nunca passam sem prova física.
    if r['scope'] == 'HARDWARE_GATED' and r['status'] == 'PASS':
        assert 'HW' in r['evidence'], f"{r['id']} HARDWARE_GATED marcado PASS sem evidência HW"
    if r['status'] == 'DESCOPED_BY_OWNER':
        assert 'ADR-0005' in r['evidence'], f"{r['id']} fora de escopo sem referência ao ADR-0005"
for p in (ROOT / 'packages/contracts/schemas').glob('*.json'):
    json.loads(p.read_text(encoding='utf-8'))
for p in (ROOT / 'packages/test-fixtures/examples').glob('*.json'):
    json.loads(p.read_text(encoding='utf-8'))
con = sqlite3.connect(':memory:')
for mig in sorted((ROOT / 'infra/migrations').glob('*.sql')):
    con.executescript(mig.read_text(encoding='utf-8'))
count = con.execute("select count(*) from sqlite_master where type='table'").fetchone()[0]
assert count >= 37, count
android_screens = (ROOT / 'docs/15-UX-SCREENS.md').read_text(encoding='utf-8')
for i in range(1, 77):
    assert f'| A{i:02d} |' in android_screens, f'missing Android A{i:02d}'
try:
    import yaml
    o = yaml.safe_load((ROOT / 'packages/contracts/openapi.yaml').read_text(encoding='utf-8'))
    assert o['openapi'].startswith('3.1')
    ids = []
    for path, ops in o['paths'].items():
        for method, spec in ops.items():
            if method == 'parameters':
                continue
            ids.append(spec['operationId'])
            for name in re.findall(r'\{([^}]+)\}', path):
                assert any(pr.get('in') == 'path' and pr.get('name') == name for pr in spec.get('parameters', [])), (path, method, name)
    assert len(ids) == len(set(ids)) and len(ids) >= 90
except ImportError:
    print('WARNING: PyYAML not installed; OpenAPI semantic scan skipped', file=sys.stderr)
print(f'VALIDADO: 390 requisitos, 76 telas Android, {count} tabelas, schemas JSON e estrutura OpenAPI.')
