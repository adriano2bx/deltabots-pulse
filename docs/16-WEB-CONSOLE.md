# 16 — Pulse Console Web: especificação de rotas e operações

## Stack
React+TS strict, Vite, React Router ou TanStack Router, TanStack Query, Tailwind, acessibilidade Radix/Ark, Recharts ou equivalente e Chart windowing; Cloudflare static assets. Autenticação por cookies HttpOnly + anti-CSRF ou BFF explicitamente documentado, tenant switch com revalidação.

## Módulos e rotas
- `/login`, `/register`, `/mfa`, `/reset` — autenticação.
- `/dashboard` — KPIs, live telemetry, warnings de stale, conexões e últimas ações.
- `/health/heart`, `/health/activity`, `/health/sleep`, `/health/trends` — séries históricas, qualidade, formatos exportáveis.
- `/live` — sessões WebSocket, RTT, batch, perdas, endpoints e watchers permitidos.
- `/gestures/lab` — captação consentida, gráficos XYZ e anotações; layout lab e estados hardware-gated.
- `/gestures/models` — treino, avaliações, versões, métricas, comparação, exclusão.
- `/gestures/mappings`, `/control/equipment`, `/control/sessions` — mapeamentos, arm/disarm, políticas e ACK.
- `/devices`, `/devices/:id`, `/gateways`, `/gateways/:id` — inventário, capacidades por firmware e status.
- `/automations`, `/automations/new`, `/automations/:id`, `/automations/:id/history` — builder/simulação/execução.
- `/insights`, `/assistant`, `/reports`, `/exports` — IA, chat, relatórios e export.
- `/family`, `/family/invitations`, `/care`, `/checkins`, `/notifications`, `/alerts` — compartilhamento.
- `/organization`, `/organization/members`, `/organization/roles`, `/billing` — multiusuário e faturamento.
- `/developers/api-keys`, `/developers/webhooks`, `/developers/mcp`, `/developers/docs` — integrações.
- `/settings/profile`, `/settings/security`, `/settings/privacy`, `/settings/preferences` — dados e privacidade.
- `/ops/health`, `/ops/metrics`, `/ops/audit`, `/ops/queues`, `/ops/errors`, `/ops/releases` — área restrita a operadores.

## UI operacional
Tabelas com paginação server-side, filtros persistidos na URL e empty states; chart downsampling; downloads assinados; role-based nav; status de WSS/IoT, modo demo explicitamente rotulado, console nunca exibe segredo existente depois de criação. Logs scrubbed, alerts com runbook e links de trace. Fallback polling HTTP se WSS indisponível.

## Aceite
E2E Playwright cobrindo onboarding, dados reais/sintéticos rotulados, controle autorizado/negado, revogação no meio da sessão, convite/grant, exportação/exclusão e proteção cross-tenant; visual regression responsive desktop/tablet/mobile; axe WCAG e keyboard-only.

## Novas telas console Wearable Theme Studio (v1.1)
`/wearable-themes`, `/wearable-themes/new`, `/wearable-themes/:id/editor`, `/wearable-themes/:id/compatibility`, `/wearable-themes/:id/releases`, `/wearable-themes/:id/tests`, `/devices/:id/appearance`. Editor sprite 128×80 monocromático e renderizador por slots validados; pipeline build/review/QA/deploy de temas via R2+Workers; nunca botão que faça flash remotamente. Permissões designer/revisor/release manager segregadas. Mostrar falhas, download counts e instalações confirmadas/inconclusivas com transparência.
