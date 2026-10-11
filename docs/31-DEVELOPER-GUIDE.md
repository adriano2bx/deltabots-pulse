# 31 — Guia de desenvolvimento e contratos de SDK

## Pré-requisitos
Node.js LTS verificado, pnpm estável e lockfile; Wrangler (versão estável verificada); Android Studio, JDK conforme AGP, Android SDK, emulator, Java/Kotlin toolchain; Docker/Podman para broker local; Python para specs/QA. Não fixar versão de dependência não verificada. Git hooks e CI obrigatórios.

## Provisionamento local sem segredos
1. Clone/extraia o repo.
2. `python quality/check_specs.py` valida o pacote de especificação.
3. Implemente workspace pnpm e Gradle seguindo arquitetura; não há código do app neste pacote ainda.
4. Crie scripts `pnpm dev:api`, `pnpm dev:console`, `pnpm dev:bridge`, `pnpm test:all`, `pnpm contracts:generate`, `pnpm infra:staging`.
5. Utilize `infra/.env.example` e `infra/cloudflare/wrangler.example.jsonc`; nunca versione `.env` real.
6. Emulador Android usa BLE fake driver; ensaio com Mi Band 3 requer aparelho real.
7. Broker local com TLS e credenciais de teste em volume docker não versionado, tópicos isolados.

## SDK TS
Gerar cliente a partir OpenAPI 3.1, tipar `PulseClient`, APIs sem estado global, requestId/traceId/idempotency, retry apenas segura/idempotente, token injection por strategy, erros normalizados, cancelation/AbortSignal. WS SDK gera session ticket, auto reconnect mas NUNCA auto-rearm, emits `onTelemetry`,`onGesture`,`onCommandAck` com schemas validados.

## Kotlin client
Modelos serializáveis gerados do contrato; HTTP client com typed errors e coroutine cancellation; BLE adapter sem reference cloud; sync queue isolate; WSS heartbeats/backpressure; nunca bloquear main thread.

## CI / contribution
PR com escopo F###, ADR se alterar policy/protocol, cobertura de teste, prova de acessibilidade e documentação; reviewer de segurança obrigatório em auth/control; changelog por release.

## Desenvolver driver de recursos e Theme Studio
Leia `docs/34-WEARABLE-UI-UPDATES.md`, `docs/35-THEME-STUDIO-PIPELINE.md`, `docs/36-BLE-THEME-OTA-PROTOCOL.md`, schemas JSON, `infra/migrations/0002_themes.sql` e ADR 0004. Implemente driver BLE original licenciado, testes GATT com fixtures e API Kotlin `WearableResourceUpdater`; gere tipos TypeScript e Kotlin dos contratos. Compile apenas recurso cujo formato/slots foram confirmados. Amarre evidências HW16–HW24 ao release D1 antes de publicar.
