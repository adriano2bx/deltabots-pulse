# 23 — Fontes oficiais e notas verificadas em 2026-10-11

- Cloudflare Durable Objects WebSocket Hibernation: https://developers.cloudflare.com/durable-objects/best-practices/websockets/ — suporta WSS e hibernação; batching para alta frequência; attachments para estado de cliente.
- Cloudflare example Hibernation: https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/
- Cloudflare Workers Protocols: https://developers.cloudflare.com/workers/reference/protocols/ — WebSocket ingress; TCP ingress ainda não nativo na documentação consultada; MQTT clássico exige broker.
- Cloudflare Queues delivery guarantees: https://developers.cloudflare.com/queues/reference/delivery-guarantees/ — pelo menos uma vez, dedupe necessário.
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/ — dimensionar por DB (10 GB pago na documentação examinada, dependendo do plano).
- Android BLE background: https://developer.android.com/develop/connectivity/bluetooth/ble/background — companion services/foreground connectedDevice/background restrictions.
- Android companion device pairing: https://developer.android.com/develop/connectivity/bluetooth/companion-device-pairing — associação e mudanças Android 16+.
- Android foreground service types: https://developer.android.com/develop/background-work/services/fgs/service-types — connectedDevice prerequisites.
- Gadgetbridge upstream: https://codeberg.org/Freeyourgadget/Gadgetbridge — referência de interoperabilidade.
- Gadgetbridge GitHub mirror (arquivado) https://github.com/Freeyourgadget/Gadgetbridge — licença AGPLv3, Huami family and characteristic constants.
- HuamiService BLE UUIDs: https://github.com/Freeyourgadget/Gadgetbridge/blob/master/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/devices/huami/HuamiService.java

**Limite factual:** as UUIDs raw_sensor pertencem à família Huami documentada; sua funcionalidade na Mi Band 3 depende de ensaio específico. Revalidar documentação oficial durante implementação e atualizar `docs/adr` para alterações de API e licenciamento.

## Fonte adicional Wearable UI Engine
- Guia específico Mi Band 3 firmware/resources, variantes Wuhan/Hankou/Chongqing, riscos e migrações: https://gadgetbridge.org/internals/specifics/mi-band-3/
- Fluxo documentado de instalação de `.fw`/`.res` e advertência de brick: https://gadgetbridge.org/internals/features/installer/
- Repositório atual Gadgetbridge e licença AGPLv3: https://codeberg.org/Freeyourgadget/Gadgetbridge
**Limite:** suporte genérico do Gadgetbridge a flash de recursos não valida uma implementação BLE original DeltaBots em todas as variantes. Confirmar na bancada antes de publicar tema.
