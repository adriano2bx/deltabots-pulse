# 20 — Definition of Done global e aceite final

## Checklist para liberação
- [ ] F001–F390 rastreados a implementação, código, testes e status real `PASS`, `CAPABILITY_UNSUPPORTED_PROVEN` ou `BLOCKED_EXTERNAL` com justificativa; nenhum 'done' sem evidência.
- [ ] APK/AAB instalável, assinatura/distribuição documentadas; telas A01–A76 completas, sem botões decorativos.
- [ ] Pareamento Mi Band 3 em firmware físico selecionado, HR/passos/sono/bateria conforme support comprovado, reconexão/erro/offline.
- [ ] Raw accel/gestures: suporte **comprovado** ou bloqueio honesto com driver alternativo de laboratório; proibir claims falsos.
- [ ] Android gateway seguro, Room outbox, WorkManager/Companion/FGS, retentativas e power tests.
- [ ] API REST versionada com OpenAPI e SDK funcional; CI contract green.
- [ ] Cloudflare Workers/DO/Queues/D1/R2/KV/obs deployables com IaC e ambientes.
- [ ] Auth, RBAC/ABAC, LGPD, audit, consent, export/delete/revocation, tests cross-tenant.
- [ ] WebSocket Hibernation com sessão, ACK, anti-replay, RTT, reconnect, policy change.
- [ ] Bridge MQTT segura (broker via EasyPanel) + gateway WSS direto + demo ESP32 bancada, watchdog local.
- [ ] Regras determinísticas com editor, simulator, execução, dedupe, logs, DLQ.
- [ ] AI com consent, limites e ferramentas MCP policy-governed; adaptador JEV real se endpoint/contrato fornecido, senão bloqueio transparente.
- [ ] Family invites, grants, revocation instant, notificações, checkins.
- [ ] Console completo, developer portal, admin, billing, suporte, acessibilidade, i18n.
- [ ] Testes segurança, carga, chaos, A11y, firmware e latência com método reproduzível.
- [ ] Zero secrets/checkpoints em repos públicos, dependências licenciadas e análise jurídica AGPL.
- [ ] Política LGPD/termos, resposta incidente, backup/restore, runbook e dashboards prontos.
- [ ] Documentação atualizada, releases canary/staged, versioning/rollback testados.
- [ ] Deployment real **apenas com autorização e credenciais do proprietário**; staging exercitado.

## Estados possíveis do requisito
`NOT_STARTED`, `IN_PROGRESS`, `IN_REVIEW`, `PASS`, `FAILED`, `BLOCKED_HARDWARE`, `BLOCKED_EXTERNAL`, `CAPABILITY_UNSUPPORTED_PROVEN`, `NOT_APPLICABLE_FOR_DEVICE` (somente capability de hardware). Status `PASS` requer evidência reproduzível. `CAPABILITY_UNSUPPORTED_PROVEN` não significa entrega daquela capacidade naquele hardware; o módulo deve funcionar com simulador/driver alternativo e UI mostrar indisponibilidade.

## No-go comerciais
Perda de privacidade/tenancy; rota física sem watchdog; falsa detecção de emergências médicas; afirmação falsa de gesture support; BLE forcing firmware; comando em replay; testes críticos vermelhos; feature placeholder disfarçada; licença AGPL ignorada; ausência de backup; sem permissão de deploy.

## Checklist adicional — Wearable UI Engine v1.1
- [ ] F351–F390 rastreados; telas A65–A76 completas, com loading, offline, incompatibilidade, erro e recuperação.
- [ ] Catálogo, visualizador monocromático, editor Theme Studio, build determinístico quando formato comprovado, assinatura, R2 privado, workflows de aprovação dupla e revogação.
- [ ] App Android instala `.res` **diretamente** em pelo menos uma combinação Mi Band 3 + firmware homologada, sem terceirizar ao Gadgetbridge; evidência de HW16–HW24.
- [ ] Compatibilidade estrita wuhan/hankou/chongqing e firmware; nenhum pacote incorreto/desconhecido inicia transferência.
- [ ] Bateria/preflight, autorização local explícita, arm desativado, GATT lock, journal, progresso honesto, postcheck e status inconclusivo quando cabível.
- [ ] Procedimento de recuperação não promete rollback garantido; reflash de original apenas com BLE funcionando e artefato confiável.
- [ ] Nenhum `.fw` silencioso, nenhuma atualização por IA/Cloudflare sem aprovação no telefone, nenhuma licença de `.res`/Gadgetbridge ignorada.
- [ ] Novos contratos `theme-*` e migração SQL 0002 passam validações automáticas e segurança cross-tenant.
