# 28 — Deploy staging/produção e CI/CD

## Ambientes
Local (Miniflare/Wrangler dev, SQLite ephemeral, fake BLE, test broker), staging (recursos Cloudflare separados, QA real autorizado), production (secrets/contas próprios). Domínios são propostas configuráveis e devem ser criados somente após autorização.

## CI
`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm contract:validate`, `pnpm test:e2e` (staging); Android `./gradlew lint test assembleDebug connectedAndroidTest` (connected em runner físico disponível); SAST/secret/license scan e SBOM. Build sem secrets; deploy via OIDC/scoped API token guardado em CI.

## Pipeline deploy
1. Validar branch/SHA e contracts/backward compat.
2. Apply migrations expand + backup.
3. Deploy staging workers/DO/Queues/R2/Static Assets.
4. Smoke/break-glass/IDOR/AI-off/mqtt-off/WS reconnect/hardware capability.
5. Canary produção via tráfego reduzido; medir SLO/budget.
6. Production promotion com aprovação manual e rollback versionado.
7. Android staged rollout, crash monitoring, migração local compatível.

## Regras
Nunca remover banco produtivo para corrigir schema. Secrets via API token limitado no pipeline. Independent release API/mobile compatibilidade versão anterior. MQTT broker/EasyPanel com compose/health, backup config, TLS, sem credenciais default.

## Rollback
Rollback API/DO sem corromper novos dados; migrations expand/contract. Suspender control room via kill switch se incidente. Revogar sessions e tokens se comprometidos. E2E smoke pós-rollback.

## Release v1.1 do Theme Engine
Aplicar D1 migration `0002_themes.sql`; provisionar bucket R2 **privado**, Worker de catálogo e CI de validação/assinatura; no staging rodar fluxo usando pacotes DEMO explicitamente não instaláveis e fakes, depois homologar pacote licenciado real em unidade de laboratório. Nunca disponibilizar demo manifest (`UNTRUSTED_DEMO_DO_NOT_INSTALL`) no catálogo público.
