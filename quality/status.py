#!/usr/bin/env python3
"""Gera implementation-status.md a partir de docs/feature-register.csv (fonte editável)."""
from pathlib import Path
import csv, collections

ROOT = Path(__file__).resolve().parents[1]
rows = list(csv.DictReader((ROOT / 'docs/feature-register.csv').open(encoding='utf-8')))
by_status = collections.Counter(r['status'] for r in rows)
by_area = collections.OrderedDict()
for r in rows:
    by_area.setdefault(r['area'], []).append(r)

out = [
    '# implementation-status — DeltaBots Pulse',
    '',
    '> Gerado por `python3 quality/status.py` a partir de `docs/feature-register.csv`. Não editar à mão.',
    '> Estados conforme `docs/20-ACCEPTANCE.md`; `DESCOPED_BY_OWNER` registrado no ADR-0005.',
    '> `PASS` exige evidência reproduzível; itens `HARDWARE_GATED` só passam com prova física (HWxx).',
    '',
    '## Resumo',
    '',
    '| Estado | Quantidade |',
    '|---|---|',
]
for status, n in sorted(by_status.items()):
    out.append(f'| `{status}` | {n} |')
out += ['', '## Por área', '']
for area, items in by_area.items():
    c = collections.Counter(i['status'] for i in items)
    summary = ', '.join(f'{k}: {v}' for k, v in sorted(c.items()))
    out += [f'### {area}', '', f'_{summary}_', '', '| ID | Funcionalidade | Escopo | Estado | Evidência |', '|---|---|---|---|---|']
    for i in items:
        out.append(f"| {i['id']} | {i['feature']} | {i['scope']} | `{i['status']}` | {i['evidence'] or '—'} |")
    out.append('')
(ROOT / 'implementation-status.md').write_text('\n'.join(out), encoding='utf-8')
print(f'implementation-status.md: {len(rows)} requisitos, {dict(by_status)}')
