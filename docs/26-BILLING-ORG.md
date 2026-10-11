# 26 — Organizações, planos, quotas e faturamento

## Organizations
Tenancy por conta pessoal e organizações; convites de membros, papéis, escopos, device assignments, administradores, políticas (retention, data sharing), logs e export por organização. Dados individuais de saúde mantêm titularidade/escopos e nunca se tornam automaticamente visíveis ao admin organizacional.

## Planos (configuráveis, sem preços inventados)
`personal`, `family`, `developer`, `organization` com entitlements em tabela: device_count, gateway_count, history_retention_days, storage_gb, api_calls_month, realtime_minutes, gesture_raw_quota, ai_tokens_budget, webhook_count, org_members, support_sla. Preços, gateways de cobrança e impostos são decisões comerciais externas; UI exibe somente configuração real retornada da API.

## Ciclo
trial opcional → ativa → past_due → grace → suspended → cancelled; webhook provider assinado/idempotente, invoices e receipts por provedor; exportação e exclusão seguem LGPD mesmo após cancelar. Free-tier não implica ignorar quotas.

## Custos
Custos internos por família (Workers requests, D1 read/write/storage, Durable Object duration + messages, R2, Queues, AI tokens, push/e-mail/WhatsApp, MQTT broker). Chargeback/showback por tenant sem logar payload sensível.
