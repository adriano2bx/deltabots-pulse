# ADR-0003 — Privacy-first e fail-safe por design
**Status:** Aceita
**Contexto:** dados de saúde sensíveis e controle de equipamentos exigem fortes garantias de autorização.
**Decisão:** consentimento granular e isolamento multi-tenant, logs minimizados, comando físico armado e TTL, watchdog local, política deny por padrão, IA nunca executa ação física sem policy/approval.
**Consequências:** mais fluxos de aprovação e complexidade de testes; risco de vazamento e ação não autorizada reduzido.
