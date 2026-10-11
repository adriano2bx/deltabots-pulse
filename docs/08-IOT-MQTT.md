# 08 — Equipamentos remotos, WebSocket e bridge MQTT

## Arquitetura e escolha
- WebSocket WSS/DO = primeira classe para app, browser e gateways nativos.
- MQTT/TLS = interoperabilidade industrial/maker via broker externo (EMQX ou Mosquitto) gerenciado numa VPS/EasyPanel; Cloudflare Workers não recebe diretamente MQTT TCP clássico.
- `apps/bridge-mqtt` conecta WSS ao DO, e MQTT ao broker TLS com mutual auth quando cabível. É produto completo, não stub.

## Contrato de dispositivo
Cada equipamento declara `equipment_id, tenant_id, connector (WSS|MQTT), capabilities, action_allowlist, safety_class, max_rate, watchdog_ms, ack_mode, online_lease, firmware, owner, policy_version`. Provisionamento por token efêmero certificado e rotação. Nenhum IP externo aberto no ESP32; saída WSS/MQTT para broker.

## Convenção MQTT (modelo)
`pulse/v1/{tenant_id}/{equipment_id}/status`
`pulse/v1/{tenant_id}/{equipment_id}/cmd`
`pulse/v1/{tenant_id}/{equipment_id}/ack`
`pulse/v1/{tenant_id}/{equipment_id}/telemetry`
ACL broker impede publish/subscribe fora do próprio equipamento e tenant; não tratar topic fornecido pelo usuário como autorizador. `cmd` QoS0 para controle efêmero com deadline; QoS1 para configurações idempotentes, nunca retain em `cmd` ou em movimento. Status LWT online/offline, message expiry quando broker suportar. Frame contém command_id e TTL para rejeição no equipamento.

## Bridge
- Da nuvem: autentica control room, recebe `control.command`, valida esquema/política, traduz somente mapeamentos permitidos, publica MQTT com deadline e correlate ID.
- Do broker: recebe `ack` e `telemetry`, verifica assinatura/origem/topic, registra correlação e envia WSS/HTTPS conforme necessidade.
- TLS obrigatório, broker URL e credenciais secrets; clientes de bridge rotacionáveis, graceful reconnect/backoff, DLQ somente config e eventos não atuadores; sem replay de movimento após reconnect.
- Heartbeat de link e gateway; indicadores RTT, mensagens perdidas, QUO backlog, rejeições ACL.

## Segurança física obrigatória
- Demo homologada inicia com LED/servo desacoplado de carga; jamais tomada AC exposta/motor pesado como padrão.
- Controlado permitido: luz/LED, robô de bancada seguro, relé de baixa tensão apropriado, automações digitais sem impacto físico perigoso.
- Proibido automaticamente: elevadores, veículos, portas de emergência, equipamentos médicos, maquinário industrial, atuação que possa lesionar ou causar perda material relevante.
- Watchdog no ESP32: para toda saída ou neutraliza após `watchdog_ms` sem comando válido, independente da nuvem.
- E-stop físico/interruptor local para movimento, sem depender de rede. Startup DISARMED; hardware exige sessão `armed` local.
- Validação do comando: allowlist, signed/token bound, TTL, seq, idempotency cache, max duty cycle/max speed, limiter; rejeitar replays.

## Integrações concluídas esperadas
Gateway WSS genérico, bridge MQTT containerizada com health endpoint/prometheus, Home Assistant adapter (serviço externo), ESP32 firmware de bancada com documentação fio-a-fio de baixa tensão, integração HTTP webhook. Testes de chaos: broker fora, duplicação QoS1, reconnect, stale cmd, revocation, clock skew, 1% packet loss, comms partition.
