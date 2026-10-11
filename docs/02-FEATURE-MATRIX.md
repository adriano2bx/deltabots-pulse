# 02 — Matriz integral de requisitos (F001–F390)

**Todas as 390 funcionalidades fazem parte do escopo de software final.** `HARDWARE_GATED` e `EXTERNAL_DEPENDENCY` exigem evidência externa específica para declarar disponibilidade real. A matriz CSV é a fonte primária editável, importável como backlog.

Status inicial de todos os itens: `NOT_STARTED`. Implementação e evidência devem ser preenchidas pelo Claude Code; nunca marcar concluído automaticamente.

| ID | Área | Requisito | Condição | Teste |
|---|---|---|---|---|
| F001 | Android: BLE e pareamento | Buscar pulseiras BLE próximas | REQUIRED | TEST-A-001 |
| F002 | Android: BLE e pareamento | Parear sem aplicativo Xiaomi quando autorizado | REQUIRED | TEST-A-002 |
| F003 | Android: BLE e pareamento | Autenticar com chave legítima | REQUIRED | TEST-A-003 |
| F004 | Android: BLE e pareamento | Reconexão BLE automática | REQUIRED | TEST-A-004 |
| F005 | Android: BLE e pareamento | Exibir estado da conexão | REQUIRED | TEST-A-005 |
| F006 | Android: BLE e pareamento | Exibir bateria da pulseira | REQUIRED | TEST-A-006 |
| F007 | Android: BLE e pareamento | Identificar modelo e firmware | REQUIRED | TEST-A-007 |
| F008 | Android: BLE e pareamento | Sincronização manual | REQUIRED | TEST-A-008 |
| F009 | Android: BLE e pareamento | Sincronização periódica | REQUIRED | TEST-A-009 |
| F010 | Android: BLE e pareamento | Ajustar parâmetros BLE suportados | REQUIRED | TEST-A-010 |
| F011 | Android: BLE e pareamento | Localizar pulseira por vibração se suportado | HARDWARE_GATED | TEST-A-011 |
| F012 | Android: BLE e pareamento | Diagnóstico RSSI/GATT | REQUIRED | TEST-A-012 |
| F013 | Android: BLE e pareamento | Histórico de desconexões | REQUIRED | TEST-A-013 |
| F014 | Android: BLE e pareamento | Gerenciar dispositivos cadastrados | REQUIRED | TEST-A-014 |
| F015 | Android: BLE e pareamento | Firmware OTA assinado se compatível e autorizado | HARDWARE_GATED | TEST-A-015 |
| F016 | Android: biometria | Frequência cardíaca atual | REQUIRED | TEST-A-016 |
| F017 | Android: biometria | Histórico de frequência cardíaca | REQUIRED | TEST-A-017 |
| F018 | Android: biometria | Curva por horário | REQUIRED | TEST-A-018 |
| F019 | Android: biometria | Média de frequência cardíaca | REQUIRED | TEST-A-019 |
| F020 | Android: biometria | Mínimo e máximo de FC | REQUIRED | TEST-A-020 |
| F021 | Android: biometria | Comparação entre períodos | REQUIRED | TEST-A-021 |
| F022 | Android: biometria | Tendências de frequência cardíaca | REQUIRED | TEST-A-022 |
| F023 | Android: biometria | Leituras inválidas/qualidade | REQUIRED | TEST-A-023 |
| F024 | Android: biometria | Solicitar medição de FC | REQUIRED | TEST-A-024 |
| F025 | Android: biometria | Intervalos de monitoramento suportados | HARDWARE_GATED | TEST-A-025 |
| F026 | Android: biometria | Alertas de limites configurados | REQUIRED | TEST-A-026 |
| F027 | Android: biometria | Contexto FC com atividade | REQUIRED | TEST-A-027 |
| F028 | Android: biometria | Exportar histórico biométrico | REQUIRED | TEST-A-028 |
| F029 | Android: atividade | Passos diários | REQUIRED | TEST-A-029 |
| F030 | Android: atividade | Histórico de passos | REQUIRED | TEST-A-030 |
| F031 | Android: atividade | Metas de passos | REQUIRED | TEST-A-031 |
| F032 | Android: atividade | Distância estimada | REQUIRED | TEST-A-032 |
| F033 | Android: atividade | Calorias estimadas | REQUIRED | TEST-A-033 |
| F034 | Android: atividade | Períodos de atividade | REQUIRED | TEST-A-034 |
| F035 | Android: atividade | Períodos de inatividade | REQUIRED | TEST-A-035 |
| F036 | Android: atividade | Gráficos atividade horário | REQUIRED | TEST-A-036 |
| F037 | Android: atividade | Comparação dias ativos | REQUIRED | TEST-A-037 |
| F038 | Android: atividade | Registro de exercícios | REQUIRED | TEST-A-038 |
| F039 | Android: atividade | Exercício GPS do celular | REQUIRED | TEST-A-039 |
| F040 | Android: atividade | Rotas pelo celular com opt-in | REQUIRED | TEST-A-040 |
| F041 | Android: atividade | Desafios de movimento | REQUIRED | TEST-A-041 |
| F042 | Android: atividade | Padrões de movimento experimentais | REQUIRED | TEST-A-042 |
| F043 | Android: atividade | Gestos experimentais | HARDWARE_GATED | TEST-A-043 |
| F044 | Android: sono | Sincronizar sono | REQUIRED | TEST-A-044 |
| F045 | Android: sono | Duração total de sono | REQUIRED | TEST-A-045 |
| F046 | Android: sono | Início e fim estimados do sono | REQUIRED | TEST-A-046 |
| F047 | Android: sono | Histórico gráfico de sono | REQUIRED | TEST-A-047 |
| F048 | Android: sono | Média de sono | REQUIRED | TEST-A-048 |
| F049 | Android: sono | Regularidade de horários | REQUIRED | TEST-A-049 |
| F050 | Android: sono | Metas de descanso | REQUIRED | TEST-A-050 |
| F051 | Android: sono | Noites atípicas | REQUIRED | TEST-A-051 |
| F052 | Android: sono | Resumo semanal | REQUIRED | TEST-A-052 |
| F053 | Android: sono | Correlação sono-atividade | REQUIRED | TEST-A-053 |
| F054 | Android: sono | Tendência de recuperação não clínica | REQUIRED | TEST-A-054 |
| F055 | Android: sono | Sugestões de rotina | REQUIRED | TEST-A-055 |
| F056 | Android: sono | Classificação individual de padrões | REQUIRED | TEST-A-056 |
| F057 | Android: notificações | Encaminhar notificações Android | REQUIRED | TEST-A-057 |
| F058 | Android: notificações | Notificar chamadas | REQUIRED | TEST-A-058 |
| F059 | Android: notificações | Filtros por aplicativos | REQUIRED | TEST-A-059 |
| F060 | Android: notificações | Notificações IA | REQUIRED | TEST-A-060 |
| F061 | Android: notificações | Vibração por evento remoto se suportado | HARDWARE_GATED | TEST-A-061 |
| F062 | Android: notificações | Padrões de vibração se suportados | HARDWARE_GATED | TEST-A-062 |
| F063 | Android: notificações | Alertas de calendário | REQUIRED | TEST-A-063 |
| F064 | Android: notificações | Lembretes | REQUIRED | TEST-A-064 |
| F065 | Android: notificações | Alertas infraestrutura DeltaBots | REQUIRED | TEST-A-065 |
| F066 | Android: notificações | Ações botão pulseira se suportadas | HARDWARE_GATED | TEST-A-066 |
| F067 | Android: notificações | Horários sem notificações | REQUIRED | TEST-A-067 |
| F068 | Android: notificações | Ações por eventos suportados | HARDWARE_GATED | TEST-A-068 |
| F069 | Android: inteligência | Chat IA pessoal | REQUIRED | TEST-A-069 |
| F070 | Android: inteligência | Conversação por voz via celular | REQUIRED | TEST-A-070 |
| F071 | Android: inteligência | Perguntas sobre histórico pessoal | REQUIRED | TEST-A-071 |
| F072 | Android: inteligência | Resumo diário por IA | REQUIRED | TEST-A-072 |
| F073 | Android: inteligência | Resumo semanal por IA | REQUIRED | TEST-A-073 |
| F074 | Android: inteligência | Sugestões hábitos não clínicos | REQUIRED | TEST-A-074 |
| F075 | Android: inteligência | Explicar mudanças de padrões | REQUIRED | TEST-A-075 |
| F076 | Android: inteligência | Correlação entre indicadores | REQUIRED | TEST-A-076 |
| F077 | Android: inteligência | Linha do tempo inteligente | REQUIRED | TEST-A-077 |
| F078 | Android: inteligência | Memória autorizada | REQUIRED | TEST-A-078 |
| F079 | Android: inteligência | Perguntas em linguagem natural | REQUIRED | TEST-A-079 |
| F080 | Android: inteligência | Rascunhar regras por linguagem natural | REQUIRED | TEST-A-080 |
| F081 | Android: inteligência | Ferramentas de agente autorizadas | REQUIRED | TEST-A-081 |
| F082 | Android: inteligência | Relatórios personalizados | REQUIRED | TEST-A-082 |
| F083 | Android: inteligência | Insights preditivos experimentais | REQUIRED | TEST-A-083 |
| F084 | Android: inteligência | Análise local sensível | REQUIRED | TEST-A-084 |
| F085 | Android: inteligência | Privacidade IA | REQUIRED | TEST-A-085 |
| F086 | Android: acompanhamento | Contatos de confiança | REQUIRED | TEST-A-086 |
| F087 | Android: acompanhamento | Compartilhamento autorizado | REQUIRED | TEST-A-087 |
| F088 | Android: acompanhamento | Painel familiar | REQUIRED | TEST-A-088 |
| F089 | Android: acompanhamento | Alerta inatividade prolongada | REQUIRED | TEST-A-089 |
| F090 | Android: acompanhamento | Alerta desconexão | REQUIRED | TEST-A-090 |
| F091 | Android: acompanhamento | Alerta sync atrasada | REQUIRED | TEST-A-091 |
| F092 | Android: acompanhamento | Solicitação ajuda Android | REQUIRED | TEST-A-092 |
| F093 | Android: acompanhamento | Ajuda via pulseira se suportada | HARDWARE_GATED | TEST-A-093 |
| F094 | Android: acompanhamento | Confirmação de segurança | REQUIRED | TEST-A-094 |
| F095 | Android: acompanhamento | Check-in bem-estar | REQUIRED | TEST-A-095 |
| F096 | Android: acompanhamento | Localização do telefone opt-in | REQUIRED | TEST-A-096 |
| F097 | Android: acompanhamento | Histórico pedidos de ajuda | REQUIRED | TEST-A-097 |
| F098 | Android: acompanhamento | Escalonar notificações | REQUIRED | TEST-A-098 |
| F099 | Android: acompanhamento | Ausência de atividade esperada | REQUIRED | TEST-A-099 |
| F100 | Android: acompanhamento | Registro de incidentes | REQUIRED | TEST-A-100 |
| F101 | Android: conta e experiência | Conta e login | REQUIRED | TEST-A-101 |
| F102 | Android: conta e experiência | Biometria local de acesso | REQUIRED | TEST-A-102 |
| F103 | Android: conta e experiência | Perfis individuais | REQUIRED | TEST-A-103 |
| F104 | Android: conta e experiência | Metas pessoais | REQUIRED | TEST-A-104 |
| F105 | Android: conta e experiência | Dashboard personalizável | REQUIRED | TEST-A-105 |
| F106 | Android: conta e experiência | Widgets tela inicial | REQUIRED | TEST-A-106 |
| F107 | Android: conta e experiência | Tema escuro | REQUIRED | TEST-A-107 |
| F108 | Android: conta e experiência | Unidades e idiomas | REQUIRED | TEST-A-108 |
| F109 | Android: conta e experiência | Notificações personalizadas | REQUIRED | TEST-A-109 |
| F110 | Android: conta e experiência | Offline-first | REQUIRED | TEST-A-110 |
| F111 | Android: conta e experiência | Sync após reconexão | REQUIRED | TEST-A-111 |
| F112 | Android: conta e experiência | Backup configurações | REQUIRED | TEST-A-112 |
| F113 | Android: conta e experiência | Exportar dados | REQUIRED | TEST-A-113 |
| F114 | Android: conta e experiência | Excluir dados | REQUIRED | TEST-A-114 |
| F115 | Android: conta e experiência | Controle de consentimentos | REQUIRED | TEST-A-115 |
| F116 | Android: conta e experiência | Gerir sessões de login | REQUIRED | TEST-A-116 |
| F117 | Android: conta e experiência | Ajuda diagnóstico | REQUIRED | TEST-A-117 |
| F118 | Android: conta e experiência | Notas de versão | REQUIRED | TEST-A-118 |
| F119 | Android: conta e experiência | Acessibilidade e fontes grandes | REQUIRED | TEST-A-119 |
| F120 | Android: conta e experiência | Modo economia bateria | REQUIRED | TEST-A-120 |
| F121 | Cloud: identidade | Registro de usuários | REQUIRED | TEST-B-121 |
| F122 | Cloud: identidade | Login seguro | REQUIRED | TEST-B-122 |
| F123 | Cloud: identidade | Login social | REQUIRED | TEST-B-123 |
| F124 | Cloud: identidade | MFA | REQUIRED | TEST-B-124 |
| F125 | Cloud: identidade | Recuperação de conta | REQUIRED | TEST-B-125 |
| F126 | Cloud: identidade | Gerenciamento sessões | REQUIRED | TEST-B-126 |
| F127 | Cloud: identidade | Tokens rotativos | REQUIRED | TEST-B-127 |
| F128 | Cloud: identidade | Revogação sessões | REQUIRED | TEST-B-128 |
| F129 | Cloud: identidade | Dispositivos confiáveis | REQUIRED | TEST-B-129 |
| F130 | Cloud: identidade | Autenticar gateways Android | REQUIRED | TEST-B-130 |
| F131 | Cloud: identidade | Organizações | REQUIRED | TEST-B-131 |
| F132 | Cloud: identidade | RBAC | REQUIRED | TEST-B-132 |
| F133 | Cloud: identidade | Compartilhamento granular | REQUIRED | TEST-B-133 |
| F134 | Cloud: identidade | Papéis familiar/admin | REQUIRED | TEST-B-134 |
| F135 | Cloud: identidade | Auditoria acessos | REQUIRED | TEST-B-135 |
| F136 | Cloud: identidade | Consentimentos versionados | REQUIRED | TEST-B-136 |
| F137 | Cloud: identidade | Portabilidade dados | REQUIRED | TEST-B-137 |
| F138 | Cloud: identidade | Exclusão conta/dados | REQUIRED | TEST-B-138 |
| F139 | Cloud: gestão dispositivos | Registrar dispositivos | REQUIRED | TEST-B-139 |
| F140 | Cloud: gestão dispositivos | Vincular a titular | REQUIRED | TEST-B-140 |
| F141 | Cloud: gestão dispositivos | Desvincular | REQUIRED | TEST-B-141 |
| F142 | Cloud: gestão dispositivos | Inventariar modelo firmware | REQUIRED | TEST-B-142 |
| F143 | Cloud: gestão dispositivos | Inventariar capabilities | REQUIRED | TEST-B-143 |
| F144 | Cloud: gestão dispositivos | Versão gateway Android | REQUIRED | TEST-B-144 |
| F145 | Cloud: gestão dispositivos | Heartbeats | REQUIRED | TEST-B-145 |
| F146 | Cloud: gestão dispositivos | Status online/offline reportado | REQUIRED | TEST-B-146 |
| F147 | Cloud: gestão dispositivos | Histórico conexões | REQUIRED | TEST-B-147 |
| F148 | Cloud: gestão dispositivos | Última sync | REQUIRED | TEST-B-148 |
| F149 | Cloud: gestão dispositivos | Bateria reportada | REQUIRED | TEST-B-149 |
| F150 | Cloud: gestão dispositivos | RSSI reportado | REQUIRED | TEST-B-150 |
| F151 | Cloud: gestão dispositivos | Config remota permitida | REQUIRED | TEST-B-151 |
| F152 | Cloud: gestão dispositivos | Solicitar sync remota | REQUIRED | TEST-B-152 |
| F153 | Cloud: gestão dispositivos | Enfileirar comandos | REQUIRED | TEST-B-153 |
| F154 | Cloud: gestão dispositivos | ACK comandos | REQUIRED | TEST-B-154 |
| F155 | Cloud: gestão dispositivos | TTL comandos | REQUIRED | TEST-B-155 |
| F156 | Cloud: gestão dispositivos | Inventário geral | REQUIRED | TEST-B-156 |
| F157 | Cloud: gestão dispositivos | Grupos de devices | REQUIRED | TEST-B-157 |
| F158 | Cloud: gestão dispositivos | Revogar gateway | REQUIRED | TEST-B-158 |
| F159 | Cloud: gestão dispositivos | Drivers versionados | REQUIRED | TEST-B-159 |
| F160 | Cloud: gestão dispositivos | API capabilities firmware | REQUIRED | TEST-B-160 |
| F161 | Cloud: ingestão | Receber FC em lotes | REQUIRED | TEST-B-161 |
| F162 | Cloud: ingestão | Receber passos | REQUIRED | TEST-B-162 |
| F163 | Cloud: ingestão | Receber atividade | REQUIRED | TEST-B-163 |
| F164 | Cloud: ingestão | Receber sono | REQUIRED | TEST-B-164 |
| F165 | Cloud: ingestão | Receber bateria | REQUIRED | TEST-B-165 |
| F166 | Cloud: ingestão | Receber conexão | REQUIRED | TEST-B-166 |
| F167 | Cloud: ingestão | Receber eventos pulseira | REQUIRED | TEST-B-167 |
| F168 | Cloud: ingestão | Receber diagnósticos gateway | REQUIRED | TEST-B-168 |
| F169 | Cloud: ingestão | Validar integridade | REQUIRED | TEST-B-169 |
| F170 | Cloud: ingestão | Normalizar unidades | REQUIRED | TEST-B-170 |
| F171 | Cloud: ingestão | Normalizar timestamps | REQUIRED | TEST-B-171 |
| F172 | Cloud: ingestão | Deduplicar leituras | REQUIRED | TEST-B-172 |
| F173 | Cloud: ingestão | Tratar leitura fora de ordem | REQUIRED | TEST-B-173 |
| F174 | Cloud: ingestão | Detectar lacunas | REQUIRED | TEST-B-174 |
| F175 | Cloud: ingestão | Sync incremental | REQUIRED | TEST-B-175 |
| F176 | Cloud: ingestão | Conciliar offline | REQUIRED | TEST-B-176 |
| F177 | Cloud: ingestão | Versionar schemas | REQUIRED | TEST-B-177 |
| F178 | Cloud: ingestão | Ingestão idempotente | REQUIRED | TEST-B-178 |
| F179 | Cloud: ingestão | Rate limiting | REQUIRED | TEST-B-179 |
| F180 | Cloud: ingestão | Filas telemetria | REQUIRED | TEST-B-180 |
| F181 | Cloud: ingestão | Agregação por tempo | REQUIRED | TEST-B-181 |
| F182 | Cloud: ingestão | Retenção configurável | REQUIRED | TEST-B-182 |
| F183 | Cloud: ingestão | Arquivamento R2 | REQUIRED | TEST-B-183 |
| F184 | Cloud: ingestão | Consultar amostras consentidas | REQUIRED | TEST-B-184 |
| F185 | Cloud: ingestão | Consultar agregados | REQUIRED | TEST-B-185 |
| F186 | Cloud: ingestão | Export JSON CSV | REQUIRED | TEST-B-186 |
| F187 | Cloud: ingestão | Streaming live | REQUIRED | TEST-B-187 |
| F188 | Cloud: ingestão | Data quality por leitura | REQUIRED | TEST-B-188 |
| F189 | Cloud: automações | Criar regra | REQUIRED | TEST-B-189 |
| F190 | Cloud: automações | Editar pausar excluir regras | REQUIRED | TEST-B-190 |
| F191 | Cloud: automações | Gatilhos FC | REQUIRED | TEST-B-191 |
| F192 | Cloud: automações | Gatilhos passos | REQUIRED | TEST-B-192 |
| F193 | Cloud: automações | Gatilhos inatividade | REQUIRED | TEST-B-193 |
| F194 | Cloud: automações | Gatilhos sono | REQUIRED | TEST-B-194 |
| F195 | Cloud: automações | Gatilhos desconexão | REQUIRED | TEST-B-195 |
| F196 | Cloud: automações | Gatilhos bateria | REQUIRED | TEST-B-196 |
| F197 | Cloud: automações | Gatilhos agenda | REQUIRED | TEST-B-197 |
| F198 | Cloud: automações | AND OR | REQUIRED | TEST-B-198 |
| F199 | Cloud: automações | Janelas temporais | REQUIRED | TEST-B-199 |
| F200 | Cloud: automações | Limites individuais | REQUIRED | TEST-B-200 |
| F201 | Cloud: automações | Histerese | REQUIRED | TEST-B-201 |
| F202 | Cloud: automações | Cooldown | REQUIRED | TEST-B-202 |
| F203 | Cloud: automações | Webhooks saída assinados | REQUIRED | TEST-B-203 |
| F204 | Cloud: automações | Webhooks entrada autenticados | REQUIRED | TEST-B-204 |
| F205 | Cloud: automações | HTTP externo autorizado | REQUIRED | TEST-B-205 |
| F206 | Cloud: automações | MCP allowlist | REQUIRED | TEST-B-206 |
| F207 | Cloud: automações | Push | REQUIRED | TEST-B-207 |
| F208 | Cloud: automações | E-mail transacional | REQUIRED | TEST-B-208 |
| F209 | Cloud: automações | Mensageria externa opt-in | REQUIRED | TEST-B-209 |
| F210 | Cloud: automações | Vibração via gateway | REQUIRED | TEST-B-210 |
| F211 | Cloud: automações | Controle IoT permitido | REQUIRED | TEST-B-211 |
| F212 | Cloud: automações | Multi-step flows | REQUIRED | TEST-B-212 |
| F213 | Cloud: automações | Aprovação humana | REQUIRED | TEST-B-213 |
| F214 | Cloud: automações | Simular com histórico | REQUIRED | TEST-B-214 |
| F215 | Cloud: automações | Histórico execuções | REQUIRED | TEST-B-215 |
| F216 | Cloud: automações | Retry/DLQ não físico | REQUIRED | TEST-B-216 |
| F217 | Cloud: automações | Kill switch automações | REQUIRED | TEST-B-217 |
| F218 | Cloud: automações | Templates de regras | REQUIRED | TEST-B-218 |
| F219 | Cloud: IA e insights | Baseline estatístico individual | REQUIRED | TEST-B-219 |
| F220 | Cloud: IA e insights | Padrões recorrentes | REQUIRED | TEST-B-220 |
| F221 | Cloud: IA e insights | Anomalias estatísticas | REQUIRED | TEST-B-221 |
| F222 | Cloud: IA e insights | Comparações temporais | REQUIRED | TEST-B-222 |
| F223 | Cloud: IA e insights | Classificar atividade | REQUIRED | TEST-B-223 |
| F224 | Cloud: IA e insights | Tendências | REQUIRED | TEST-B-224 |
| F225 | Cloud: IA e insights | Regularidade sono | REQUIRED | TEST-B-225 |
| F226 | Cloud: IA e insights | Mudanças rotina | REQUIRED | TEST-B-226 |
| F227 | Cloud: IA e insights | Correlações sinais | REQUIRED | TEST-B-227 |
| F228 | Cloud: IA e insights | Projeção experimental | REQUIRED | TEST-B-228 |
| F229 | Cloud: IA e insights | Dados inconsistentes | REQUIRED | TEST-B-229 |
| F230 | Cloud: IA e insights | Resumos automatizados | REQUIRED | TEST-B-230 |
| F231 | Cloud: IA e insights | Relatórios diários | REQUIRED | TEST-B-231 |
| F232 | Cloud: IA e insights | Relatórios periódicos | REQUIRED | TEST-B-232 |
| F233 | Cloud: IA e insights | Linguagem natural sobre dados | REQUIRED | TEST-B-233 |
| F234 | Cloud: IA e insights | Agente pessoal | REQUIRED | TEST-B-234 |
| F235 | Cloud: IA e insights | Memória preferências | REQUIRED | TEST-B-235 |
| F236 | Cloud: IA e insights | Memória rotina consentida | REQUIRED | TEST-B-236 |
| F237 | Cloud: IA e insights | Sugestões não clínicas | REQUIRED | TEST-B-237 |
| F238 | Cloud: IA e insights | Agente de automação | REQUIRED | TEST-B-238 |
| F239 | Cloud: IA e insights | Agente device observability | REQUIRED | TEST-B-239 |
| F240 | Cloud: IA e insights | Ferramentas MCP | REQUIRED | TEST-B-240 |
| F241 | Cloud: IA e insights | Adaptador JEV | REQUIRED | TEST-B-241 |
| F242 | Cloud: IA e insights | Policy de decisões | REQUIRED | TEST-B-242 |
| F243 | Cloud: IA e insights | Avaliar/versionar modelos | REQUIRED | TEST-B-243 |
| F244 | Cloud: IA e insights | Explicar origem insights | REQUIRED | TEST-B-244 |
| F245 | Cloud: IA e insights | Qualidade e confiança | REQUIRED | TEST-B-245 |
| F246 | Cloud: IA e insights | Feedback insights | REQUIRED | TEST-B-246 |
| F247 | Cloud: IA e insights | Experimentos A/B | REQUIRED | TEST-B-247 |
| F248 | Cloud: IA e insights | Medição custo IA | REQUIRED | TEST-B-248 |
| F249 | Cloud: plataforma API | API REST versionada | REQUIRED | TEST-B-249 |
| F250 | Cloud: plataforma API | OpenAPI | REQUIRED | TEST-B-250 |
| F251 | Cloud: plataforma API | SDK Kotlin | REQUIRED | TEST-B-251 |
| F252 | Cloud: plataforma API | SDK TypeScript | REQUIRED | TEST-B-252 |
| F253 | Cloud: plataforma API | API keys scoping | REQUIRED | TEST-B-253 |
| F254 | Cloud: plataforma API | OAuth integrações | REQUIRED | TEST-B-254 |
| F255 | Cloud: plataforma API | Webhooks assinados | REQUIRED | TEST-B-255 |
| F256 | Cloud: plataforma API | Subscrever eventos WSS | REQUIRED | TEST-B-256 |
| F257 | Cloud: plataforma API | Portal developers | REQUIRED | TEST-B-257 |
| F258 | Cloud: plataforma API | API Playground | REQUIRED | TEST-B-258 |
| F259 | Cloud: plataforma API | Sandbox sintético | REQUIRED | TEST-B-259 |
| F260 | Cloud: plataforma API | Coleção Postman | REQUIRED | TEST-B-260 |
| F261 | Cloud: plataforma API | Logs tracing | REQUIRED | TEST-B-261 |
| F262 | Cloud: plataforma API | Quotas rate limit | REQUIRED | TEST-B-262 |
| F263 | Cloud: plataforma API | Gateway MQTT | REQUIRED | TEST-B-263 |
| F264 | Cloud: plataforma API | Home Assistant | REQUIRED | TEST-B-264 |
| F265 | Cloud: plataforma API | N8N | REQUIRED | TEST-B-265 |
| F266 | Cloud: plataforma API | Integrações DeltaBots | REQUIRED | TEST-B-266 |
| F267 | Cloud: plataforma API | Servidor MCP | REQUIRED | TEST-B-267 |
| F268 | Cloud: plataforma API | Catálogo ferramentas MCP | REQUIRED | TEST-B-268 |
| F269 | Cloud: plataforma API | Exportação padronizada | REQUIRED | TEST-B-269 |
| F270 | Cloud: plataforma API | Eventos parceiros | REQUIRED | TEST-B-270 |
| F271 | Cloud: operação | Logs estruturados | REQUIRED | TEST-B-271 |
| F272 | Cloud: operação | Métricas operação | REQUIRED | TEST-B-272 |
| F273 | Cloud: operação | Tracing | REQUIRED | TEST-B-273 |
| F274 | Cloud: operação | Monitoramento erros | REQUIRED | TEST-B-274 |
| F275 | Cloud: operação | Latência | REQUIRED | TEST-B-275 |
| F276 | Cloud: operação | Ingestão | REQUIRED | TEST-B-276 |
| F277 | Cloud: operação | DLQ | REQUIRED | TEST-B-277 |
| F278 | Cloud: operação | Idempotência | REQUIRED | TEST-B-278 |
| F279 | Cloud: operação | Retries controlados | REQUIRED | TEST-B-279 |
| F280 | Cloud: operação | Backup recovery | REQUIRED | TEST-B-280 |
| F281 | Cloud: operação | Criptografia | REQUIRED | TEST-B-281 |
| F282 | Cloud: operação | Secret management | REQUIRED | TEST-B-282 |
| F283 | Cloud: operação | Retenção | REQUIRED | TEST-B-283 |
| F284 | Cloud: operação | Audit comando | REQUIRED | TEST-B-284 |
| F285 | Cloud: operação | Abuse detection | REQUIRED | TEST-B-285 |
| F286 | Cloud: operação | Anti replay | REQUIRED | TEST-B-286 |
| F287 | Cloud: operação | Tenant isolation | REQUIRED | TEST-B-287 |
| F288 | Cloud: operação | Custos Cloudflare | REQUIRED | TEST-B-288 |
| F289 | Cloud: operação | Alertas SRE | REQUIRED | TEST-B-289 |
| F290 | Cloud: operação | Health dashboard | REQUIRED | TEST-B-290 |
| F291 | Cloud: operação | Feature flags | REQUIRED | TEST-B-291 |
| F292 | Cloud: operação | Schema migrations | REQUIRED | TEST-B-292 |
| F293 | Cloud: operação | Rollback deploy | REQUIRED | TEST-B-293 |
| F294 | Cloud: operação | Ambientes isolados | REQUIRED | TEST-B-294 |
| F295 | Cloud: operação | Least privilege | REQUIRED | TEST-B-295 |
| F296 | Cloud: operação | Audit health data access | REQUIRED | TEST-B-296 |
| F297 | Web Console | Dashboard geral | REQUIRED | TEST-W-297 |
| F298 | Web Console | Dashboard individual | REQUIRED | TEST-W-298 |
| F299 | Web Console | FC panel | REQUIRED | TEST-W-299 |
| F300 | Web Console | Atividade panel | REQUIRED | TEST-W-300 |
| F301 | Web Console | Sono panel | REQUIRED | TEST-W-301 |
| F302 | Web Console | Timeline eventos | REQUIRED | TEST-W-302 |
| F303 | Web Console | Devices online | REQUIRED | TEST-W-303 |
| F304 | Web Console | Bateria sync | REQUIRED | TEST-W-304 |
| F305 | Web Console | Comparação períodos | REQUIRED | TEST-W-305 |
| F306 | Web Console | Tendências | REQUIRED | TEST-W-306 |
| F307 | Web Console | Filtros avançados | REQUIRED | TEST-W-307 |
| F308 | Web Console | Live charts | REQUIRED | TEST-W-308 |
| F309 | Web Console | Alert history | REQUIRED | TEST-W-309 |
| F310 | Web Console | Automation builder | REQUIRED | TEST-W-310 |
| F311 | Web Console | Rule simulator | REQUIRED | TEST-W-311 |
| F312 | Web Console | Threshold editor | REQUIRED | TEST-W-312 |
| F313 | Web Console | AI chat | REQUIRED | TEST-W-313 |
| F314 | Web Console | Insights reports | REQUIRED | TEST-W-314 |
| F315 | Web Console | User management | REQUIRED | TEST-W-315 |
| F316 | Web Console | Family grants | REQUIRED | TEST-W-316 |
| F317 | Web Console | Organizations | REQUIRED | TEST-W-317 |
| F318 | Web Console | Devices inventory | REQUIRED | TEST-W-318 |
| F319 | Web Console | Integration management | REQUIRED | TEST-W-319 |
| F320 | Web Console | Webhooks | REQUIRED | TEST-W-320 |
| F321 | Web Console | Log explorer | REQUIRED | TEST-W-321 |
| F322 | Web Console | Audit explorer | REQUIRED | TEST-W-322 |
| F323 | Web Console | API tokens | REQUIRED | TEST-W-323 |
| F324 | Web Console | Report exports | REQUIRED | TEST-W-324 |
| F325 | Web Console | Dashboard sharing control | REQUIRED | TEST-W-325 |
| F326 | Web Console | Notification center | REQUIRED | TEST-W-326 |
| F327 | Web Console | Help center | REQUIRED | TEST-W-327 |
| F328 | Web Console | Cost usage | REQUIRED | TEST-W-328 |
| F329 | Web Console | Billing plans | REQUIRED | TEST-W-329 |
| F330 | Web Console | Superadmin operations | REQUIRED | TEST-W-330 |
| F331 | Experimental: Gesture Engine | Captura experimental movimento | HARDWARE_GATED | TEST-R-331 |
| F332 | Experimental: Gesture Engine | Treinar gestos | HARDWARE_GATED | TEST-R-332 |
| F333 | Experimental: Gesture Engine | Reconhecimento de padrões | HARDWARE_GATED | TEST-R-333 |
| F334 | Experimental: Gesture Engine | Associar gesto a comando | HARDWARE_GATED | TEST-R-334 |
| F335 | Experimental: Gesture Engine | Atuação gestual autorizada | HARDWARE_GATED | TEST-R-335 |
| F336 | Experimental: Personal Digital Twin | Modelo de rotina computacional | REQUIRED | TEST-R-336 |
| F337 | Experimental: Personal Digital Twin | Baseline individual | REQUIRED | TEST-R-337 |
| F338 | Experimental: Personal Digital Twin | Simular rotina | REQUIRED | TEST-R-338 |
| F339 | Experimental: Personal Digital Twin | Identificar desvio de padrões | REQUIRED | TEST-R-339 |
| F340 | Experimental: Personal Digital Twin | Projeções experimentais | REQUIRED | TEST-R-340 |
| F341 | Experimental: Ambient Intelligence | Conector Home Assistant | REQUIRED | TEST-R-341 |
| F342 | Experimental: Ambient Intelligence | Contexto sensores ambiente | REQUIRED | TEST-R-342 |
| F343 | Experimental: Ambient Intelligence | Automação contextual | REQUIRED | TEST-R-343 |
| F344 | Experimental: Ambient Intelligence | Automação por presença | REQUIRED | TEST-R-344 |
| F345 | Experimental: Ambient Intelligence | Combinar sinais fisiológicos e IoT | REQUIRED | TEST-R-345 |
| F346 | Experimental: JEV Engine | Telemetria para JEV | EXTERNAL_DEPENDENCY | TEST-R-346 |
| F347 | Experimental: JEV Engine | Classificar estados via adaptador JEV | EXTERNAL_DEPENDENCY | TEST-R-347 |
| F348 | Experimental: JEV Engine | Simular cenários com JEV | EXTERNAL_DEPENDENCY | TEST-R-348 |
| F349 | Experimental: JEV Engine | Selecionar ações condicionadas | EXTERNAL_DEPENDENCY | TEST-R-349 |
| F350 | Experimental: JEV Engine | Auditar decisões JEV | EXTERNAL_DEPENDENCY | TEST-R-350 |

| F351 | Android: Wearable UI | Identificar variante HW e firmware para temas | REQUIRED | TEST-T-351 |
| F352 | Android: Wearable UI | Verificar capability RESOURCE_FLASH com evidência de hardware | HARDWARE_GATED | TEST-T-352 |
| F353 | Android: Wearable UI | Catálogo de temas na tela do dispositivo | REQUIRED | TEST-T-353 |
| F354 | Android: Wearable UI | Filtrar temas por compatibilidade e versão | REQUIRED | TEST-T-354 |
| F355 | Android: Wearable UI | Prévia realista monocromática 128x80 | REQUIRED | TEST-T-355 |
| F356 | Android: Wearable UI | Comparação antes/depois por seção de interface | REQUIRED | TEST-T-356 |
| F357 | Android: Wearable UI | Exibir autor licença versão e changelog dos temas | REQUIRED | TEST-T-357 |
| F358 | Android: Wearable UI | Selecionar e fixar versão de tema para instalação | REQUIRED | TEST-T-358 |
| F359 | Android: Wearable UI | Baixar artefato por HTTPS autorizado e cache local | REQUIRED | TEST-T-359 |
| F360 | Android: Wearable UI | Validar manifesto assinatura SHA256 e expiração | REQUIRED | TEST-T-360 |
| F361 | Android: Wearable UI | Importar arquivo RES local confiável em modo avançado | REQUIRED | TEST-T-361 |
| F362 | Android: Wearable UI | Negar flash por incompatibilidade exata de recursos firmware ou variante | REQUIRED | TEST-T-362 |
| F363 | Android: Wearable UI | Checar bateria conexão e conflitos BLE de preflight | REQUIRED | TEST-T-363 |
| F364 | Android: Wearable UI | Solicitar consentimento explícito presencial para cada flash | REQUIRED | TEST-T-364 |
| F365 | Android: Wearable UI | Isolar lock exclusivo de atualização GATT e desarmar gestos | REQUIRED | TEST-T-365 |
| F366 | Android: Wearable UI | Instalar pacote RES por protocolo BLE comprovado | HARDWARE_GATED | TEST-T-366 |
| F367 | Android: Wearable UI | Mostrar progresso por etapas e bytes reconhecidos | REQUIRED | TEST-T-367 |
| F368 | Android: Wearable UI | Persistir journal de atualização para interrupções | REQUIRED | TEST-T-368 |
| F369 | Android: Wearable UI | Reconectar e validar instalação sem falso positivo | HARDWARE_GATED | TEST-T-369 |
| F370 | Android: Wearable UI | Histórico de instalação erro versão e hash por dispositivo | REQUIRED | TEST-T-370 |
| F371 | Android: Wearable UI | Reinstalar recurso original conhecido se dispositivo suportar | HARDWARE_GATED | TEST-T-371 |
| F372 | Android: Wearable UI | Diagnóstico e recuperação assistida quando falhar | REQUIRED | TEST-T-372 |
| F373 | Cloudflare: Wearable UI | Servir catálogo de temas versionado e filtrável | REQUIRED | TEST-T-373 |
| F374 | Cloudflare: Wearable UI | Publicar manifestos assinados com compatibilidade estrita | REQUIRED | TEST-T-374 |
| F375 | Cloudflare: Wearable UI | Armazenar artefatos no R2 privado com integridade | REQUIRED | TEST-T-375 |
| F376 | Cloudflare: Wearable UI | Emitir tickets curtos autorizados para download | REQUIRED | TEST-T-376 |
| F377 | Cloudflare: Wearable UI | Cadastrar projetos e recursos no painel de administração | REQUIRED | TEST-T-377 |
| F378 | Cloudflare: Wearable UI | Editor Theme Studio com sprites e slots mapeados | REQUIRED | TEST-T-378 |
| F379 | Cloudflare: Wearable UI | Compilar deterministicamente recursos RES suportados | HARDWARE_GATED | TEST-T-379 |
| F380 | Cloudflare: Wearable UI | Validar layouts monocromáticos no simulador | REQUIRED | TEST-T-380 |
| F381 | Cloudflare: Wearable UI | Associar provas de hardware a versões publicáveis | REQUIRED | TEST-T-381 |
| F382 | Cloudflare: Wearable UI | Aplicar aprovação dupla para publicação de temas | REQUIRED | TEST-T-382 |
| F383 | Cloudflare: Wearable UI | Publicar versões de temas compatíveis e assinadas | REQUIRED | TEST-T-383 |
| F384 | Cloudflare: Wearable UI | Revogar pacotes e impedir novas instalações | REQUIRED | TEST-T-384 |
| F385 | Cloudflare: Wearable UI | Controlar rollout canary por revisão de hardware | REQUIRED | TEST-T-385 |
| F386 | Cloudflare: Wearable UI | Registrar tentativas e eventos auditáveis em D1 | REQUIRED | TEST-T-386 |
| F387 | Cloudflare: Wearable UI | Expor acompanhamento de progresso por API e WSS | REQUIRED | TEST-T-387 |
| F388 | Qualidade: Wearable UI | Verificar licenças e direito de redistribuição dos recursos | REQUIRED | TEST-T-388 |
| F389 | Qualidade: Wearable UI | Executar QA de flash real por combo variante firmware | HARDWARE_GATED | TEST-T-389 |
| F390 | Qualidade: Wearable UI | Testar acessibilidade i18n e estados de recuperação OTA | REQUIRED | TEST-T-390 |

## Rastreabilidade normatizada
Para cada F###, criar task/commit + testes unit/integração/E2E cabíveis e evidência (log, teste, screenshot ou hardware report). Nenhum PASS sem evidência; `HARDWARE_GATED` requer `21-HARDWARE-VALIDATION.md`.

## Mapeamento para docs
F001–F120 → 04-ANDROID, 05-BLE, 15-UX-SCREENS. F121–F296 → 09-CLOUDFLARE, 10-API, 11-DATABASE, 12-SECURITY, 14-AUTOMATIONS. F297–F330 → 16-WEB-CONSOLE. F331–F350 → 07-GESTURES, 08-IOT-MQTT, 13-AI-MCP-JEV, 21-HARDWARE-VALIDATION.

F351–F390 → `34-WEARABLE-UI-UPDATES.md`, `35-THEME-STUDIO-PIPELINE.md`, `36-BLE-THEME-OTA-PROTOCOL.md`, `21-HARDWARE-VALIDATION.md` e `contracts/theme-manifest.schema.json`.
