# 09 — Infraestrutura Cloudflare de produção

## Serviços e deploy
- **Workers**: API Hono + OpenAPI + auth policies + ingestão e relatórios.
- **Durable Objects**: `PulseSessionRoom` SQLite backed, WebSocket Hibernation API `ctx.acceptWebSocket`, `serializeAttachment` por cliente; nunca guardar segurança exclusivamente em memória.
- **D1**: transações metadados/políticas e agregados; evitar raw a cada 20ms; db principal inicial e estratégia de sharding por tenant, pois D1 tem limite por DB.
- **Queues + DLQ**: ingestão, agregação, exportações e notificações; entrega at-least-once → idempotência.
- **R2**: arquivos de import/export, dados brutos consentidos e backups do app. URLs temporárias, segregação de prefixos por tenant e retenção.
- **KV**: flags/cache não autoritativo; não usar para comandos/ACL críticos se consistência eventual representar risco.
- **Analytics Engine / Logs**: métricas operacionais agregadas, não payload de saúde.
- **Workers AI (opcional provider)**: geração controlada de resumos; provedor/versão substituível; custos monitorados. Não usar para diagnóstico.
- **Vectorize**: apenas se a memória autorizada justificar; omitido da hot path.
- **Access**: proteger ferramentas operacionais internas; não substituir login de usuários de consumo do Android.
- **WAF/Turnstile**: defesa web e anti-abuso; Android não deve depender de captcha a cada sync.

## Configuração de referência
Ver `infra/cloudflare/wrangler.example.jsonc`. Criar bindings tipados: `DB`, `RAW_BUCKET`, `INGEST_QUEUE`, `NOTIFY_QUEUE`, `SESSIONS`, `CONFIG_KV`, opcional `AI`. Definir secrets: `JWT_PRIVATE_KEY` (se assim escolhido; preferir par de chaves assimétricas), `JWT_PUBLIC_KEY`, `OAUTH_CLIENT_*`, `WEBHOOK_SIGNING_SECRET`, `BILLING_WEBHOOK_SECRET`; NÃO preencher em arquivos versionados. Ambientes com secrets distintos e IaC.

## WebSockets
A Cloudflare recomenda Hibernation API DO e batching para alta taxa de mensagens; state persisted ou attachment para reidratação. Um DO agrega somente participantes de uma sessão limitada; sem global object único para milhares de clientes. Heartbeats de aplicação mínimos e alarms deliberados; timer recorrente impede hibernação.

## D1 scaling
D1 suporta bancos individualmente limitados (10 GB no plano pago no período consultado), e escritas por banco não são paralelas ilimitadamente. Projetar índices, retenção e agregados; R2 para raw. Monitorar tamanho, latência/query plans e custo de linhas; separar tenant conforme necessidade com routing interno e migrações.

## Filas
Queue = semântica at-least-once, dedupe persistente por `event_id`. Não encaminhar controle com TTL subsegundo via Queue. Filas: `pulse-telemetry`, `pulse-notifications`, `pulse-jobs` cada uma com DLQ e alerta. Redrive via auditoria/admin, comandos físicos expirados nunca redrive.

## Operações
- Terraform/Cloudflare provider ou Wrangler scripts, ambientes isolados e CI OIDC quando possível.
- Canary deploy, feature flags per tenant, migração expand/contract, backup pré-migração, smoke e rollback.
- Respeitar rate limits de plano/conta; capacidade de custos dimensionada com cenários pequenos/médios/grandes em `27-OBSERVABILITY.md`.
- Rotas/dns condicionadas a configuração autorizada da conta; não afirmar que o ambiente já existe.

## ADR: motivos da escolha
Simplifica observabilidade, APIs e hospedagem e mantém bidirecionalidade WSS sem broker obrigatório. MQTT permanece ponte externa explícita. Escolha não implica latência física garantida em redes móveis e nem que Cloudflare seja serviço de emergency-response.

## Serviços Wearable UI v1.1
Workers fornecem catálogo filtrado, manifests, tickets curtos de download e endpoints de auditoria; D1 guarda temas/revisões/compatibilidades/aprovações/instalações; R2 privado guarda `.res` licenciados, prévias e manifestos assinados; Queues executam validação e publicação de artefatos, não transferência BLE; Console Theme Studio publica apenas com revisão de direitos e evidência HW. Jamais embutir chave privada de assinatura no browser ou no Android. Especificação: docs 35 e contratos OpenAPI.
