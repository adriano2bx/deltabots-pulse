# ADR 0008 — Versões de toolchain e fonte de verdade visual

## Status
Aceito — 2026-10-11.

## Decisões
1. **TypeScript 6.0.3** (último compilador em JS). O TypeScript 7 (porte nativo) ainda não é suportado
   por `typescript-eslint` (`<6.1.0`) — reavaliar quando houver suporte.
2. **Vitest 4.1.11**: `@cloudflare/vitest-pool-workers@0.23` exige `vitest ^4.1`.
3. **Node 22** (exigido por Wrangler 4.149), **pnpm 10.28**.
4. **Android**: AGP 8.7.3, Gradle 8.14.3, Kotlin 2.0.21, compileSdk/targetSdk 35 — combinação já validada em CI
   no protótipo `adriano2bx/miband3`; minSdk 29 conforme docs/04.
5. **Paleta**: os tokens do kit visual (`design/tokens/`, ciano `#00D5D8`, Obsidian `#0A0A0B`) prevalecem
   sobre a paleta preliminar de `docs/15-UX-SCREENS.md` (`#2FA7C8`), conforme `design/CLAUDE_VISUAL_HANDOFF.md`.
6. **Tela da Mi Band**: 80×128 retrato (o 128×80 do PRD é a mesma tela rotacionada).
7. **Marca**: o master oficial DeltaBots 8C-1 v4.1 não foi fornecido; os slots de marca ficam vazios e o
   build de *release* permanece bloqueado até a inserção (design/brand/approved/).
