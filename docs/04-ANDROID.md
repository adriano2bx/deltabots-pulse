# 04 — Especificação Android nativo

## Stack
Kotlin, Gradle Kotlin DSL, Jetpack Compose Material3 com design system DeltaBots, Navigation Compose, Coroutines/Flow, Hilt ou Koin (escolher com ADR), Room (migrations), DataStore, Android Keystore/Encrypted storage quando apropriado, OkHttp WebSocket/Retrofit ou Ktor verificando compatibilidade, WorkManager, BLE BluetoothGatt e CompanionDeviceManager. Target SDK mais atual estável verificado no início do projeto; minSdk 29 por padrão sujeito a pesquisa de público. Assinatura Play Integrity opcional por modo de distribuição.

## Módulos e limites
`app/`, `core:domain/`, `core:contracts/`, `core:designsystem/`, `core:database/`, `core:network/`, `feature:auth/`, `feature:onboarding/`, `feature:devices/`, `feature:health/`, `feature:activity/`, `feature:sleep/`, `feature:notifications/`, `feature:gestures/`, `feature:automation/`, `feature:ai/`, `feature:family/`, `feature:reports/`, `feature:settings/`, `feature:support/`, `feature:billing/`, `device:ble/`, `device:miband3/`, `gateway:sync/`, `gateway:realtime/`, `benchmark/`.

## BLE lifecycle (state machine)
`UNINITIALIZED → PERMISSION_REQUIRED → SCANNING → DEVICE_FOUND → CONNECTING → DISCOVERING_SERVICES → AUTHENTICATING → CAPABILITY_PROBING → READY → SYNCING/STREAMING → DISCONNECTED/ERROR`.
Cada transição registrada sem payload sensível. Serializar operações GATT (fila única) e definir timeout por operação, retentativas limitadas e resposta a status 133/8/19 etc. Reescanear de modo energeticamente eficiente e não manter scanning indefinido.

## Foreground/background
- Usar `CompanionDeviceManager` para associação quando compatível e `CompanionDeviceService` para presença; nas versões Android 16+ usar APIs novas de presença se disponíveis.
- Para sessão ativa de conexão longa, FGS tipo `connectedDevice`, notificação persistente claramente explicada, observando restrições Android 12+ e permissões `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `POST_NOTIFICATIONS` quando aplicável.
- WorkManager exclusivamente para sync deferrable/periodic; não depender dele para WebSocket ou controle determinístico de baixa latência.
- Desligar WS/gateway na opção usuário, logout, revogação de consentimento; notificar qualquer sessão remota armada.

## Persistência e sincronização
Entidades locais: Device, MetricSample, SleepSegment, Activity, SyncCursor, OutboxItem, ConsentSnapshot, GestureTemplate, PendingCommand, UserPrefs. Database criptografado quando técnica viável e desempenho aceitável; Keystore para material sensível. Append-only outbox, retry backoff exponencial com jitter; dedupe pela `reading_id`. Sync bidirecional apenas para configurações, notificações e comandos autorizados; relógio do gateway reporta skew.

## UI/UX
Cada tela em `15-UX-SCREENS.md` terá loading/skeleton, empty, offline, stale, permission denied, auth expired, error retry, success e acessibilidade. Navbar 5 seções: Início, Saúde, Gestos, Automações, Mais. Rotas profundas autenticadas; drawer via Mais. Sem gráficos fake. Timezone IANA. Dark serious, graphite/white/teal/cyan controlado, sem gradientes/brilho extravagante.

## Notification forwarding
Opt-in e filtros por app/categoria. Uso de NotificationListenerService apenas quando usuário habilitar; não coletar conteúdo sensível sem necessidade. Não prometemos espelhar todas as notificações da Mi Band 3 sem confirmação do driver; fallbacks no Android.

## Segurança
- OAuth PKCE/cookies aplicáveis; mobile refresh tokens protegidos Keystore, rotating refresh, revogação por device; não logar token/MAC sem anonimizar.
- Biometria local protege acesso, não substitui autenticação servidor.
- Interação gestual exige confirmação de arm no aparelho; expire após inatividade e desconexão.
- TLS, certificate pinning somente com rotação planejada, nunca desabilitar validação.

## Performance e energia
Agendar coleta conforme perfil (normal, econômico, laboratório), reduzir notificações BLE, throttling gráficos (5-10 Hz UI), enviar eventos reconhecidos; raw experimental em bursts e apenas com consentimento. Medir CPU, BLE data rate, wake locks, battery drain e ANRs em 3 aparelhos e 3 versões Android.

## Testes Android
Robolectric/JUnit, Compose UI tests, Macrobenchmark, instrumentation com fake BLE, testes hardware-in-the-loop, Android emulator API 29–target, kill/restart background, permissions deny/permanent, battery optimizer, mudança de rede, timezone/DST, Bluetooth toggle, pareamento simultâneo, firmware diferente, app fechado.

## Módulo Wearable UI Engine (v1.1)
Adicionar `feature:wearable-ui/`, `device:resource-updater/`, `core:theme-contracts/`, `theme:preview/`, `theme:install/`. Telas A65–A76 com UI Compose e acesso via `Dispositivos → Mi Band 3 → Personalizar pulseira`. A instalação é feita localmente em foreground service `connectedDevice` de duração controlada, notificação de status, GATT exclusivo, Room `ThemeUpdateJournal` e verificação real do manifesto. Suspender sincronizações não essenciais, streams raw e sessões gestuais armadas durante atualização. Download HTTPS pode usar WorkManager; transferência BLE crítica não pode depender de execução adiada WorkManager. A UI exibe progresso distinto `downloaded`, `sent-to-BLE`, `device-ACK`, `post-verified`, nunca um percentual de sucesso enganoso. Implementação normativa: `34-WEARABLE-UI-UPDATES.md` e `36-BLE-THEME-OTA-PROTOCOL.md`.
