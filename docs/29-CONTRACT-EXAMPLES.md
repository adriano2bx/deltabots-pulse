# 29 — Exemplos contratuais de mensagens

## Telemetry batch
```json
{"gateway_id":"gw_demo","device_id":"dev_demo","batch_id":"01J01DEMO","readings":[{"reading_id":"01J01HR","kind":"heart_rate_bpm","observed_at":"2026-10-11T17:00:00.000Z","value":72,"unit":"bpm","quality":"measured","source":"ble_miband3"},{"reading_id":"01J01STEPS","kind":"steps_total","observed_at":"2026-10-11T17:00:00.000Z","value":8400,"unit":"steps","quality":"estimated","source":"ble_miband3"}]}
```
## Ack
```json
{"batch_id":"01J01DEMO","accepted":["01J01HR","01J01STEPS"],"duplicates":[],"rejected":[],"server_time":"2026-10-11T17:00:01.000Z"}
```
## Comando físico seguro
```json
{"v":1,"id":"evt_01","type":"control.command","session_id":"sess_01","seq":42,"sent_at":"2026-10-11T17:00:00.000Z","expires_at":"2026-10-11T17:00:00.350Z","payload":{"command_id":"cmd_01","equipment_id":"eq_led_demo","action":"set_led","arguments":{"value":true},"idempotency_key":"idem_01","max_duration_ms":2000}}
```
## ACK real do atuador
```json
{"type":"control.executed","session_id":"sess_01","payload":{"command_id":"cmd_01","equipment_id":"eq_led_demo","observed_state":{"led":true},"executed_at":"2026-10-11T17:00:00.200Z"}}
```
## Erro normalizado
```json
{"type":"https://pulse.deltabots.com.br/problems/capability-unverified","title":"Capability unavailable","status":409,"code":"CAPABILITY_UNVERIFIED","detail":"Raw accelerometer streaming is unverified for this firmware","trace_id":"trc_01"}
```
**Nota:** IDs e horários acima são exemplos artificiais e não devem ser exibidos como dados reais de usuário.
