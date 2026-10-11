# ÍNDICE DOCUMENTAL — DELTABOTS PULSE

Este pacote descreve arquitetura integral para Claude Code. Começar por `README.md`, `CLAUDE.md`, `claude/MASTER_PROMPT.md`. Requisitos rastreados F001–F390, 76 telas Android, painel web e contrato REST expandido em OpenAPI.

## Documentos centrais
00 Índice · 01 PRD · 02 Matriz de requisitos e `feature-register.csv` · 03 Arquitetura · 04 Android · 05 Mi Band 3/BLE · 06 Realtime WebSocket · 07 Gestures · 08 MQTT/IoT · 09 Cloudflare · 10 API · 11 Banco · 12 Segurança/LGPD · 13 IA/MCP/JEV · 14 Automações · 15 Telas Android · 16 Console Web · 17 Testes · 18 Operações · 19 Plano de engenharia · 20 Aceite final · 21 Hardware real · 22 Riscos · 23 Fontes · 24 Notificações/Família · 25 Acessibilidade · 26 Billing/orgs · 27 Observabilidade · 28 Deploy · 29 Contratos de exemplo · 30 Usuário · 31 Desenvolvedor · 32 Wireflows · 33 Sequências.

## Artefatos de máquina
`contracts/openapi.yaml` · `contracts/*.schema.json` · `infra/migrations/0001_initial.sql` · `infra/cloudflare/wrangler.example.jsonc` · `infra/.env.example` · `infra/bridge-mqtt.compose.example.yaml` · `quality/scenarios.feature` · `quality/check_specs.py` · `examples/*.json` · `.github/workflows/spec-validation.yml`.

## Autoridade de fontes
Conflitos devem ser resolvidos por: segurança e hardware comprovado > `CLAUDE.md` > `docs/20-ACCEPTANCE.md` > contratos machine-readable > PRD/arquitetura > exemplos. Registrar ADR e atualizar todos docs afetados. Nunca contornar LGPD para alcançar indicador de produto.

## Adição v1.1 — Personalização e instalação direto no aplicativo
34 PRD Wearable UI Updates · 35 Theme Studio Pipeline · 36 BLE Theme OTA Protocol · ADR 0004; `contracts/theme-manifest.schema.json`, `contracts/theme-install-event.schema.json`, `examples/theme-manifest.json`, `infra/migrations/0002_themes.sql`. Matriz F351–F390 e telas A65–A76.
