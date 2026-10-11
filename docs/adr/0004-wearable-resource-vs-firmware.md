# ADR 0004 — Atualização da interface por `.res` no app, nunca firmware automático

## Status
Aceito em especificação — 2026-10-11. Pendente homologação do driver/hardware.

## Contexto
Usuário quer aplicar diretamente via Pulse Android interfaces DeltaBots na Mi Band 3, sem outro app. Gadgets suportados por Gadgetbridge permitem instalação de recursos e fontes; firmware/modificação de menus completos tem risco e compatibilidade distintos.

## Decisão
1. **Tema cotidiano = `.res` compatível**, verificado e instalado localmente por BLE com autorização explícita; `.ft` somente onde exigido e homologado.
2. Catálogo/manifests assinados via Cloudflare; artefatos R2; Worker apenas verifica/autoriza e oferece download; Android realiza escrita BLE.
3. Firmware `.fw` não é parte do fluxo principal: modo laboratório restrito e separado, nunca atualização automática ou silenciosa.
4. Rollback é **reflash assistido do recurso original conhecido** e somente se BLE permite, não atomic rollback transacional garantido.
5. Temas customizados mudam recursos visuais existentes, não geram novas aplicações/menus arbitários; notificações BLE são o canal dinâmico.
6. Sem capacidade verificada/compatibilidade exata, UI permite prévia, mas bloqueia instalação e registra evidência pendente.

## Consequências
+ Reduz risco e centraliza experiência no Android; viabiliza catálogo de temas no Cloudflare.
- Requer engenharia reversa autorizada/driver original, homologação por firmware/variante, testes de integridade e revisão de licenças/direitos.
- Não garante personalização total ou recuperação física caso a pulseira deixe de comunicar.

## Referências
https://gadgetbridge.org/internals/specifics/mi-band-3/
https://gadgetbridge.org/internals/features/installer/
https://codeberg.org/Freeyourgadget/Gadgetbridge
