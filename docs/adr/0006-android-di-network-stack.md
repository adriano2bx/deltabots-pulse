# ADR 0006 — Android: Koin, Ktor e kotlinx.serialization

## Status
Aceito — 2026-10-11.

## Contexto
`docs/04-ANDROID.md` pede DI (Hilt ou Koin, com ADR) e rede (OkHttp/Retrofit ou Ktor). O ambiente de
desenvolvimento não alcança o repositório Google Maven; somente o CI compila módulos Android. Cada ciclo
de geração de código (kapt/KSP) que falha custa uma rodada de CI.

## Decisão
- **Koin** para DI: sem geração de código; o grafo é verificado em teste (`verify()`/`checkModules`).
- **Ktor client (engine OkHttp)** + **kotlinx.serialization** para HTTP e WebSocket: os mesmos tipos e
  clientes são testáveis na JVM pura e servem de base ao SDK Kotlin (F251).
- **Room com KSP** permanece (única geração de código), exigido para migrações versionadas.

## Consequências
+ Menos processadores de anotação, builds mais previsíveis, módulos de domínio verificáveis fora do Android.
− Erros de grafo DI aparecem em tempo de execução, mitigados por teste de verificação de módulos no CI.
