# Modelo de ameaças — DeltaBots Pulse (STRIDE resumido)

Escopo: app Android (gateway BLE), API Cloudflare, `PulseSessionRoom` (DO), console web, ponte MQTT, ESP32 de bancada.
Cada linha aponta o controle **implementado** e onde ele é testado. Controles sem teste automatizado estão marcados `lacuna`.

| # | Ameaça | Ativo | Controle | Evidência |
|---|--------|-------|----------|-----------|
| T1 | Vazamento entre tenants (IDOR) | dados de saúde | tenant em todo `WHERE`; recurso de outro tenant responde 404, não 403 | `apps/api/test/identity.test.ts`, `platform.test.ts` |
| T2 | Roubo de refresh token | sessão | rotação a cada uso; reuso de token antigo revoga a sessão inteira | `identity.test.ts` |
| T3 | Replay/forja de chamada de gateway | telemetria, comandos | prova de posse ECDSA P-256 sobre `METHOD\nPATH\nTS\nSHA256(body)` com janela de tempo | `core/network` (Kotlin) e `apps/api/test` |
| T4 | Atuação remota em equipamento perigoso | IoT | arm local obrigatório, TTL, idempotência, `seq` anti-replay, watchdog, desarme por falha; `safety_critical` nunca controlável | `packages/core/test`, `apps/esp32-demo/test` (ASan/UBSan), `apps/bridge-mqtt/test` |
| T5 | Processar dado de saúde sem base legal | dados pessoais | consentimento por finalidade; ingestão rejeita item com `CONSENT_REQUIRED`; revogação interrompe | `telemetry.test.ts`; Android `ContractDriftTest` |
| T6 | Dado de saúde em logs | privacidade | redação central (`packages/core/redact`), sem PII em log | `packages/core/test` |
| T7 | Segredo exibido novamente | chaves de API, webhooks | segredo só na criação; hash/cifra em repouso | `platform.test.ts` |
| T8 | SSRF via webhook | rede interna | somente HTTPS; hosts internos/privados recusados | `platform.test.ts` |
| T9 | Chave BLE extraída do aparelho | pulseira | chave AES no Android Keystore (`KeystoreBox`); backup do app desativado | revisão de código; `lacuna`: teste instrumentado |
| T10 | Token no console roubado por XSS | sessão web | access token só em memória; CSP restritiva; refresh em `sessionStorage` (some ao fechar a aba) | `apps/console/index.html`; `lacuna`: teste E2E de CSP |
| T11 | Falso "online" mascarando desconexão | segurança operacional | `ScreenState` com Offline/Stale; proveniência e idade em toda leitura | `core/domain` testes |
| T12 | Capacidade BLE inventada | integridade | capabilities nascem `UNVERIFIED`; só viram `SUPPORTED` com evidência do aparelho | `core/domain` testes |
| T13 | Flood / abuso de API | disponibilidade | rate limit por IP/identidade em login, refresh, ingestão (implementado em `apps/api/src/lib/ratelimit.ts`) | `lacuna`: sem teste automatizado do limite |
| T14 | Dependência/segredo no repositório | cadeia de suprimentos | gitleaks no CI; versões fixas e lockfile | `.github/workflows/ci.yml` |

## Riscos residuais (aceitos ou abertos)

- **Mi Band 3 sem acelerômetro bruto comprovado:** gestos usam o IMU do celular; nada vira comando sem arm local (HW08).
- **TLS/ACL do broker MQTT real** e **WAF/Rate limiting de borda** dependem da conta Cloudflare/infra do proprietário (`BLOCKED_EXTERNAL`).
- **Pentest externo e revisão jurídica LGPD** ainda não realizados; são gates de produção.
- **Testes instrumentados Android** (Keystore, BLE real) ainda não existem (`lacuna`).
