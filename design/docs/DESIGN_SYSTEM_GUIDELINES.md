# DeltaBots Pulse — Design System v1.0

## Fonte de verdade
Identidade institucional do documento `DeltaBots_Website_Build_Spec_v1.0` (Brand 2026) e Master 8C-1 `WHITE CANONICAL MASTER` v4.1 fornecido separadamente. Esse bundle aplica as regras, não inclui/recria o vetor corporativo.

## Paleta
| Token | Hex | Uso |
|---|---|---|
| Obsidian | `#0A0A0B` | fundo escuro principal |
| Bone | `#F5F7FA` | textos dominantes |
| Steel | `#485560` | apoio, marcadores, gráficos secundários |
| Cyan | `#00D5D8` | foco, selecionado, CTA, estado de streaming |
| Surface 1 | `#111214` | cards e navegação lateral |
| Border | `#25282C` | linha de separação |
| Muted | `#8A929A` | metadados acessíveis |

Estados de saúde/segurança podem usar `good`, `warning`, `danger`; não representar diagnósticos ou risco clínico a partir de batimentos brutos.

## Tipografia
Geist Sans (títulos), Inter (corpo/UI), IBM Plex Mono (séries e métricas). Fontes sugeridas não inclusas; confira licenças do fornecedor. DELTABOTS corporativo nunca pode ser recriado como texto de fonte.

## Organização e hierarquia
Android: largura referencial 390 dp, padding horizontal 24 dp, bottom navigation de 5 itens, touch targets ≥48 dp, hierarquia cabeçalho→status→indicador→histórico→ação. Títulos por categoria, linguagem pt-BR compacta.

Web: viewport 1440×900, sidebar 248 px e canvas restante com gutter 36 px. 12-col adaptável, densidade de informação moderada, sem efeitos de glow e degradês. Resumo com agregações e última atualização sempre visíveis.

Pulse Band: 80×128 px vertical em 1 bit, preto puro e branco puro, sem cinza/ciano. Evitar informações pequenas e linhas anti-aliased; converter raster somente após inspecionar firmware/slot. Equivalência horizontal 128×80 é de rotação da tela, **não** autorização para usar 128×80 na orientação vertical.

## Componentes a desenvolver
`PulseScaffold`, `ConnectionStatus`, `DataFreshness`, `MetricCard`, `SeriesChart`, `SafeControl`, `GestureModelCard`, `OTACompatibility`, `InstallProgress`, `ApprovalDialog`, `SystemAlerts`, `AssistiveEmptyState`, `ThemePreview`, `WatchResourceViewer`, `AuditTimeline`.

## Estados em cada tela
Loading, Data, Empty, Offline, Error, PermissionRequired, Unsupported, Stale. Requisito de QA: captura de testes de screenshot por estado, com leitores de tela, foco e zoom. Não transformar o visual de demonstração em dados reais.

## Elementos proibidos
Recriar logo, degradê brilhante, sombras de UI gamer, icons detalhados a ponto de não funcionar na Mi Band, texto branco de marca sobre fundo branco, marca em asset de fundo IA, alertas clínicos sem validação, usar número/latência fictício como valor de produção.
