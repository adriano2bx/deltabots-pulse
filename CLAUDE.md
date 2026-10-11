# Instruções obrigatórias ao Claude Code — DELTABOTS PULSE

Você é o engenheiro responsável por uma entrega **integral e pronta para produção**, não um protótipo/MVP. Este repositório contém documentação/contratos de referência; implemente a solução final conforme docs. Não marque funcionalidades como concluídas apenas porque a tela, rota ou mock existe.

## Regras imutáveis
1. **Leia `README.md`, `docs/01-PRD.md`, `docs/20-ACCEPTANCE.md`, `docs/21-HARDWARE-VALIDATION.md`, `docs/22-RISKS.md` e `docs/34-WEARABLE-UI-UPDATES.md` antes de começar.** Crie `implementation-status.md` rastreando cada épico, funcionalidade e evidência de testes.
2. Implemente **todos** os módulos de software especificados, não corte escopo silenciosamente. Pode executar em ondas técnicas de dependência, mas liberação pública exige cumprir os portões de aceite integrais.
3. **NUNCA invente suporte BLE, leituras de acelerômetro ou gestos.** Capabilities devem ser testadas em dispositivo real. Sem hardware conectado, implemente driver testável + simulador *explicitamente rotulado*, registre `HARDWARE_BLOCKED` e não declare o requisito validado.
4. **Nunca controlar equipamentos perigosos sem intertravamento local**, arm/disarm, expiração, watchdog e desarme por falha. Não permita atuação remota para dispositivos marcados `safety_critical`.
5. **Dado de saúde é dado sensível.** Consentimento específico, isolamento multi-tenant, exportação/exclusão, criptografia, logging sem PII e LGPD são gates de produção.
6. Use especificações oficiais do Android e Cloudflare, verificando APIs/versões reais no momento da codificação. Não pinne dependências inventadas. Fixe versões verificadas e registre no lockfile.
7. Referencie Gadgetbridge apenas conforme compatibilidade jurídica; código AGPLv3 não pode ser copiado como se fosse MIT. Documente origem, licença e decisões.
8. Testes unitários, integração, BLE fake adapter, contrato, E2E, fuzz protocol, carga, desempenho, acessibilidade, segurança e testes em dispositivo real são obrigatórios.
9. Sem endpoint fake em produção, sem dados de exemplo não identificados, sem `TODO` em fluxo crítico, sem botão sem função, sem backdoor/admin default, sem credenciais hardcoded.
10. Contratos OpenAPI e WebSocket devem gerar ou validar tipos para app, console, bridge e Workers. Migrações devem ser reexecutáveis e reversão testada.
11. Nenhum deployment ou criação de recursos pagos sem autorização explícita para a conta Cloudflare / provedores correspondentes. Use config templates e secrets via CI/secret manager.
12. Escreva documentação de arquitetura e decisões ADR quando desviar de especificação; justifique, cubra testes e preserve requisitos.

## Sequência de trabalho
**Inventário & planejamento → contratos e schema → infra/autenticação → BLE & Android → ingestão → realtime → gestos → IoT/MQTT → automação → analytics/IA → console/UI → segurança/observabilidade → end-to-end → deploy staging → QA hardware → homologação completa → produção.** Uma sequência de engenharia não reduz o escopo da versão final.

## Definition of Done por módulo
Código funcional; tipagem/linters limpos; testes automatizados; avaliação de erro, offline e reconexão; autorização por endpoint/evento; métricas e logs; documentação; UI com vazio/loading/erro/sucesso; evidência em `implementation-status.md` e links a testes.

## Entrega final exigida
APK/AAB assinável sem chaves no repo, console web deployável, Workers/DO/Queues/R2/D1 configuráveis, broker bridge MQTT containerizada, referência ESP32 de bancada, OpenAPI publicado, SDK TS, manual operador/admin/usuário, suíte de testes, dashboards operacionais, runbooks, threat model e matriz de aceite preenchida. Itens impossíveis por firmware documentados como indisponíveis, com evidência; não caracterize isso como feature entregue para a Mi Band 3.

## Mandato adicional v1.1 — Temas diretamente no Android
Implemente **F351–F390 / telas A65–A76** como parte integrante da versão final: editor/catálogo Cloudflare, manifestos de temas assinados, R2, APIs, migração `0002_themes.sql`, driver próprio `WearableResourceUpdater`, download/preflight, BLE `.res`, UI de progresso, verificação pós-flash, histórico e recuperação assistida. **Nunca enviar firmware automaticamente**, nem usar Gadgetbridge como dependência invisível. Nunca alegar rollback transacional nem suportar variante sem provas físicas. Não lançar temas `.res` sem direitos de distribuição, testes de hardware, assinatura e dupla aprovação. O app Android tem de permitir instalar o tema diretamente, com confirmação local explícita. Adicionar `feature:wearable-ui/`, `device:resource-updater/` e módulo Theme Studio no Console.

---

## Decisões do proprietário (prevalecem sobre a spec original)
- **Wearable UI Engine fora de escopo** (F351–F390, A65–A76, Theme Studio, `.res`): ver `docs/adr/0005-owner-descope-wearable-ui.md`. Não implementar nem escrever recursos/firmware na pulseira.
- Commits diretamente na `main`, sempre com CI verde.
- Credenciais Cloudflare serão fornecidas pelo proprietário no momento do deploy (nunca no repositório).

## Mapa do repositório
| Caminho | Conteúdo |
|---|---|
| `docs/` | Spec integral (PRD, arquitetura, ADRs, `feature-register.csv`) |
| `design/` | Kit visual (tokens, telas de referência, ícones, layouts 80×128 da pulseira) |
| `packages/contracts` | Zod + OpenAPI 3.1 + JSON Schemas (fonte de verdade dos payloads) |
| `packages/core` | Lógica pura: políticas, DSL de automações, controle fail-closed, telemetria, redação |
| `packages/test-fixtures` | Fixtures sintéticas rotuladas |
| `apps/api` | Worker Cloudflare (Hono + D1 + Queues + R2) |
| `apps/realtime` | Durable Object `PulseSessionRoom` (WebSocket Hibernation) |
| `apps/console` | Console React/Vite |
| `apps/bridge-mqtt` | Ponte WSS↔MQTT (Node) |
| `apps/esp32-demo` | Firmware de bancada (ESP-IDF) com watchdog local |
| `apps/android` | App Android (Kotlin/Compose) |
| `infra/` | Migrações D1, templates Wrangler/compose |
| `quality/` | `check_specs.py`, `status.py`, cenários |

## Comandos
- `pnpm install` — dependências do workspace (Node 22, pnpm 10).
- `pnpm verify` — lint + typecheck + testes + validação da spec.
- `python3 quality/status.py` — regenera `implementation-status.md` após mudar `docs/feature-register.csv`.
- Android: compila somente no CI (`.github/workflows/ci.yml`); o ambiente local não acessa o Google Maven.

## Conhecimento de hardware já validado (Mi Band 3 do proprietário)
Ver `docs/adr/0007-gadgetbridge-license-and-protocol-sources.md`: base UUID `…-3512-2118-0009af100700`, flag de autenticação `0x00`, envio de perfil após autenticar.
