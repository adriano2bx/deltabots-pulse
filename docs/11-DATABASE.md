# 11 — Banco de dados, modelo lógico e retenção

## Fontes de verdade
D1: identidade, tenancy, permissões, dispositivos, capabilities, dados históricos agregados, relatórios, regras, auditoria, subscriptions e billing. Durable Objects Storage: estado serializável/TTL de sessões de baixa latência, sem substituição das permissões persistidas. Room: outbox e histórico local. R2: pacotes raw consentidos e exportações.

## Tabelas no D1 (ver `infra/migrations/0001_initial.sql`)
`users`, `user_credentials`, `sessions`, `organizations`, `org_members`, `devices`, `gateways`, `device_capabilities`, `device_bindings`, `consents`, `share_invitations`, `share_grants`, `telemetry_readings`, `telemetry_aggregates`, `sleep_intervals`, `activity_sessions`, `alerts`, `notifications`, `checkins`, `automations`, `automation_runs`, `equipment`, `control_sessions`, `control_commands`, `gesture_models`, `gesture_training_sets`, `gesture_mappings`, `integrations`, `webhooks`, `api_keys`, `exports`, `ai_insights`, `ai_feedback`, `billing_subscriptions`, `billing_usage`, `audit_events`, `idempotency_keys`.

## Política de índices
Composite `(tenant_id,device_id,observed_at DESC)` em telemetry; `(tenant_id,source_id,reading_id)` UNIQUE por idempotência; `(tenant_id,status,updated_at)` nos jobs; índice de grants por titular/beneficiário/expiração; índices de control `session_id, seq`. Modelo usa soft delete só onde exigência de auditoria/legal justificar, senão hard delete por LGPD, com log anonimizado.

## Dados sensíveis e minimização
- Frequência cardíaca, sono, rotinas e localização ≈ dados potencialmente sensíveis; criptografia e consentimento por propósito.
- Não armazenar e-mails e dados biométricos em logs; pseudonimizar `subject_ref` quando possível.
- Retenção configurável por tenant e plano com teto/legal: config inicial sugerida telemetry 365 dias, raw gestos 30 dias opt-in, audit 365 dias minimizado, export URL 24h. Prazos são políticas propostas, não obrigação legal automática; permitir ajuste e solicitação LGPD.
- Dados de usuário excluído: revogar grants/sessões, remover do Room/DO/R2/D1 conforme workflow documentado, rastrear tombstones e conclusão; backup expira pela janela de retenção com controle de restauração.

## Particionamento
D1 é limitado em tamanho e throughput por banco: não acumular raw sensor streaming por frame. `telemetry_readings` para eventos discretos e downsampled; raw vai para R2 parquet/ndjson comprimido; TTL de visualização. Se throughput exigir, introduzir roteador por tenant e DBs dedicados, preservando API.

## Migração
Migrações numeradas sem edição retroativa; alterar schema via expand/backfill/contract. `PRAGMA foreign_keys=ON`, índices, unique e triggers de imutabilidade de audit onde aplicável. Testes de migration rollback com snapshot e export.

## Integridade
Chaves externas, constraints e Zod; cheque autorização antes de cada query; SQL parametrizado; controle de versão otimista em regras/gestos/equipment. Telemetry inclui qualidade, fonte, firmware e horário de ingestão.

## Schema Theme Engine
Rodar migração `infra/migrations/0002_themes.sql` após 0001. Tabelas `wearable_theme_projects`, `wearable_theme_releases`, `wearable_theme_artifacts`, `wearable_theme_compatibility`, `wearable_theme_installs`, `wearable_theme_events`, `wearable_theme_approvals`, `wearable_theme_revocations`; índices, constraints e isolamento tenant. Não armazenar payloads proprietários no D1 (apenas R2 com licença). O cliente Android persiste journal Room por tentativa.
