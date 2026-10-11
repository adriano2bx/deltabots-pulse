# 22 — Riscos, pressupostos, dependências e decisões

| ID | Severidade | Problema | Mitigação / gate |
|---|---|---|---|
| R01 | Crítica | Mi Band 3 não libera raw X/Y/Z no firmware específico | capability detection; laboratório em Android IMU/outro wearable; nunca alegar suporte |
| R02 | Alta | Pareamento exige chave proprietária/conta | integração legítima com chave do titular ou tela bloqueada; sem bypass |
| R03 | Alta | Restrições Android em background | CompanionDevice APIs, FGS `connectedDevice`, sync deferred; aviso de OS |
| R04 | Crítica | Enviar comandos físicos com latência/replay | armar local, TTL, watchdog/kill local, idempotência |
| R05 | Crítica | LGPD dados de saúde | privacy-by-design, consent granul, DPO/assessoria |
| R06 | Alta | AGPL Gadgetbridge | verificação jurídica e implementação original, SBOM |
| R07 | Média | D1 dimensionamento raw high-rate | raw R2 e downsample, sharding de tenants |
| R08 | Média | Custos DO/WSS com stream contínuo | batching, quotas, lab streaming limitado |
| R09 | Alta | MQTT TCP não ingressa nativamente Worker | broker TLS externo e ponte WSS |
| R10 | Alta | JEV sem API especificada | adapter typed, integration blocked until real endpoint |
| R11 | Média | Provedor IA sem consent e custos | opt-in, budget, quotas e fallback sem IA |
| R12 | Crítica | Alerts confundidos com medicina | no clinical claim, review legal/medical before any health device marketing |
| R13 | Alta | Falsa percepção de 24/7 | last seen/freshness e SLA separado da conectividade BLE |
| R14 | Média | Ligações/WhatsApp externos | integração opt-in com providers autorizados, quotas/custos |
| R15 | Alta | Gestão familiar sem direitos da pessoa | escopos, revogação, acesso auditável |

## Decisões iniciais (rever apenas por ADR)
D-01 Kotlin/Compose no Android; D-02 Cloudflare Workers/DO/D1/R2/Queues; D-03 WebSocket como controle primário, MQTT bridge para IoT; D-04 processamento gestual preferencialmente local; D-05 nem todos os recursos em firmware legado: capabilities explícitas; D-06 frontend em React TS; D-07 não diagnosticar doenças; D-08 nenhum comando safety-critical; D-09 IaC e ambiente staging; D-10 DR/observabilidade desde o começo.

## Questões que não impedem codificação local, mas impedem integração final
- Cloudflare account, DNS zone e orçamento de produção (credenciais de deploy).
- Dispositivo Mi Band 3 real, versão de firmware e autorização para experimentos.
- Endpoints credenciais e contratos reais do JEV/MCP específicos.
- Escolha provedor de autenticação social, e-mail push e faturamento sujeitos a contrato.
- Política de retenção final definida pelo jurídico/negócio.
- Domínio de produção e certificados/segredos.
Definir adaptadores e defaults documentados, sem fabricar dados de provedores.

## Risco v1.1 — alteração de interface da pulseira
- Risco crítico: instalação `.res`/`.ft` incompatível inutiliza ou quebra menus; mitigação por assinatura, matching exato por variante/firmware, bateria, aprovação local, homologação HW16–HW24 e ausência de override.
- Risco crítico: promessa de rollback onde o BLE não responde; mitigação por wording de restauração assistida condicionada e documentação de recuperação.
- Risco jurídico: recursos extraídos de APK proprietário/arte de terceiros ou código Gadgetbridge AGPL; mitigação por inventário de origem, prova de licença e revisão jurídica.
- Risco operacional: process kill, GATT error 133, disconnect e streaming concorrente; mitigação por foreground service/journal/mutex/observabilidade/reconciliação sem retomar cegamente.
- Risco supply-chain: releases adulterados ou revogados; mitigação por assinatura/hashes/R2 privado/four-eyes/revogação.
