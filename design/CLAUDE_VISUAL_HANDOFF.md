# CLAUDE CODE — Visual Implementation Contract

Para implementar DeltaBots Pulse em produto final, use o PRD v1.1 já criado como fonte funcional e este kit como referência visual.

## Hard constraints
1. Os 76 Android e 58 web SVG são a matriz de telas para orientação, não código já implantado.
2. Preserve a paleta de `tokens/` e o master externo aprovado. Não trace, gere, estilize ou recrie 8C-1.
3. Até inserir master correto, mantenha os slots corporativos sem logo. Trave release ao encontrar `brand/approved/PLACE_OFFICIAL_ASSETS_HERE.md` sem master.
4. Componentes mínimos: `PulseScaffold`, `MetricTile`, `LiveChart`, `StatusPill`, `DeviceCard`, `ThemePreview`, `GestureTrace`, `AutomationCard`, `ConfirmationDialog`, `EmptyState`, `ErrorState`, `OfflineState`, `UnsupportedState`, `StaleDataWarning`.
5. Sempre oferecer refresh timestamp, proveniência, consentimento, foco teclado e screen reader. Não representar dado demonstrativo como telemetria real.
6. Mantenha 80×128 portrait na Mi Band, preservando resolução física; o PRD cita 128×80 como dimensão informada em orientação alternativa.
7. Converter em `.res` apenas após ter recurso original licenciado, slots mapeados, firmware compatível, assinatura e homologação real. Não tratar este kit como firmware.
8. A conclusão exige build Android, frontend, testes de snapshot/golden e acessibilidade, para cada estado carregando, com dados, vazio, offline, erro, sem permissão, não suportado, stale.

## Mapeamento
- `android/screens/index.json` fornece A01–A76 e rotas.
- `web/screens/index.json` contém todas as rotas de navegação identificadas no PRD.
- `wearable/mi-band-3/screens.json` fornece a lista visual.
- `wearable/mi-band-3/RESOURCE_MAPPING_TEMPLATE.csv` é obrigatório preencher antes de compilar um pacote flashável.
