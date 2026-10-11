# 06 — Protocolo WebSocket Pulse Realtime v1

## Objetivo e topologia
`wss://api.pulse.deltabots.com.br/v1/realtime?ticket=<short-lived>` por conexão Android, console e gateway IoT nativo; ticket de uso único (<60s), transportado no handshake TLS, auditar acesso e nunca registrar URI completa. Por segurança, preferir negociação de ticket via cookie seguro ou subprotocol quando tecnicamente compatível; evitar query token persistente em logs. O Worker valida identidade/tenant/escopo e faz upgrade roteado para `PulseSessionRoom` via Durable Objects Hibernation API.

**No início de sessão física:** cada quarto DO é indexado por `tenant_id:control_session_id`, com TTL explícito, limite de participantes, versão de política, autorização já validada e revogação ativa. Sessões de telemetria passiva podem ter DO por gateway com fan-out para espectadores autorizados.

## Envelope (contrato normativo)
```json
{
  "v": 1, "id": "01J...", "type": "gesture.detected",
  "tenant_id": "ten_...", "session_id": "ses_...",
  "device_id": "dev_...", "gateway_id": "gw_...",
  "seq": 55, "sent_at": "2026-10-11T20:30:00.000Z",
  "expires_at": "2026-10-11T20:30:00.350Z",
  "trace_id": "trace_...", "payload": {"gesture":"wrist_right","confidence":0.96,"model_version":"g1"}
}
```
Todos os IDs e claims derivados da sessão autenticada; valores enviados são comparados, não confiados. `seq` cresce por emissor/sessão, replay é rejeitado. `sent_at` não usado isoladamente para TTL: calcular no server com tempo de recepção e clock skew validado. Frame limite inicial: JSON ≤16 KiB; raw frame binário de laboratório ≤64 KiB, fragmentação e batching com versão/CRC/checksum.

## Mensagens permitidas
`session.hello`, `session.ready`, `session.arm.request`, `session.armed`, `session.disarm`, `session.revoked`, `session.heartbeat`, `session.status`, `device.status`, `telemetry.update`, `gesture.sample_batch` (lab only), `gesture.detected`, `gesture.rejected`, `control.command`, `control.accepted`, `control.executed`, `control.failed`, `control.expired`, `command.ack`, `policy.changed`, `server.error`, `rate_limited`.

## Estados de conexão/controle
- WSS `CONNECTING→AUTHENTICATED→READY→CLOSED/RETRYING`.
- Controle `DISARMED→ARM_REQUESTED→ARMED→DISARMED/EXPIRED/FAULT`; transições ARM requerem interação explícita local e destino permitido; no modo remoto, sessão requer confirmação local do gateway físico.
- Fail-closed se: revogação, heartbeat ausente, variação crítica de latência, token expirado sem renovação, comando fora de ordem, equipment gateway drop ou dispositivo inacessível.

## ACK e semântica
`ACK_ACCEPTED` confirma recebimento; `ACK_EXECUTED` confirma estado verificado no equipamento; `ACK_REJECTED` fornece erro; não confundir entrega com execução. `control.command` carrega `command_id`, `capability`, `action`, `arguments`, `idempotency_key`, `expires_at`, `max_duration_ms` e `expected_state_version`. Mesmo comando duplicado recebe resposta anterior.

## Backpressure e QoS
Frames gestuais de alta frequência são best-effort; descartáveis quando expirados ou fila > capacidade. Nunca enfileirar movimentos contínuos antigos. Eventos de auditoria e segurança usam persistência assíncrona at-least-once com dedupe. Heartbeat de sessão: 5s ativo, timeout 15s de demonstração configurável (não garantia); pings padrão WS automaticamente tratados pelo runtime; heartbeat de aplicação necessário para atestar gateway físico, não para manter hibernation. Batch experimental 50-100ms conforme aconselhamento Cloudflare, sob validação de latência.

## Segurança específica
Scopes exatos: `realtime:read`, `gesture:stream`, `control:arm`, `control:execute`, `device:ack`. Políticas aplicadas por evento e por destino no DO, não só no upgrade. Token vinculado a `tenant,user,gateway,room`, revogação e troca periódica. Sem broadcast cross-tenant, sem fan-out a familiares sem consentimento ativo. JSON Schema com `additionalProperties:false` em comandos e limites por type.

## Retomada / sincronismo
WSS reconectado com novo ticket; cliente envia cursor (`last_event_id`); servidor pode reenviar apenas eventos históricos não expirados e não físicos. Comandos de controle não são automaticamente reaplicados. Em BLE/app offline o controle fica `DISARMED` e exige armar novamente. Diferença entre latência da rede e latência total visível no console.

## Instrumentação
`capture_monotonic_ns` (Android), `gateway_send_monotonic_ns`, `edge_receive_time`, `edge_route_time`, `actuator_receive`, `actuator_ack`. Calcular métricas end-to-end via clock sync ou relógio monotônico dentro do mesmo host; relógios remotos não sincronizados → estimativas qualificadas e RTT.
