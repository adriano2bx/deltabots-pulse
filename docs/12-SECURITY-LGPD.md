# 12 — Segurança, privacidade, LGPD e modelo de ameaças

## Classificação
P0: dados sensíveis de saúde, padrões de rotina, compartilhamento familiar, tokens, chaves BLE, credenciais de gateways, histórico de localização do celular, controle de atuadores. P1: metadata tenant, billing, eventos, logs. P2: métricas públicas de produto desidentificadas.

## Ameaças e controles
| Ameaça | Controle | Teste |
|---|---|---|
| Vazamento entre organizações | tenant_id de auth context + ABAC em todas queries; testes multi-tenant adversariais | Cross-tenant IDOR fuzz |
| Familiar vê dado revogado | checagem grants em toda consulta + WS revocation/kill | Revogação com conexão ativa |
| Captura/replay de comandos | TTL + ID + seq + nonces e idempotência no gateway | Replay, delay, clock skew |
| Tomada de conta | MFA em rotas privilegiadas, refresh rotation, revogação/alerts, rate limit | Session hijack simulation |
| BLE spoofing/clone | associação autenticada e fingerprint, exibir fonte não confiável | Inject peripheral fake |
| Rogue IoT gateway | provisionamento vinculado, secrets individuais, mTLS conforme suportado, revocation | Unauthorized ack spoof |
| Prompt injection | IA sem capacidade de executar payload como instrução, MCP allowlist, autorização server | Tool misuse red team |
| Exfiltração por logs | scrubbing centralizado, testes snapshots | PII scanners |
| Saúde inferida sem permissão | consent granular e purpose limitation, delete/export | Revoke consent test |
| DDoS/cost blow-up | token/quota/rate limit/WAF, timeouts, cardinalidade baixa | Soak & surge |
| Firmware malicioso | não fazer firmware OTA arbitrário; assinatura verificada e aprovação humana | Firmware validation |
| Segurança física | watchdog local, ARM local, policy, deny safety-critical | Partition and stop |

## Matriz de acesso (simplificada)
- `owner`: ler/escrever os próprios dados, grants, device/personal controls; não gerenciar empresa sem papel.
- `family_viewer`: somente leituras explicitamente compartilhadas (`metrics`, `period`, `device`), sem comandos, sem API keys, sem dados não liberados.
- `caregiver`: check-ins e notificações conforme grant; sem capacidade clínica implícita.
- `org_admin`: membros, quotas e devices org; **não acessa saúde dos membros** por padrão.
- `developer`: tokens com scopes e rate limits; sem leitura de health sem consent/purpose.
- `operator`: métricas e auditoria minimizada, sem dados brutos de saúde.
- `superadmin`: break-glass com dupla aprovação, propósito, justificativa e auditoria e notificação aos interessados quando cabível.

## Consentimentos separados
`health_processing`, `cloud_sync_health`, `family_sharing:{grantee,metrics,expiry}`, `ai_analysis`, `gesture_raw_recording`, `research_data_donation`, `location_sharing`, `notification_mirroring`, `marketing` (se existir). Nenhum consent agrupado em única caixa preselecionada. Revogação impede novas operações e inicia remoção segundo política. Menores: requisitos adicionais e age gates revisados por jurídico.

## Compliance LGPD
Mapear operador/controlador por finalidade e contrato; base legal para dados pessoais sensíveis com assessoria jurídica, evitando assumir que consentimento resolve todo contexto. Implementar pedidos de acesso, correção, portabilidade, exclusão, revogação, relatório de compartilhamentos e canal DPO; registro de processamento, retenção e suboperadores; contrato de transferência internacional quando necessário. Avaliar RIPD antes de funcionalidades de perfilamento e inferência de saúde.

## Segurança técnica
TLS 1.2+, TLS 1.3 preferencial, storage encryption da plataforma, app Keystore/biometria, HTTPOnly SameSite cookies no browser, PKCE mobile, CSP, CORS allowlist, CSRF, rotation JWT asymmetric keys, headers, secrets manager, WSS ticket single use, URL sanitization, no device ownership trusting user id in JSON. Segurança ao nível de banco e aplicação: D1 não impõe por si só RLS equivalente Postgres; aplicar tenants em todas queries com testes.

## Resposta a incidentes
Se suspeita de vazamento/replay: invalidar sessões/chaves, desarmar control rooms, bloquear devices, preservar logs anonimizados, investigar timeline, comunicação LGPD conforme critérios legais, postmortem e patches. Exercício trimestral e runbook em `18-OPERATIONS.md`.

## Threat model: temas e atualização de interfaces
Supply-chain: arquivo `.res` adulterado, manifesto falsificado, compatibilidade trocada, CDN/R2 comprometidos, pacote revogado, downgrade, clone com fingerprint forjado, exploração no parser, idempotência/autorizações bypassadas, hijack de OTA por console/IA. Barreiras: assinar manifesto canônico com chave separada e rotação, hash de bytes R2 conferido no Android, schema estrito, licença/homologação, binding device+firmware, TLS, limite de tamanho e timeout, confirmação local humana, mutex BLE, RBAC/MFA/quatro-olhos no release, sem flash remoto, sem importação cega. Auditar instalação sem armazenar IDs BLE/MAC pessoais brutos.
