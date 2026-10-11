# 27 — Observabilidade, SLOs e capacity planning

## Métricas
`api_requests_total{route,status}`, `api_latency_ms`, `ws_sessions_active`, `ws_messages_total{type}`, `ws_route_latency_ms`, `ble_disconnect_total{driver}`, `ble_packet_loss_rate`, `gateway_last_seen_age_s`, `device_freshness_age_s`, `telemetry_batch_accept_rate`, `queue_oldest_age_s`, `db_query_latency_ms`, `r2_storage_bytes`, `mqtt_bridge_connected`, `command_expired_total`, `command_rejected_total{reason}`, `control_watchdog_trips_total`, `false_activations_per_hour` em laboratório, `ai_cost_usd`, `consent_denials_total` agregada.

## Logging/tracing
OpenTelemetry/W3C traceparent propagado Worker→DO→bridge com sampling; IDs de usuários pseudonimizados, nunca raw saúde/password/API tokens/URL ticket. Log retention audit policy. Dashboard Grafana opcional via exportador de métricas.

## Cenários de capacidade (calculadora, não estimativa de preço)
Fórmula: `monthly_ingest_readings = active_devices × avg_readings_per_day × days` e `ws_frames = sessions × duration_s × hz/numSamplesPerFrame`. Definir cenários 100/1k/10k dispositivos; 1k/10k leituras por device/dia; gesture lab 10/50/100Hz se hardware suporta. Dimensionar D1 por agregação e índices, R2 raw, limite DO por sala, quota AI e custo por tenant. O Claude deve medir precios conforme pricing oficial vigente, sem números arbitrários.

## Alertas
P1: cross-tenant signal, unauthorized command, e-stop failures, control sessions stuck; P2: API 5xx > limiar, live latency, queue backlog, DB capacity, MQTT broker offline; P3: cost overrun, AI quota. Runbooks `18-OPERATIONS.md`.

## SLO e erro orçamentário
Medir uptime API, p95 REST, WSS route, data freshness e command ACK separadamente. Publicar status transparente para outages Cloudflare/BLE/OS/MQTT; não somar percentuais como se um único SLA físico estivesse garantido.

## Métricas Wearable UI
`theme_catalog_requests`, `theme_download_failures`, `theme_signature_rejects`, `theme_compatibility_denials`, `theme_flash_started`, `theme_flash_verified`, `theme_flash_unverified`, `theme_flash_recovery_required`, com dimensão **não identificável** de variante/firmware/release; latências por etapa, sem dados brutos BLE sensíveis. Alertas de falhas de flash agrupadas por release para revogação.
