# Runbooks operacionais

Cada runbook segue: **sintoma → verificação → ação → critério de saída → o que registrar**.
Nenhuma ação abaixo exige credenciais no repositório; use o secret manager / `wrangler secret`.

## RB-01 Kill switch de automações
- **Sintoma:** automação disparando indevidamente ou alertas em excesso.
- **Verificar:** `GET /v1/automations` → `meta.kill_switch`; auditoria `automation.executed`.
- **Ação:** definir a chave KV `automations-killed:<tenant_id>`; a API passa a bloquear execução e o console exibe aviso.
- **Saída:** causa raiz corrigida, automação revisada (AST + `risk_level`), chave removida.
- **Registrar:** incidente, tenant, automação, decisão.

## RB-02 Suspeita de roubo de sessão
- **Sintoma:** evento de auditoria `auth.refresh_reuse_detected`.
- **Verificar:** sessão revogada automaticamente; IP/dispositivo do último uso.
- **Ação:** orientar troca de senha e novo login; revisar `api-keys` e `webhooks` do usuário.
- **Saída:** nenhuma nova reutilização em 24 h.

## RB-03 Solicitação LGPD (acesso, exportação, exclusão)
- **Exportação:** `POST /v1/exports` → acompanhar `GET /v1/exports/:id` → download assinado com expiração.
- **Exclusão:** conforme política de retenção; confirmar remoção em D1/R2 e encerrar sessões.
- **Prazo:** responder ao titular dentro do prazo legal; registrar protocolo.

## RB-04 Outbox do app não esvazia
- **Sintoma:** "Pendentes" crescendo em Ajustes.
- **Verificar:** itens `REJECTED_PERMANENT` (códigos `UNIT_MISMATCH`, `OUT_OF_RANGE`...) vs. `CONSENT_REQUIRED` (aguarda consentimento) vs. rede.
- **Ação:** consentimento ausente → pedir ao usuário; erro 401 → novo login; versão do app incompatível → atualizar.

## RB-05 Fila/consumidor Cloudflare atrasado
- **Verificar:** métricas em `GET /v1/admin/metrics` e `GET /v1/admin/health`; dead-letter queue.
- **Ação:** reprocessar DLQ após corrigir causa; nunca descartar mensagem de telemetria sem registro.

## RB-06 Equipamento IoT não responde ao desarme
- **Regra:** o equipamento é fail-closed — sem heartbeat dentro do TTL ele desarma sozinho (watchdog local).
- **Ação:** confirmar estado físico no local antes de qualquer novo arm; nunca contornar o intertravamento.

## RB-07 Rollback de migração D1
- Migrações são reexecutáveis; para reverter, aplicar o script de reversão correspondente em staging primeiro e anexar o resultado ao incidente.
