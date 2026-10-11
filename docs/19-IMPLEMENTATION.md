# 19 — Plano completo de engenharia: execução sequencial, lançamento único

**Não são releases MVP**: ondas de construção internas de uma entrega final integrada. Cada entrega só se torna produto liberável após todos os gates.

## Onda 0 — Inventário e contratos
Leitura de especificações; confirmar tech versions/licenças; estruturar monorepo, issues com F001–F390, ADRs, package lock, CI, design tokens; contratos OpenAPI/WS/MQTT, SQL e schemas gerados.

## Onda 1 — Segurança/identidade/tenancy
Auth PKCE, OIDC, roles+ABAC, consents, audit, D1 migrations, auth SDK, testes de IDOR, UI onboarding console/app.

## Onda 2 — Android wearable
Estado BLE/driver MiBand3, secure pairing, capabilities, Room/outbox, sync, battery/HR/steps/sleep, UI Android A01–A25/A51–A64, FGS/companion, matrizes de erro.

## Onda 3 — Ingestão Cloudflare e dashboards
Workers HTTP, queues, D1 aggregate/R2, endpoints history/latest/summary, charts Android/console, reports, exports, realtime viewer.

## Onda 4 — Realtime/controle
Durable Objects WebSocket, tickets, session ACL, heartbeats, arm/disarm, ACK e idempotência, equipamento registro, gateway WSS, bridge MQTT TLS/EasyPanel, ESP32 lab demo e safety interlocks.

## Onda 5 — Gesture Intelligence
Capability tests, raw monitor se hardware permitir, protocolo de capture, filtros/DTW/ML, treino/eval, UI A26–A36, mapping; modelos e simulador independentes do hardware; teste end-to-end real se compatível.

## Onda 5B — Wearable UI Engine obrigatório (complemento v1.1)
Theme Studio e editor monocromático, catalogue Worker/R2/D1, manifesto assinado e análise de licença, capacidade de instalar recursos `.res` pelo Android sem app intermediário, preflight GATT, journal, progresso, reflash assistido se possível, testes HW16–HW24, QA de compatibilidade e matriz de 40 requisitos F351–F390. Executar em dependências internas, **não** remover de escopo final.

## Onda 6 — Motor de automações e IA
Rules DSL, simulator/history, alarms, family sharing, notification channels, agente explicativo, MCP allowlist, JEV adapter (real quando disponível), AI memory consent, feature gating e billing.

## Onda 7 — Plataforma e produto
Console completo, planos/organizações, portal developer, SDK TS, WAF, logs, DX, acessibilidade, i18n, operação, suporte, notificações, relatórios, documentação.

## Onda 8 — Quality gates e release
Testes unit/contract/integration/e2e/chaos/security/hardware/compliance; benchmark e ajustes; homologação em staging; AAB signável; IaC e runbook; checklist final de rastreabilidade; deploy production **somente autorizado**.

## Deliverables por onda
Cada onda produz código tipado e executável, CI verde, testes e coverage, screenshots e documentação de contratos, `implementation-status.md` com IDs e impedimentos reais. Nenhuma onda pode 'fechar' capability hardware na ausência de hardware/firmware testados.

## Ordem e disciplina de execução no Claude Code
Após cada módulo: rodar testes/lint/typecheck, registrar decisão, ajustar contratos e regenerar SDKs; somente então avançar. O código deve permitir desenvolvimento paralelo com boundaries estáveis, mas merge bloqueado por CI e code review.
