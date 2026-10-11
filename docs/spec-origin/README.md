# DELTABOTS PULSE — Especificação integral de produto (v1.1)

**Objetivo:** entregar um sistema comercial completo (não MVP) com Android nativo, gateway BLE da Mi Band 3, API e console Cloudflare, eventos WebSocket, controle remoto, bridge MQTT, telemetria, motor de automações, análises/IA, MCP/JEV, gestão de usuários/organizações, conformidade LGPD e operação de produção.

**Este pacote é documentação de engenharia e contratos, não o software já implementado.** O Claude Code deverá implementar, testar, implantar em ambientes autorizados e comprovar os critérios de aceite. Nada neste pacote afirma que o acesso contínuo ao acelerômetro Mi Band 3 já foi validado em hardware real.

## Comece por aqui
1. `CLAUDE.md` — instruções mandatórias de desenvolvimento.
2. `claude/MASTER_PROMPT.md` — briefing de execução no Claude Code.
3. `docs/01-PRD.md`, `docs/02-FEATURE-MATRIX.md` — escopo, funcionalidades e rastreabilidade.
4. `docs/03-ARCHITECTURE.md`, `docs/04-ANDROID.md`, `docs/05-BLE-MIBAND3.md` — engenharia principal.
5. `docs/06-REALTIME.md`, `docs/07-GESTURES.md`, `docs/08-IOT-MQTT.md` — interação de baixa latência.
6. `docs/09-CLOUDFLARE.md`, `docs/10-API.md`, `contracts/openapi.yaml`, `infra/migrations/0001_initial.sql` — backend e contratos.
7. `docs/11-DATABASE.md`, `docs/12-SECURITY-LGPD.md`, `docs/13-AI-MCP-JEV.md`, `docs/14-AUTOMATIONS.md`.
8. `docs/15-UX-SCREENS.md`, `docs/16-WEB-CONSOLE.md`, `docs/17-TEST-PLAN.md`, `docs/18-OPERATIONS.md`.
9. `docs/19-IMPLEMENTATION.md`, `docs/20-ACCEPTANCE.md`, `docs/21-HARDWARE-VALIDATION.md`, `docs/22-RISKS.md`, `docs/23-SOURCES.md`.
10. `docs/24-NOTIFICATIONS-SHARING.md`, `docs/25-LOCALIZATION-ACCESSIBILITY.md`, `docs/26-BILLING-ORG.md`, `docs/27-OBSERVABILITY.md`, `docs/28-DEPLOYMENT.md`, `docs/29-CONTRACT-EXAMPLES.md`.

## Produto final e condições de hardware
**INTEGRAL** = todo o escopo de software e integrações documentado, inclusive estados vazios, erros, segurança, auditoria e testes, deve estar implementado antes da liberação comercial. **CAPABILITY-GATED** = funcionalidades impossíveis no firmware real devem permanecer implementadas como módulo reutilizável/adaptável, detectadas e claramente indicadas como indisponíveis no dispositivo; não podem ser fingidas/simuladas em produção. Somente o hardware pode liberar uma capability comprovada.

Não confundir 24/7 com garantia de processo Android sempre ativo: conexões dependem de permissões, bateria, distância BLE, OS, conectividade e firmware. Não afirmar medições clínicas, quedas diagnosticadas, pressão, glicose, GPS embarcado ou aceleração bruta contínua sem evidência.

## Monorepo alvo
`apps/android/` (Kotlin/Compose), `apps/console/` (React/Vite), `apps/api/` (Workers), `apps/realtime/` (Durable Objects), `apps/bridge-mqtt/` (Node/TS para EasyPanel), `apps/esp32-demo/` (ESP-IDF), `packages/contracts/`, `packages/core/`, `packages/sdk-ts/`, `packages/ui/`, `packages/test-fixtures/`, `infra/`, `docs/`, `quality/`.

## Convencional
- Idioma UI/documentos: pt-BR, com i18n pronto para en-US; APIs: nomes em inglês; UTC no transporte e banco; timezone IANA para exibição.
- Ambientes: local, staging, production; domínio sugerido `pulse.deltabots.com.br` condicionado a posse e configuração DNS; `api.pulse.deltabots.com.br` e `console.pulse.deltabots.com.br` como sugestões, não recursos existentes.
- Segurança: negar por padrão; nenhum segredo ou credencial pessoal dentro do repositório.
- Licença de referência: Gadgetbridge AGPLv3 — consultar jurídico antes de copiar, vincular ou redistribuir código; preferir implementação original a partir de documentação e comportamento observado legalmente.

## v1.1 — Atualização da interface da Mi Band 3 diretamente no app
Adição **obrigatória ao produto final**, não MVP: F351–F390, telas Android A65–A76, `Pulse Wearable UI Engine` (catálogo de temas, prévia monocromática, compatibilidade por hardware/firmware, download autenticado, assinatura+hash, instalação BLE `.res`, progresso, confirmação, histórico, restauração assistida e diagnóstico). Console Cloudflare com Theme Studio, build/review, R2, publicação e revogação. Ver `docs/34-WEARABLE-UI-UPDATES.md`, `35-THEME-STUDIO-PIPELINE.md`, `36-BLE-THEME-OTA-PROTOCOL.md` e ADR 0004. **A atualização é iniciada explicitamente no Android.** Firmware `.fw` tem fluxo separado e restrito. Compatibilidade BLE do atualizador, necessidade de `.ft` e recuperação dependem de hardware de laboratório. O pacote não contém `.res` proprietários.
