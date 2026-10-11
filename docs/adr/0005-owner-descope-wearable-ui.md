# ADR 0005 — Wearable UI Engine fora de escopo por decisão do proprietário

## Status
Aceito — 2026-10-11, decisão explícita do proprietário do produto.

## Contexto
A spec v1.1 inclui o módulo **Pulse Wearable UI Engine** (docs 34–36, ADR 0004): temas `.res` para a
Mi Band 3, F351–F390, telas Android A65–A76 e Theme Studio no console. O proprietário instruiu:
"pode fazer tudo, menos as customizações visuais da pulseira".

## Decisão
1. F351–F390 recebem o estado `DESCOPED_BY_OWNER` em `docs/feature-register.csv`, com referência a este ADR.
2. Não serão implementados: telas A65–A76, `feature:wearable-ui/`, `device:resource-updater/`, rotas `/themes*`,
   `/devices/{id}/theme-installations*`, `/admin/themes*` e o Theme Studio do console.
3. A migração `0002_themes.sql` e os schemas `theme-*` ficam em `infra/descoped/` e
   `packages/contracts/schemas/descoped/` apenas como referência; não são aplicados.
4. Nenhuma escrita de recursos/firmware na pulseira é feita pelo app (reduz risco de brick).
5. `DESCOPED_BY_OWNER` é um estado adicional ao conjunto de `docs/20-ACCEPTANCE.md`; não equivale a `PASS`
   e deve ser revisitado caso o proprietário reinclua o módulo.

## Consequências
+ Elimina o risco crítico de inutilização da pulseira por `.res` incompatível.
− A checklist adicional v1.1 de `docs/20-ACCEPTANCE.md` não é atendida nesta entrega e fica registrada como fora de escopo.
