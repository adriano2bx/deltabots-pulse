# ADR-0001 — WebSocket principal, MQTT interoperabilidade
**Status:** Aceita
**Contexto:** Cloudflare DO suporta WSS nativamente; MQTT TCP inbound depende de broker fora de Workers. Precisamos Android/browser/IoT com baixa latência e controle seguro.
**Decisão:** comunicação WSS via DO para dados live e controle; MQTT/TLS por bridge Node no EasyPanel com broker dedicado para devices IoT. Sem raw streaming incessante para nuvem exceto laboratório consentido. Nunca Queue no hot path de comando físico.
**Consequências:** menor dependência de broker na experiência central, mais fácil integrar browser; MQTT adiciona infraestrutura externa e testes de semântica QoS/retain/idempotency; cuidado com E2E latência.
