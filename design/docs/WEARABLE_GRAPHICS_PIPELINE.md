# Handoff visual → recursos Mi Band 3

- `png-1bit/*.png` tem modo PIL `1` e tamanho **80×128 portrait**, sem cores.
- Não assumir framebuffer livre nem novos menus. Usar como conceito a mapear somente em `.res` suportados pela variante e versão.
- O modelo XMSH05HM pode usar Wuhan ou Hankou; XMSH06HM (NFC) Chongqing. Firmware e versão precisam ser lidos do dispositivo físico.
- Projetos publicados mostram substituição de imagens de `.res`; edição requer manter contagem e índices para empacotadores que exijam.
- Criar variantes de theme export a partir da lista de slots validados; o instalador Android exige SHA, assinatura, compatibilidade e confirmação presencial.
- A interface móvel informa `TRANSFER_COMPLETE_UNVERIFIED` até post-check hardware.

Leituras de referência:
https://gadgetbridge.org/internals/specifics/mi-band-3/
https://gadgetbridge.org/internals/features/installer/
