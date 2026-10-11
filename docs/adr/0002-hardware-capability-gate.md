# ADR-0002 — Feature gating baseado em firmware/hardware
**Status:** Aceita
**Contexto:** Huami family expõe constantes raw sensor, porém Mi Band 3 real pode não suportar dados contínuos de acelerômetro.
**Decisão:** driver gera `capabilities` com prova; UI e APIs recusam funcionalidades não verificadas, sem mocks em produção. Módulo Gesture Engine completo e desacoplado aceita outros sensores / simulador laboratorial rotulado.
**Consequências:** produto completo em software, mas honestidade sobre limitações de dispositivo legado; requer testes de bancada antes de comercializar gestos Mi Band 3.
