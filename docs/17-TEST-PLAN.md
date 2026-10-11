# 17 — Estratégia de QA, validação e performance

## Matriz de níveis
1. **Unit:** validação de schema/DSL, parsing BLE com fixtures, timestamp, timezone, dedupe, policies, model gating, budgets, active state.
2. **Contract:** OpenAPI schema, SDK client, WS message schema, mqtt topic/payload, version compatibility.
3. **Integration:** Worker↔D1, Worker↔DO, DO↔WSS clients, Queue idempotent consumer, bridge MQTT broker TLS, Android Room/outbox.
4. **E2E:** Android fake BLE→HTTP→D1→Web live, app pair real→dados, console→regra→push, gesto→WSS→ESP32 LED→ACK.
5. **Fault injection:** WiFi/celular off, BLE fora, process kill, token expiration, WS reconnect, queue duplicate/out-of-order, stale control frames, broker crash, D1 lock/rate limit, high clock skew.
6. **Security:** pentest IDOR, tenant crossing, unauthorized family viewer, endpoint enumeration, WSS replay, OAuth redirect, webhook SSRF, prompt injection, log leakage and device hijack.
7. **Accessibility:** TalkBack, 200% font, keyboard, contrast, screen readers; pt-BR formatting.
8. **Performance:** realistic throughput soak, WSS p50/p95/p99, end-to-end gesture latency with scope/clock methodology, mem, cost, BLE drop, battery.
9. **Compliance:** export, delete, consent revoke, purpose isolation, retention, secure data erasure and backups expiring.
10. **Hardware:** model/firmware combos; gating of raw stream; no claim without captured measurements.

## Critical acceptance test cases
| ID | Dado/quando | Resultado esperado |
|---|---|---|
| T001 | Login conta A; GET B device | 403/404 tenant-safe, no data |
| T002 | Token WSS revogado mid-session | fecha WS, desarma local |
| T003 | Envia mesmo `reading_id` 3x | 1 leitura e ACK duplicates |
| T004 | Android offline por 2h | fila local sem perda + sync posterior |
| T005 | Gesto sem raw verified | UI unsupported, `CAPABILITY_UNVERIFIED` |
| T006 | Controle sem arm | `CONTROL_DISARMED` sem ação |
| T007 | Reenvia comando com ID igual | actuator no máximo 1 atuação |
| T008 | Comando expirado após reconexão | nenhum replay físico |
| T009 | Broker MQTT cai durante controle | watchdog local desativa saída |
| T010 | Family grant revogado com browser aberto | stream fecha e cache não reexibe |
| T011 | AI propõe comando não autorizado | policy rejeita sem side effect |
| T012 | Delete account | export/revocation/purge workflow audit |
| T013 | DST mudança + horários agendados | regras executam na janela pretendida |
| T014 | Queue entrega evento duplicado | execução lógica idempotente |
| T015 | App com permissão negada | UX específica sem crash |
| T016 | BLE simulação com frames malformados | parse protegido, sem ANR |
| T017 | Equipamento `safety_critical` | rejeição invariável e auditada |
| T018 | Runbook rollback com schema migrado | restore e compat demonstrados |
| T019 | WSS DO hiberna e retoma | auth/attachment/state restaurados |
| T020 | Dados stale no dashboard | timestamp e aviso visíveis |

## Métricas e gates
Gate obrigatório `npm/pnpm test`, `gradle test`, `connectedAndroidTest` onde houver device, lint, typecheck, SAST, secret scan, dependency/license scan, contract checks, E2E, carga, compliance e hardware evidence. Marcar `BLOCKED_HARDWARE` apenas para testes que exigem dispositivo físico, não passar CI como se validado. Coverage em lógica crítica ≥90% branch e geral ≥80% lines como meta; satisfazer risco acima da porcentagem.

## Observabilidade de teste
Cada caso registra branch SHA, platform, firmware, tenant synthetic, fixture hash, seed, duration, pass/fail e evidência sem PII. Medições de latência reais devem distinguir `BLE→Android`, `Android→Edge`, `Edge→Gateway`, `Gateway→Actuator`; não calcular falso one-way com clocks desalinhados.

## Casos de teste críticos de atualização de interface (v1.1)
- T021: Mi Band variante Wuhan com tema Hankou → `COMPATIBILITY_MISMATCH`; zero bytes BLE enviados.
- T022: manifesto Ed25519 inválido ou SHA-256 divergente → rejeitar antes de preflight.
- T023: tema revogado pós-download → impedir iniciar flash.
- T024: bateria abaixo do piso/pulso sem leitura → impedir flash e informar motivo.
- T025: controle gestual armado → desarmar e exigir confirmação antes de OTA.
- T026: cancelamento em fase insegura → não permitir abortar GATT sem recurso homologado.
- T027: desconexão 50% e process kill → journal íntegro, estado interrompido, sem resume presumido.
- T028: bytes transferidos 100%, postcheck não confirma → `TRANSFER_COMPLETE_UNVERIFIED`, nunca `VERIFIED_INSTALLED`.
- T029: `REVOKED` ou `QUARANTINED` no catálogo → não emitir download ticket.
- T030: tenant/role sem permissão de release → negar; publicar requer dois aprovadores distintos.
- T031: reflash de original autorizado em banda conectável → só `PASS` com evidência física; caso sem conectividade, recuperação assistida.
- T032: instalação em aparelho homologado e inspeção visual antes/depois, sincronização HR/passos/sono, notificações, reconnect + 24h → relatório HW16–HW24.
- T033: importação `.res` manual com path traversal, zip bomb ou MIME falsificado → parser isolado e rejeição.
- T034: WebSocket Console perde conexão durante OTA → transferência BLE local prossegue com estado íntegro; backend recebe status quando voltar.
Cobrir A65–A76 com screenshot/golden test, TalkBack, idioma pt-BR, erros e baixa bateria; inclua falsos positivos/negativos de compatibility matcher e testes de assinatura entre TS e Kotlin.
