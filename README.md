# DeltaBots Pulse

Plataforma de inteligência wearable: app **Android** (gateway BLE da Mi Band 3), **API e tempo real na
Cloudflare** (Workers, Durable Objects, D1, R2, Queues), **console web**, **automações**, **IA com
guardrails**, **ponte MQTT** e **demo ESP32** — com LGPD, auditoria e capabilities de hardware honestas.

> Estado atual: em construção por ondas. O progresso real, requisito a requisito (F001–F390), está em
> [`implementation-status.md`](implementation-status.md). Nada é marcado como pronto sem teste e evidência.

## Documentação
- Instruções de engenharia: [`CLAUDE.md`](CLAUDE.md)
- PRD e especificações: [`docs/`](docs/00-INDEX.md)
- Decisões de arquitetura: [`docs/adr/`](docs/adr)
- Identidade visual e telas de referência: [`design/`](design/README.md)

## Desenvolvimento
```bash
pnpm install
pnpm verify      # lint, typecheck, testes e validação da especificação
```
Requisitos: Node 22+, pnpm 10, Python 3 (validação da spec). O app Android é compilado no CI.

## Escopo
Todo o PRD v1.1, **exceto** a personalização visual da pulseira (temas `.res`, F351–F390), retirada por
decisão do proprietário — ver [ADR-0005](docs/adr/0005-owner-descope-wearable-ui.md).

## Avisos
O Pulse não é dispositivo médico e não faz diagnóstico. Leituras exibem origem, qualidade e horário;
funcionalidades que dependem do firmware só são habilitadas após prova em hardware real.
