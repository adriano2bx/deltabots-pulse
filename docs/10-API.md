# 10 — Contrato REST / OpenAPI / SDK

## Convenções normativas
Base: `https://api.pulse.deltabots.com.br/v1` (domínio proposto). `application/json; charset=utf-8`; OpenAPI em `contracts/openapi.yaml`. `Authorization: Bearer <access_token>` na API externa; rotas de autenticação e webhooks como exceções. Respostas `problem+json` RFC 9457 (type,title,status,detail,code,trace_id,instance). UTC ISO8601 e IDs ULID/UUID; idempotência via `Idempotency-Key` para POST críticos; paginação por cursor e `limit` ≤100; ETag se cabível.

## Recursos e responsabilidades
- `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/me`, `/me/sessions`: identidade e sessões.
- `/consents`, `/consents/{id}`: permitir, consultar e revogar escopos de dados sensíveis.
- `/organizations`, `/organizations/{id}/members`, `/roles`: multi-tenancy e RBAC.
- `/devices`, `/devices/{id}`, `/devices/{id}/capabilities`, `/devices/{id}/status`, `/devices/{id}/commands`: inventário e controle tipado.
- `/gateways`, `/gateways/{id}/heartbeat`, `/gateways/{id}/certificates`: gateways e ciclo de credenciais.
- `/telemetry/batch`, `/telemetry/latest`, `/telemetry/history`, `/telemetry/summary`: ingestão/retrieval.
- `/activities`, `/sleep`, `/health/trends`, `/reports`, `/exports`: observação e portabilidade.
- `/automations`, `/automations/{id}`, `/automations/{id}/simulate`, `/automations/{id}/executions`: motor de regras.
- `/gestures/sessions`, `/gestures/models`, `/gestures/training-sets`, `/gestures/mappings`, `/gestures/metrics`: gesto com gating.
- `/control/sessions`, `/control/sessions/{id}/arm`, `/control/sessions/{id}/disarm`, `/control/sessions/{id}/commands`: controle com autorização e auditoria.
- `/share/invitations`, `/share/grants`, `/share/grants/{id}`: compartilhamento.
- `/notifications`, `/notifications/preferences`, `/alerts`, `/checkins`: alertas.
- `/integrations`, `/webhooks`, `/api-keys`, `/mcp/tools`: integrações e desenvolvedores.
- `/ai/chat`, `/ai/insights`, `/ai/feedback`, `/ai/models`: inteligência e explicações.
- `/billing/plans`, `/billing/subscription`, `/billing/usage`: planos se monetização ativada.
- `/admin/audit`, `/admin/health`, `/admin/metrics`: administração privilegiada.
- `/realtime/ticket`, `/realtime` upgrade WSS: sessão temporária, ver `06-REALTIME.md`.

## Semântica de ingestão
`POST /telemetry/batch` aceita `{gateway_id,device_id,batch_id,readings:[{reading_id,kind,observed_at,value,unit,quality,source}]}`. `kind` enumerado (`heart_rate_bpm`,`steps_delta`,`steps_total`,`sleep_interval`,`activity`,`battery_percent`,`connection_state`). Reject por item com motivo, admite `accepted_count`,`duplicates`,`rejected`. O lote pode ter resultados mistos; cliente só remove da outbox itens com ACK individual. Nunca repassar raw IMU em endpoint normal.

## Política de autorização
Escopos por recurso e propósito. `family_viewer` não ganha autorização de device commands; API key não pode ler telemetria sensível sem consentimento explícito; admin tenant não ganha acesso implícito a dados de saúde de membros. Qualquer rota obtém tenant de sessão/autorização, não aceita `tenant_id` arbitrário do cliente.

## Erros canônicos
`AUTH_REQUIRED`, `TOKEN_EXPIRED`, `CONSENT_REQUIRED`, `FORBIDDEN`, `TENANT_MISMATCH`, `DEVICE_UNAVAILABLE`, `CAPABILITY_UNVERIFIED`, `HW_UNSUPPORTED`, `RATE_LIMITED`, `VALIDATION_ERROR`, `COMMAND_EXPIRED`, `CONTROL_DISARMED`, `SAFETY_BLOCKED`, `CONFLICT`, `DUPLICATE`, `UPSTREAM_TIMEOUT`, `INTERNAL_ERROR`.

## Versionamento
Versão na URL REST, campo `v` em WS, `schema_version` em payload e migração. Breaking change → `/v2`; manter compatibility window e deprecation headers; SDK gerado acompanha testes de compatibilidade.

## Extensão REST v1.1 — temas e instalações
Adicionar `/themes`, `/themes/{themeId}`, `/themes/{themeId}/releases/{releaseId}`, `/themes/{themeId}/releases/{releaseId}/download-ticket`, `/devices/{deviceId}/theme-installations`, `/devices/{deviceId}/theme-installations/{installationId}`, `/devices/{deviceId}/theme-installations/{installationId}/events` e `/admin/themes...` no contrato OpenAPI. Authorization e binding de titular/gateway por dispositivo; nunca aceitar que o servidor dispare OTA. Eventos têm sequence monotônica, `attempt_id` e idempotência; respostas distinguem `VERIFIED_INSTALLED`, `TRANSFER_COMPLETE_UNVERIFIED`, `FAILED`, `RECOVERY_REQUIRED`. Ver docs 34–36.
