# 15 — Inventário de telas Android — UX e design system (76 telas)

## Sistema visual obrigatório
Identidade DeltaBots: preto/grafite (`#0B1016`, `#111923`, `#17212B`), branco (`#E9F1F5`), acento ciano contido (`#2FA7C8`), estados semanticamente consistentes; chapado e sem brilho/degradê excessivo. Fonte legível (Inter ou equivalente licenciada), grid 4/8dp, touch target ≥48dp, contraste WCAG AA, números tabulares em dashboards, sem efeitos que atrapalhem acessibilidade. UX técnica premium, porém para leigos; transparência sobre qualidade/tempo das métricas.

## Navegação
NavBar: **Início**, **Saúde**, **Gestos**, **Automações**, **Mais**. Deep links verificados, rotas protegidas por sessão e escopos.

## Inventário: 76 telas e fluxos completos
| ID | Tela/rota sugerida | Objetivo | Ações primárias / estados |
|---|---|---|---|
| A01 | `/splash` | marca e boot | health check local, offline |
| A02 | `/welcome` | explicar produto | continuar, idioma |
| A03 | `/onboarding/privacy` | privacidade por padrão | consentir/recusar |
| A04 | `/onboarding/gateway` | explicar função gateway | continuar |
| A05 | `/auth/login` | autenticar | senha/social, erro |
| A06 | `/auth/register` | criar conta | termos e verificação |
| A07 | `/auth/reset` | recuperar | e-mail seguro |
| A08 | `/auth/mfa` | desafio segundo fator | recovery fallback |
| A09 | `/permissions` | BLE/notifications/background | concessão contextual |
| A10 | `/devices/discover` | encontrar bandas | scanning/denied/timeout |
| A11 | `/devices/pair` | conectar e autenticar | chaves legítimas |
| A12 | `/devices/capabilities` | diagnóstico do firmware | supported/unverified |
| A13 | `/devices/sync-initial` | importação inicial | progresso/cancelar |
| A14 | `/devices/connected` | boas-vindas | status real |
| A15 | `/home` | resumo pessoal | cards, alerts, freshness |
| A16 | `/home/timeline` | linha do tempo | filtros e detalhes |
| A17 | `/health/heart` | batimentos | agora/histórico/qualidade |
| A18 | `/health/heart/details` | curvas e zonas informativas | período/export |
| A19 | `/health/activity` | passos e calorias estimadas | metas/atividade |
| A20 | `/health/activity/session` | sessão específica | GPS do celular se autorizado |
| A21 | `/health/sleep` | sono agregado | histórico e irregularidades |
| A22 | `/health/sleep/detail` | noite/intervalos | origem/limitações |
| A23 | `/health/trends` | comparação períodos | métricas e filtros |
| A24 | `/health/insights` | insights | explicação/feedback |
| A25 | `/health/goals` | metas | editar, acompanhar |
| A26 | `/gestures` | home do Gesture Engine | status e capability |
| A27 | `/gestures/live` | raw XYZ se habilitado | start/stop/diagnóstico |
| A28 | `/gestures/record` | gravação consentida | rotular/rejeitar/guardar |
| A29 | `/gestures/datasets` | sessões de gravação | listar/export/excluir |
| A30 | `/gestures/train` | treinamento | parâmetros/progresso |
| A31 | `/gestures/models` | modelos e versões | ativar/rollback |
| A32 | `/gestures/evaluate` | matriz e falsos positivos | benchmark |
| A33 | `/gestures/mappings` | mapeamentos gesto→ação | criar/editar |
| A34 | `/gestures/equipment` | selecionar equipamento | allowlist/capability |
| A35 | `/gestures/control` | sessão armada | arm/disarm/estado/RTT |
| A36 | `/gestures/latency` | diagnóstico WS/IoT | p50/p95/ack |
| A37 | `/automations` | lista automações | filtrar, ligar/desligar |
| A38 | `/automations/new` | wizard de regra | trigger→conditions→actions |
| A39 | `/automations/simulate` | simular | resultados rastreáveis |
| A40 | `/automations/history` | histórico de ações | eventos e erros |
| A41 | `/notifications` | inbox | lidas e prioridades |
| A42 | `/notifications/rules` | alertas personalizados | limites/contexto |
| A43 | `/assistant` | chat IA | prompts/contexto/tool approvals |
| A44 | `/assistant/insight` | evidência insight | origem e confiança |
| A45 | `/reports` | relatórios | diário/semanal/mensal |
| A46 | `/reports/detail` | detalhe | exportar/compartilhar |
| A47 | `/family` | painel compartilhamentos | grant list |
| A48 | `/family/invite` | convidar familiar | escopos/expiração |
| A49 | `/family/care` | visão cuidador | dados concedidos e freshness |
| A50 | `/safety/checkin` | check-in e ajuda | comunicar contatos |
| A51 | `/devices` | inventário pessoal | adicionar/remover |
| A52 | `/devices/detail` | estado bateria firmware | sync e configurações |
| A53 | `/devices/diagnostics` | logs BLE anonimizados | export debug |
| A54 | `/settings/profile` | perfil | editar |
| A55 | `/settings/privacy` | consentimentos/dados | revogar/export/excluir |
| A56 | `/settings/sync` | política offline/cloud | priorizar bateria |
| A57 | `/settings/notifications` | espelhamento, push | filtros |
| A58 | `/settings/appearance` | idioma/acessibilidade | modo escuro |
| A59 | `/settings/integrations` | MCP/IoT/APIs | gerenciar |
| A60 | `/settings/security` | sessões e MFA | revogar |
| A61 | `/billing` | planos e consumo | assinatura/cancelamento |
| A62 | `/support` | central de ajuda | documentos e contato |
| A63 | `/support/diagnostics` | diagnóstico e ticket | consent export |
| A64 | `/about` | legal e versão | licenças / privacidade |

## Contrato funcional de cada tela
Para cada A01–A76 o código deve ter `ScreenState` (`Loading`, `Data`, `Empty`, `Offline`, `Error`, `PermissionRequired`, `Unsupported`, `Stale`) e handlers que efetivamente chamam caso de uso/API. Logs e analytics anonimizados. Screenshots com comparação visual, Compose previews para estados e testes UI.

## Fluxos de erro críticos
Sem Bluetooth/permissão, chave de autenticação ausente, firmware incompatível, sensor raw não suportado, internet offline, token expirado, sem dados históricos, métrica inválida, convite revogado, IA off, MQTT off, arm expirado, equipamento safety-critical bloqueado. Nenhum estado deve mascarar desconexão como online.

## Design tokens
```json
{"surface":"#0B1016","surfaceRaised":"#111923","outline":"#263440","text":"#E9F1F5","textMuted":"#98AAB8","accent":"#2FA7C8","good":"#48BB92","warning":"#E9B45D","danger":"#E97979","spacing":[4,8,12,16,24,32],"radius":[8,12,16,24]}
```

## Novas telas A65–A76: Wearable UI Engine (obrigatórias)
| ID | Tela/rota sugerida | Objetivo | Ações primárias / estados |
|---|---|---|---|
| A65 | `/devices/{id}/appearance` | personalização wearable | tema atual, capability, prévia, abrir catálogo |
| A66 | `/devices/{id}/themes` | catálogo temas DeltaBots | listar, filtrar, favorito, indisponível |
| A67 | `/themes/{id}/preview` | prévia monocromática detalhada | antes/depois 128x80, slots, licença |
| A68 | `/devices/{id}/themes/check` | verificação compatibilidade | firmware, revisão, fonte, mismatch |
| A69 | `/devices/{id}/themes/download` | download autenticado e seguro | assinatura, hash, cache, retry |
| A70 | `/devices/{id}/themes/preflight` | checklist instalação | BLE, bateria, proteção, lock |
| A71 | `/devices/{id}/themes/confirm` | confirmação explícita presencial | consent e risco de brick |
| A72 | `/devices/{id}/themes/install` | atualização BLE | fases e progresso verídico, safe cancel |
| A73 | `/devices/{id}/themes/result` | verificação pós-instalação | verified/unverified/failure/reconnect |
| A74 | `/devices/{id}/themes/history` | histórico de temas | tentativas, hashes, logs redigidos |
| A75 | `/devices/{id}/themes/restore` | restauração de recurso confiável | validar stock, reflash se viável |
| A76 | `/devices/{id}/themes/recovery` | diagnóstico e assistência | instruções e bloqueio de retentativa insegura |

**Microcopy obrigatória:** "A instalação modifica recursos gráficos da pulseira e pode apresentar falhas. Confira o modelo e mantenha o Bluetooth ligado." / "Seu aparelho não está homologado para instalar este tema." / "Transferência finalizada; ainda não conseguimos confirmar a aparência na pulseira." / "Não foi possível concluir. Evite novas tentativas até verificar a conexão." / "Restaurar requer um arquivo original confiável e conexão BLE funcional.".
**Design visual:** prévias 128×80 renderizadas pixel-perfect monocromáticas; o Android mantém estilo DeltaBots dark, sem propor ciano como cor exibida na Mi Band 3.
**Acessibilidade:** barra de progresso com rótulos e porcentagem apenas quando conhecido, feedback por leitor de tela, CTA explícito, cancelamento condicionado à segurança e texto claro sobre risco.
