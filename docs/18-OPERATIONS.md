# 18 — Operações, suporte e incidentes

## Runbooks
- `INC-001 API degradada`: conferir Worker errors, WAF, D1 query duration, últimas releases, comparar canary, rollback app/API, comunicar status; ações sem apagar filas.
- `INC-002 WS/DO desconectando`: logs correlacionados, DO alarm/hibernation, spikes, auth ticket expiry; desarmar controle por segurança.
- `INC-003 Queue backlog`: tamanho, consumers, poison message, DLQ, retry; nunca redrive comandos vencidos.
- `INC-004 D1 storage/lock`: query plan, shard sizing, retention, exports R2, limiter de ingestão.
- `INC-005 MQTT indisponível`: stop/disarm gateway, broker health/TLS/auth, bridge errors, restaurar manualmente com nova sessão.
- `INC-006 Conta comprometida`: revogar tokens/key, audit, forçar MFA, preservar timeline minimizada.
- `INC-007 Dados pessoais expostos`: incidente LGPD, suspensão selective, DPO, containment, notification legal.
- `INC-008 BLE incompatível`: coletar firmware, GATT nonsecret diagnostics, capability `UNVERIFIED`, rollback driver.

## Atendimento ao usuário
Base de ajuda (inicialização, permissão BLE, otimização Android, consumo bateria, offline, firmware, convite familiar, exportação, exclusão, botão ajuda, automações, falhas). Tickets com consent para logs e prazo de exclusão. Nunca pedir senha/chave de autenticação privada em texto puro por atendimento.

## Backup, DR e atualização
Agendar backups D1/config e dumps R2 onde aplicável; exercitar restore trimestralmente. D1 Time Travel é recurso dependente de plano/retenção, não substitui estratégia própria. Expand/backfill/contract; app e server compatíveis por pelo menos 2 releases; rollout staged Android e console.

## Guardrails de produção
Circuit breaker em IA e integrações externas, limite de custo por tenant, watchdog de erro e alarmes; rollout desabilita control engine em caso de incidência de false activation. Incident commander com kill switch global auditado. Sessões de controle físico nunca podem continuar após logout/revogação.

## Runbook de atualizações `.res`
Monitorar por `attempt_id` fases/erros, anomalias `TRANSFER_COMPLETE_UNVERIFIED`, pacotes revogados e instalações por variante. Quando falha BLE: não iniciar retentativa automática de flash, guardar journal local, oferecer diagnóstico e assistência. Revogar release bloqueia novas tentativas, sem remover silenciosamente temas instalados. Auditoria de aprovações/releases. Não realizar OTA via comando remoto. Ver docs 34–36.
