# 14 — Motor de automações e DSL

## Modelo
`Automation {id, tenant_id, owner_id, title, enabled, version, trigger, conditions[], actions[], consent_scopes[], cooldown_ms, schedule, max_executions, risk_level, expires_at, created_at, updated_at}`. Editor visual gera AST validada; regras versionadas, auditadas, simuláveis com datas sintéticas e históricas consentidas.

## Triggers
- Telemetria: `heart_rate_threshold`, `steps_delta`, `inactivity_duration`, `sleep_started/ended` apenas se evento verificável.
- Estado: `device_connected/disconnected`, `sync_stale`, `battery_low`, `gateway_online/offline`.
- Agenda: `cron_schedule`, `time_window` com timezone IANA/DST.
- Gestos: `gesture_detected` somente com raw capability comprovada e sessão armada se ação física.
- Operação: `alert_created`, `report_generated`, `external_webhook_received` autenticado.

## Conditions
Comparação, AND/OR, durações, histórico, quality flags, suppression, cooldown, estado de consent, presença de usuário, risco da ação, tenant policy, mode. Nunca implementar eval JS de expressões fornecidas pelo usuário; AST com Zod e operadores enumerados.

## Actions
`send_push`, `send_email`, `send_signed_webhook`, `notify_family_if_granted`, `create_checkin`, `generate_report`, `schedule_reminder`, `call_mcp_allowlisted`, `propose_jev_decision`, `request_control_approval`, `control_discrete_when_armed` com todos gates; `export_data` autorizado. Allowlist e quotas por ação.

## Semântica execução
At-least-once do Queue → dedupe `rule_id:event_id:rule_version`; políticas avaliadas no momento da execução e antes de cada ação. Alertas não médicos; negar ações físicas quando informação expirada/baixa qualidade. Orquestração passo-a-passo com status `pending/running/completed/rejected/failed/expired/cancelled`; DLQ para falhas não físicas, com replay manual controlado.

## Exemplo DSL
```json
{"v":1,"title":"Inatividade prolongada","enabled":true,
 "trigger":{"kind":"inactivity_duration","minutes":120},
 "conditions":{"op":"and","rules":[{"field":"quality","op":"eq","value":"valid"},{"field":"time_local","op":"between","value":["08:00","22:00"]}]},
 "cooldown_ms":21600000,"actions":[{"type":"send_push","target":"owner","template_id":"inactivity_nudge"}]}
```

## Editor e simulação
Tela com trigger→conditions→actions→preview→simulate 7/30 dias→explicação de cada execução→ativação com resumo de privacidade; wizard exibe disabled triggers se firmware incompatível. Criar automações a partir de sugestão IA só como rascunho que exige revisão do usuário.
