# ADR 0007 — Implementação original do driver Mi Band 3 e origem do conhecimento de protocolo

## Status
Aceito — 2026-10-11. Requer validação jurídica antes de distribuição comercial (R06).

## Contexto
O Gadgetbridge é AGPLv3. `CLAUDE.md` regra 7 proíbe copiar código AGPL como se fosse MIT.

## Decisão
- O driver `device:miband3` é **implementação original**. Nenhuma classe/arquivo do Gadgetbridge é copiado
  ou vinculado.
- Fatos de interoperabilidade usados (constantes de protocolo, não expressão criativa) e sua evidência:
  | Fato | Evidência |
  |---|---|
  | Base UUID Huami `0000xxxx-0000-3512-2118-0009af100700` | GATT dump de Mi Band 3 real do proprietário (projeto `adriano2bx/miband3`, 2026-10-11) |
  | Autenticação `01 00 <chave16>`, `02 00`, `03 00 <AES-128-ECB(desafio)>`; respostas `10 xx 01` | Pareamento confirmado na Mi Band 3 do proprietário com flag `0x00` (flag `0x08` deixa a pulseira na tela de pareamento) |
  | Perfil do usuário `0x4F` na característica `0008`, pulso `0x20`, meta `0x10` | Pulseira saiu da tela de pareamento após envio, confirmado pelo proprietário |
  | FC manual `15 02 01` / contínua `15 01 01` + ping `16` em `2A39`, leitura em `2A37` | Medição confirmada pelo proprietário |
  | Bateria `0006`, passos `0007`, eventos `0010`, config `0003`, New Alert `2A46`, Alert Level `2A06` | Funcionamento confirmado no app de teste |
- Comportamentos não confirmados em hardware (stream bruto de acelerômetro, histórico de atividade/sono,
  OTA) são capabilities `UNVERIFIED` até ensaio (docs/21).

## Consequências
+ Código distribuível sob a licença do produto, com rastreabilidade de origem.
− Funcionalidades ainda não ensaiadas exigem experimento próprio antes de serem habilitadas.
