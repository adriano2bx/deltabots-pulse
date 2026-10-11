# Firmware de bancada (ESP32) — DeltaBots Pulse

Demonstração de atuação **segura**: um LED (ou relé de **baixa tensão**, nunca rede AC). Ver `docs/08-IOT-MQTT.md`.

| Regra | Implementação |
|---|---|
| Inicia desarmado, saída neutra | `ps_init`, GPIO em 0 no boot |
| Armação só **local** | botão físico (`CONFIG_PULSE_ARM_BUTTON_GPIO`); a rede nunca arma |
| E-stop independente da rede | interruptor NF (`CONFIG_PULSE_ESTOP_GPIO`) |
| Watchdog | sem comando válido por `PULSE_WATCHDOG_MS` → saída neutra |
| Perda de Wi-Fi/broker | desarma e neutraliza imediatamente |
| Comando expirado / duplicado | rejeitado (`COMMAND_EXPIRED` / `DUPLICATE`); sem SNTP o comando é rejeitado |
| Allowlist | apenas `set_led` |
| Mensagem retida | ignorada |

## Estado de validação
- `core/safety.c`: **testado no host** (`make -C apps/esp32-demo test`, com ASan/UBSan).
- `main/main.c`: **NÃO compilado nem testado em hardware** nesta entrega → `HARDWARE_BLOCKED` (HW11, HW15).
  Compile com ESP-IDF (`idf.py set-target esp32 && idf.py menuconfig && idf.py build`) e execute os ensaios HW11/HW15 antes de qualquer alegação.

## Segurança
- Use **mqtts://** com CA própria e credenciais por equipamento; ACL do broker limita o equipamento ao próprio tópico.
- Nunca ligue cargas perigosas. Equipamentos `safety_critical` não são controláveis (docs/08).
