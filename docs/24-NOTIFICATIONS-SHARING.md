# 24 — Notificações, acompanhamento familiar e check-ins

## Eventos
`DEVICE_OFFLINE`, `SYNC_STALE`, `BATTERY_LOW`, `PERSONAL_TREND`, `INACTIVITY`, `CHECKIN_MISSED`, `SOS_REQUESTED`, `RULE_EXECUTION`, `CONTROL_ARMED`, `CONTROL_FAULT`, `SECURITY_SESSION`, `SHARE_INVITE`, `CONSENT_REVOKED`. Deduplicação por evento/cooldown, preferências por canal, quiet hours, timezone e escalonamento.

## Canais
Push (FCM ou gateway provider confirmado), notificação local Android, e-mail transacional e web inbox; WhatsApp via conta empresarial autorizada se integração habilitada. Não declarar entrega garantida de push/e-mail; estados queued/sent/delivered se provedor sinalizar.

## Família
Grants opt-in com métricas específicas (`hr`, `sleep`, `steps`, `location_phone`, `alerts`), dispositivos, intervalos, prazo e propósito; convite expirável e revogável; nenhum acesso implícito após aceitar convite. Não oferecer comando remoto a familiares somente por papel; exceções exigem fluxo independente de autorização e risco.

## Check-in e solicitação de ajuda
Botão local e opcional acionamento gestual apenas quando suportado. Registrar evento e notificar contatos conforme opt-in. Não chamar atendimento de emergência automaticamente sem integração oficial e consentimento apropriado. Mostrar confirmação e opção de cancelar para evitar disparos acidentais. Sem conexão: notificação local e fila com aviso de impossibilidade de entrega remota.

## Contra falsos positivos
Alertas de atividade e pulso precisam de qualidade válida, duração, cooldown e contexto. Usuário pode silenciar, ajustar e reportar falso positivo. Comunicação clara: sistema de bem-estar, não monitoramento clínico nem serviço de emergência 24/7.
