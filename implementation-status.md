# implementation-status — DeltaBots Pulse

> Gerado por `python3 quality/status.py` a partir de `docs/feature-register.csv`. Não editar à mão.
> Estados conforme `docs/20-ACCEPTANCE.md`; `DESCOPED_BY_OWNER` registrado no ADR-0005.
> `PASS` exige evidência reproduzível; itens `HARDWARE_GATED` só passam com prova física (HWxx).

## Resumo

| Estado | Quantidade |
|---|---|
| `DESCOPED_BY_OWNER` | 40 |
| `NOT_STARTED` | 350 |

## Por área

### Android: BLE e pareamento

_NOT_STARTED: 15_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F001 | Buscar pulseiras BLE próximas | REQUIRED | `NOT_STARTED` | — |
| F002 | Parear sem aplicativo Xiaomi quando autorizado | REQUIRED | `NOT_STARTED` | — |
| F003 | Autenticar com chave legítima | REQUIRED | `NOT_STARTED` | — |
| F004 | Reconexão BLE automática | REQUIRED | `NOT_STARTED` | — |
| F005 | Exibir estado da conexão | REQUIRED | `NOT_STARTED` | — |
| F006 | Exibir bateria da pulseira | REQUIRED | `NOT_STARTED` | — |
| F007 | Identificar modelo e firmware | REQUIRED | `NOT_STARTED` | — |
| F008 | Sincronização manual | REQUIRED | `NOT_STARTED` | — |
| F009 | Sincronização periódica | REQUIRED | `NOT_STARTED` | — |
| F010 | Ajustar parâmetros BLE suportados | REQUIRED | `NOT_STARTED` | — |
| F011 | Localizar pulseira por vibração se suportado | HARDWARE_GATED | `NOT_STARTED` | — |
| F012 | Diagnóstico RSSI/GATT | REQUIRED | `NOT_STARTED` | — |
| F013 | Histórico de desconexões | REQUIRED | `NOT_STARTED` | — |
| F014 | Gerenciar dispositivos cadastrados | REQUIRED | `NOT_STARTED` | — |
| F015 | Firmware OTA assinado se compatível e autorizado | HARDWARE_GATED | `NOT_STARTED` | — |

### Android: biometria

_NOT_STARTED: 13_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F016 | Frequência cardíaca atual | REQUIRED | `NOT_STARTED` | — |
| F017 | Histórico de frequência cardíaca | REQUIRED | `NOT_STARTED` | — |
| F018 | Curva por horário | REQUIRED | `NOT_STARTED` | — |
| F019 | Média de frequência cardíaca | REQUIRED | `NOT_STARTED` | — |
| F020 | Mínimo e máximo de FC | REQUIRED | `NOT_STARTED` | — |
| F021 | Comparação entre períodos | REQUIRED | `NOT_STARTED` | — |
| F022 | Tendências de frequência cardíaca | REQUIRED | `NOT_STARTED` | — |
| F023 | Leituras inválidas/qualidade | REQUIRED | `NOT_STARTED` | — |
| F024 | Solicitar medição de FC | REQUIRED | `NOT_STARTED` | — |
| F025 | Intervalos de monitoramento suportados | HARDWARE_GATED | `NOT_STARTED` | — |
| F026 | Alertas de limites configurados | REQUIRED | `NOT_STARTED` | — |
| F027 | Contexto FC com atividade | REQUIRED | `NOT_STARTED` | — |
| F028 | Exportar histórico biométrico | REQUIRED | `NOT_STARTED` | — |

### Android: atividade

_NOT_STARTED: 15_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F029 | Passos diários | REQUIRED | `NOT_STARTED` | — |
| F030 | Histórico de passos | REQUIRED | `NOT_STARTED` | — |
| F031 | Metas de passos | REQUIRED | `NOT_STARTED` | — |
| F032 | Distância estimada | REQUIRED | `NOT_STARTED` | — |
| F033 | Calorias estimadas | REQUIRED | `NOT_STARTED` | — |
| F034 | Períodos de atividade | REQUIRED | `NOT_STARTED` | — |
| F035 | Períodos de inatividade | REQUIRED | `NOT_STARTED` | — |
| F036 | Gráficos atividade horário | REQUIRED | `NOT_STARTED` | — |
| F037 | Comparação dias ativos | REQUIRED | `NOT_STARTED` | — |
| F038 | Registro de exercícios | REQUIRED | `NOT_STARTED` | — |
| F039 | Exercício GPS do celular | REQUIRED | `NOT_STARTED` | — |
| F040 | Rotas pelo celular com opt-in | REQUIRED | `NOT_STARTED` | — |
| F041 | Desafios de movimento | REQUIRED | `NOT_STARTED` | — |
| F042 | Padrões de movimento experimentais | REQUIRED | `NOT_STARTED` | — |
| F043 | Gestos experimentais | HARDWARE_GATED | `NOT_STARTED` | — |

### Android: sono

_NOT_STARTED: 13_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F044 | Sincronizar sono | REQUIRED | `NOT_STARTED` | — |
| F045 | Duração total de sono | REQUIRED | `NOT_STARTED` | — |
| F046 | Início e fim estimados do sono | REQUIRED | `NOT_STARTED` | — |
| F047 | Histórico gráfico de sono | REQUIRED | `NOT_STARTED` | — |
| F048 | Média de sono | REQUIRED | `NOT_STARTED` | — |
| F049 | Regularidade de horários | REQUIRED | `NOT_STARTED` | — |
| F050 | Metas de descanso | REQUIRED | `NOT_STARTED` | — |
| F051 | Noites atípicas | REQUIRED | `NOT_STARTED` | — |
| F052 | Resumo semanal | REQUIRED | `NOT_STARTED` | — |
| F053 | Correlação sono-atividade | REQUIRED | `NOT_STARTED` | — |
| F054 | Tendência de recuperação não clínica | REQUIRED | `NOT_STARTED` | — |
| F055 | Sugestões de rotina | REQUIRED | `NOT_STARTED` | — |
| F056 | Classificação individual de padrões | REQUIRED | `NOT_STARTED` | — |

### Android: notificações

_NOT_STARTED: 12_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F057 | Encaminhar notificações Android | REQUIRED | `NOT_STARTED` | — |
| F058 | Notificar chamadas | REQUIRED | `NOT_STARTED` | — |
| F059 | Filtros por aplicativos | REQUIRED | `NOT_STARTED` | — |
| F060 | Notificações IA | REQUIRED | `NOT_STARTED` | — |
| F061 | Vibração por evento remoto se suportado | HARDWARE_GATED | `NOT_STARTED` | — |
| F062 | Padrões de vibração se suportados | HARDWARE_GATED | `NOT_STARTED` | — |
| F063 | Alertas de calendário | REQUIRED | `NOT_STARTED` | — |
| F064 | Lembretes | REQUIRED | `NOT_STARTED` | — |
| F065 | Alertas infraestrutura DeltaBots | REQUIRED | `NOT_STARTED` | — |
| F066 | Ações botão pulseira se suportadas | HARDWARE_GATED | `NOT_STARTED` | — |
| F067 | Horários sem notificações | REQUIRED | `NOT_STARTED` | — |
| F068 | Ações por eventos suportados | HARDWARE_GATED | `NOT_STARTED` | — |

### Android: inteligência

_NOT_STARTED: 17_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F069 | Chat IA pessoal | REQUIRED | `NOT_STARTED` | — |
| F070 | Conversação por voz via celular | REQUIRED | `NOT_STARTED` | — |
| F071 | Perguntas sobre histórico pessoal | REQUIRED | `NOT_STARTED` | — |
| F072 | Resumo diário por IA | REQUIRED | `NOT_STARTED` | — |
| F073 | Resumo semanal por IA | REQUIRED | `NOT_STARTED` | — |
| F074 | Sugestões hábitos não clínicos | REQUIRED | `NOT_STARTED` | — |
| F075 | Explicar mudanças de padrões | REQUIRED | `NOT_STARTED` | — |
| F076 | Correlação entre indicadores | REQUIRED | `NOT_STARTED` | — |
| F077 | Linha do tempo inteligente | REQUIRED | `NOT_STARTED` | — |
| F078 | Memória autorizada | REQUIRED | `NOT_STARTED` | — |
| F079 | Perguntas em linguagem natural | REQUIRED | `NOT_STARTED` | — |
| F080 | Rascunhar regras por linguagem natural | REQUIRED | `NOT_STARTED` | — |
| F081 | Ferramentas de agente autorizadas | REQUIRED | `NOT_STARTED` | — |
| F082 | Relatórios personalizados | REQUIRED | `NOT_STARTED` | — |
| F083 | Insights preditivos experimentais | REQUIRED | `NOT_STARTED` | — |
| F084 | Análise local sensível | REQUIRED | `NOT_STARTED` | — |
| F085 | Privacidade IA | REQUIRED | `NOT_STARTED` | — |

### Android: acompanhamento

_NOT_STARTED: 15_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F086 | Contatos de confiança | REQUIRED | `NOT_STARTED` | — |
| F087 | Compartilhamento autorizado | REQUIRED | `NOT_STARTED` | — |
| F088 | Painel familiar | REQUIRED | `NOT_STARTED` | — |
| F089 | Alerta inatividade prolongada | REQUIRED | `NOT_STARTED` | — |
| F090 | Alerta desconexão | REQUIRED | `NOT_STARTED` | — |
| F091 | Alerta sync atrasada | REQUIRED | `NOT_STARTED` | — |
| F092 | Solicitação ajuda Android | REQUIRED | `NOT_STARTED` | — |
| F093 | Ajuda via pulseira se suportada | HARDWARE_GATED | `NOT_STARTED` | — |
| F094 | Confirmação de segurança | REQUIRED | `NOT_STARTED` | — |
| F095 | Check-in bem-estar | REQUIRED | `NOT_STARTED` | — |
| F096 | Localização do telefone opt-in | REQUIRED | `NOT_STARTED` | — |
| F097 | Histórico pedidos de ajuda | REQUIRED | `NOT_STARTED` | — |
| F098 | Escalonar notificações | REQUIRED | `NOT_STARTED` | — |
| F099 | Ausência de atividade esperada | REQUIRED | `NOT_STARTED` | — |
| F100 | Registro de incidentes | REQUIRED | `NOT_STARTED` | — |

### Android: conta e experiência

_NOT_STARTED: 20_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F101 | Conta e login | REQUIRED | `NOT_STARTED` | — |
| F102 | Biometria local de acesso | REQUIRED | `NOT_STARTED` | — |
| F103 | Perfis individuais | REQUIRED | `NOT_STARTED` | — |
| F104 | Metas pessoais | REQUIRED | `NOT_STARTED` | — |
| F105 | Dashboard personalizável | REQUIRED | `NOT_STARTED` | — |
| F106 | Widgets tela inicial | REQUIRED | `NOT_STARTED` | — |
| F107 | Tema escuro | REQUIRED | `NOT_STARTED` | — |
| F108 | Unidades e idiomas | REQUIRED | `NOT_STARTED` | — |
| F109 | Notificações personalizadas | REQUIRED | `NOT_STARTED` | — |
| F110 | Offline-first | REQUIRED | `NOT_STARTED` | — |
| F111 | Sync após reconexão | REQUIRED | `NOT_STARTED` | — |
| F112 | Backup configurações | REQUIRED | `NOT_STARTED` | — |
| F113 | Exportar dados | REQUIRED | `NOT_STARTED` | — |
| F114 | Excluir dados | REQUIRED | `NOT_STARTED` | — |
| F115 | Controle de consentimentos | REQUIRED | `NOT_STARTED` | — |
| F116 | Gerir sessões de login | REQUIRED | `NOT_STARTED` | — |
| F117 | Ajuda diagnóstico | REQUIRED | `NOT_STARTED` | — |
| F118 | Notas de versão | REQUIRED | `NOT_STARTED` | — |
| F119 | Acessibilidade e fontes grandes | REQUIRED | `NOT_STARTED` | — |
| F120 | Modo economia bateria | REQUIRED | `NOT_STARTED` | — |

### Cloud: identidade

_NOT_STARTED: 18_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F121 | Registro de usuários | REQUIRED | `NOT_STARTED` | — |
| F122 | Login seguro | REQUIRED | `NOT_STARTED` | — |
| F123 | Login social | REQUIRED | `NOT_STARTED` | — |
| F124 | MFA | REQUIRED | `NOT_STARTED` | — |
| F125 | Recuperação de conta | REQUIRED | `NOT_STARTED` | — |
| F126 | Gerenciamento sessões | REQUIRED | `NOT_STARTED` | — |
| F127 | Tokens rotativos | REQUIRED | `NOT_STARTED` | — |
| F128 | Revogação sessões | REQUIRED | `NOT_STARTED` | — |
| F129 | Dispositivos confiáveis | REQUIRED | `NOT_STARTED` | — |
| F130 | Autenticar gateways Android | REQUIRED | `NOT_STARTED` | — |
| F131 | Organizações | REQUIRED | `NOT_STARTED` | — |
| F132 | RBAC | REQUIRED | `NOT_STARTED` | — |
| F133 | Compartilhamento granular | REQUIRED | `NOT_STARTED` | — |
| F134 | Papéis familiar/admin | REQUIRED | `NOT_STARTED` | — |
| F135 | Auditoria acessos | REQUIRED | `NOT_STARTED` | — |
| F136 | Consentimentos versionados | REQUIRED | `NOT_STARTED` | — |
| F137 | Portabilidade dados | REQUIRED | `NOT_STARTED` | — |
| F138 | Exclusão conta/dados | REQUIRED | `NOT_STARTED` | — |

### Cloud: gestão dispositivos

_NOT_STARTED: 22_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F139 | Registrar dispositivos | REQUIRED | `NOT_STARTED` | — |
| F140 | Vincular a titular | REQUIRED | `NOT_STARTED` | — |
| F141 | Desvincular | REQUIRED | `NOT_STARTED` | — |
| F142 | Inventariar modelo firmware | REQUIRED | `NOT_STARTED` | — |
| F143 | Inventariar capabilities | REQUIRED | `NOT_STARTED` | — |
| F144 | Versão gateway Android | REQUIRED | `NOT_STARTED` | — |
| F145 | Heartbeats | REQUIRED | `NOT_STARTED` | — |
| F146 | Status online/offline reportado | REQUIRED | `NOT_STARTED` | — |
| F147 | Histórico conexões | REQUIRED | `NOT_STARTED` | — |
| F148 | Última sync | REQUIRED | `NOT_STARTED` | — |
| F149 | Bateria reportada | REQUIRED | `NOT_STARTED` | — |
| F150 | RSSI reportado | REQUIRED | `NOT_STARTED` | — |
| F151 | Config remota permitida | REQUIRED | `NOT_STARTED` | — |
| F152 | Solicitar sync remota | REQUIRED | `NOT_STARTED` | — |
| F153 | Enfileirar comandos | REQUIRED | `NOT_STARTED` | — |
| F154 | ACK comandos | REQUIRED | `NOT_STARTED` | — |
| F155 | TTL comandos | REQUIRED | `NOT_STARTED` | — |
| F156 | Inventário geral | REQUIRED | `NOT_STARTED` | — |
| F157 | Grupos de devices | REQUIRED | `NOT_STARTED` | — |
| F158 | Revogar gateway | REQUIRED | `NOT_STARTED` | — |
| F159 | Drivers versionados | REQUIRED | `NOT_STARTED` | — |
| F160 | API capabilities firmware | REQUIRED | `NOT_STARTED` | — |

### Cloud: ingestão

_NOT_STARTED: 28_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F161 | Receber FC em lotes | REQUIRED | `NOT_STARTED` | — |
| F162 | Receber passos | REQUIRED | `NOT_STARTED` | — |
| F163 | Receber atividade | REQUIRED | `NOT_STARTED` | — |
| F164 | Receber sono | REQUIRED | `NOT_STARTED` | — |
| F165 | Receber bateria | REQUIRED | `NOT_STARTED` | — |
| F166 | Receber conexão | REQUIRED | `NOT_STARTED` | — |
| F167 | Receber eventos pulseira | REQUIRED | `NOT_STARTED` | — |
| F168 | Receber diagnósticos gateway | REQUIRED | `NOT_STARTED` | — |
| F169 | Validar integridade | REQUIRED | `NOT_STARTED` | — |
| F170 | Normalizar unidades | REQUIRED | `NOT_STARTED` | — |
| F171 | Normalizar timestamps | REQUIRED | `NOT_STARTED` | — |
| F172 | Deduplicar leituras | REQUIRED | `NOT_STARTED` | — |
| F173 | Tratar leitura fora de ordem | REQUIRED | `NOT_STARTED` | — |
| F174 | Detectar lacunas | REQUIRED | `NOT_STARTED` | — |
| F175 | Sync incremental | REQUIRED | `NOT_STARTED` | — |
| F176 | Conciliar offline | REQUIRED | `NOT_STARTED` | — |
| F177 | Versionar schemas | REQUIRED | `NOT_STARTED` | — |
| F178 | Ingestão idempotente | REQUIRED | `NOT_STARTED` | — |
| F179 | Rate limiting | REQUIRED | `NOT_STARTED` | — |
| F180 | Filas telemetria | REQUIRED | `NOT_STARTED` | — |
| F181 | Agregação por tempo | REQUIRED | `NOT_STARTED` | — |
| F182 | Retenção configurável | REQUIRED | `NOT_STARTED` | — |
| F183 | Arquivamento R2 | REQUIRED | `NOT_STARTED` | — |
| F184 | Consultar amostras consentidas | REQUIRED | `NOT_STARTED` | — |
| F185 | Consultar agregados | REQUIRED | `NOT_STARTED` | — |
| F186 | Export JSON CSV | REQUIRED | `NOT_STARTED` | — |
| F187 | Streaming live | REQUIRED | `NOT_STARTED` | — |
| F188 | Data quality por leitura | REQUIRED | `NOT_STARTED` | — |

### Cloud: automações

_NOT_STARTED: 30_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F189 | Criar regra | REQUIRED | `NOT_STARTED` | — |
| F190 | Editar pausar excluir regras | REQUIRED | `NOT_STARTED` | — |
| F191 | Gatilhos FC | REQUIRED | `NOT_STARTED` | — |
| F192 | Gatilhos passos | REQUIRED | `NOT_STARTED` | — |
| F193 | Gatilhos inatividade | REQUIRED | `NOT_STARTED` | — |
| F194 | Gatilhos sono | REQUIRED | `NOT_STARTED` | — |
| F195 | Gatilhos desconexão | REQUIRED | `NOT_STARTED` | — |
| F196 | Gatilhos bateria | REQUIRED | `NOT_STARTED` | — |
| F197 | Gatilhos agenda | REQUIRED | `NOT_STARTED` | — |
| F198 | AND OR | REQUIRED | `NOT_STARTED` | — |
| F199 | Janelas temporais | REQUIRED | `NOT_STARTED` | — |
| F200 | Limites individuais | REQUIRED | `NOT_STARTED` | — |
| F201 | Histerese | REQUIRED | `NOT_STARTED` | — |
| F202 | Cooldown | REQUIRED | `NOT_STARTED` | — |
| F203 | Webhooks saída assinados | REQUIRED | `NOT_STARTED` | — |
| F204 | Webhooks entrada autenticados | REQUIRED | `NOT_STARTED` | — |
| F205 | HTTP externo autorizado | REQUIRED | `NOT_STARTED` | — |
| F206 | MCP allowlist | REQUIRED | `NOT_STARTED` | — |
| F207 | Push | REQUIRED | `NOT_STARTED` | — |
| F208 | E-mail transacional | REQUIRED | `NOT_STARTED` | — |
| F209 | Mensageria externa opt-in | REQUIRED | `NOT_STARTED` | — |
| F210 | Vibração via gateway | REQUIRED | `NOT_STARTED` | — |
| F211 | Controle IoT permitido | REQUIRED | `NOT_STARTED` | — |
| F212 | Multi-step flows | REQUIRED | `NOT_STARTED` | — |
| F213 | Aprovação humana | REQUIRED | `NOT_STARTED` | — |
| F214 | Simular com histórico | REQUIRED | `NOT_STARTED` | — |
| F215 | Histórico execuções | REQUIRED | `NOT_STARTED` | — |
| F216 | Retry/DLQ não físico | REQUIRED | `NOT_STARTED` | — |
| F217 | Kill switch automações | REQUIRED | `NOT_STARTED` | — |
| F218 | Templates de regras | REQUIRED | `NOT_STARTED` | — |

### Cloud: IA e insights

_NOT_STARTED: 30_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F219 | Baseline estatístico individual | REQUIRED | `NOT_STARTED` | — |
| F220 | Padrões recorrentes | REQUIRED | `NOT_STARTED` | — |
| F221 | Anomalias estatísticas | REQUIRED | `NOT_STARTED` | — |
| F222 | Comparações temporais | REQUIRED | `NOT_STARTED` | — |
| F223 | Classificar atividade | REQUIRED | `NOT_STARTED` | — |
| F224 | Tendências | REQUIRED | `NOT_STARTED` | — |
| F225 | Regularidade sono | REQUIRED | `NOT_STARTED` | — |
| F226 | Mudanças rotina | REQUIRED | `NOT_STARTED` | — |
| F227 | Correlações sinais | REQUIRED | `NOT_STARTED` | — |
| F228 | Projeção experimental | REQUIRED | `NOT_STARTED` | — |
| F229 | Dados inconsistentes | REQUIRED | `NOT_STARTED` | — |
| F230 | Resumos automatizados | REQUIRED | `NOT_STARTED` | — |
| F231 | Relatórios diários | REQUIRED | `NOT_STARTED` | — |
| F232 | Relatórios periódicos | REQUIRED | `NOT_STARTED` | — |
| F233 | Linguagem natural sobre dados | REQUIRED | `NOT_STARTED` | — |
| F234 | Agente pessoal | REQUIRED | `NOT_STARTED` | — |
| F235 | Memória preferências | REQUIRED | `NOT_STARTED` | — |
| F236 | Memória rotina consentida | REQUIRED | `NOT_STARTED` | — |
| F237 | Sugestões não clínicas | REQUIRED | `NOT_STARTED` | — |
| F238 | Agente de automação | REQUIRED | `NOT_STARTED` | — |
| F239 | Agente device observability | REQUIRED | `NOT_STARTED` | — |
| F240 | Ferramentas MCP | REQUIRED | `NOT_STARTED` | — |
| F241 | Adaptador JEV | REQUIRED | `NOT_STARTED` | — |
| F242 | Policy de decisões | REQUIRED | `NOT_STARTED` | — |
| F243 | Avaliar/versionar modelos | REQUIRED | `NOT_STARTED` | — |
| F244 | Explicar origem insights | REQUIRED | `NOT_STARTED` | — |
| F245 | Qualidade e confiança | REQUIRED | `NOT_STARTED` | — |
| F246 | Feedback insights | REQUIRED | `NOT_STARTED` | — |
| F247 | Experimentos A/B | REQUIRED | `NOT_STARTED` | — |
| F248 | Medição custo IA | REQUIRED | `NOT_STARTED` | — |

### Cloud: plataforma API

_NOT_STARTED: 22_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F249 | API REST versionada | REQUIRED | `NOT_STARTED` | — |
| F250 | OpenAPI | REQUIRED | `NOT_STARTED` | — |
| F251 | SDK Kotlin | REQUIRED | `NOT_STARTED` | — |
| F252 | SDK TypeScript | REQUIRED | `NOT_STARTED` | — |
| F253 | API keys scoping | REQUIRED | `NOT_STARTED` | — |
| F254 | OAuth integrações | REQUIRED | `NOT_STARTED` | — |
| F255 | Webhooks assinados | REQUIRED | `NOT_STARTED` | — |
| F256 | Subscrever eventos WSS | REQUIRED | `NOT_STARTED` | — |
| F257 | Portal developers | REQUIRED | `NOT_STARTED` | — |
| F258 | API Playground | REQUIRED | `NOT_STARTED` | — |
| F259 | Sandbox sintético | REQUIRED | `NOT_STARTED` | — |
| F260 | Coleção Postman | REQUIRED | `NOT_STARTED` | — |
| F261 | Logs tracing | REQUIRED | `NOT_STARTED` | — |
| F262 | Quotas rate limit | REQUIRED | `NOT_STARTED` | — |
| F263 | Gateway MQTT | REQUIRED | `NOT_STARTED` | — |
| F264 | Home Assistant | REQUIRED | `NOT_STARTED` | — |
| F265 | N8N | REQUIRED | `NOT_STARTED` | — |
| F266 | Integrações DeltaBots | REQUIRED | `NOT_STARTED` | — |
| F267 | Servidor MCP | REQUIRED | `NOT_STARTED` | — |
| F268 | Catálogo ferramentas MCP | REQUIRED | `NOT_STARTED` | — |
| F269 | Exportação padronizada | REQUIRED | `NOT_STARTED` | — |
| F270 | Eventos parceiros | REQUIRED | `NOT_STARTED` | — |

### Cloud: operação

_NOT_STARTED: 26_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F271 | Logs estruturados | REQUIRED | `NOT_STARTED` | — |
| F272 | Métricas operação | REQUIRED | `NOT_STARTED` | — |
| F273 | Tracing | REQUIRED | `NOT_STARTED` | — |
| F274 | Monitoramento erros | REQUIRED | `NOT_STARTED` | — |
| F275 | Latência | REQUIRED | `NOT_STARTED` | — |
| F276 | Ingestão | REQUIRED | `NOT_STARTED` | — |
| F277 | DLQ | REQUIRED | `NOT_STARTED` | — |
| F278 | Idempotência | REQUIRED | `NOT_STARTED` | — |
| F279 | Retries controlados | REQUIRED | `NOT_STARTED` | — |
| F280 | Backup recovery | REQUIRED | `NOT_STARTED` | — |
| F281 | Criptografia | REQUIRED | `NOT_STARTED` | — |
| F282 | Secret management | REQUIRED | `NOT_STARTED` | — |
| F283 | Retenção | REQUIRED | `NOT_STARTED` | — |
| F284 | Audit comando | REQUIRED | `NOT_STARTED` | — |
| F285 | Abuse detection | REQUIRED | `NOT_STARTED` | — |
| F286 | Anti replay | REQUIRED | `NOT_STARTED` | — |
| F287 | Tenant isolation | REQUIRED | `NOT_STARTED` | — |
| F288 | Custos Cloudflare | REQUIRED | `NOT_STARTED` | — |
| F289 | Alertas SRE | REQUIRED | `NOT_STARTED` | — |
| F290 | Health dashboard | REQUIRED | `NOT_STARTED` | — |
| F291 | Feature flags | REQUIRED | `NOT_STARTED` | — |
| F292 | Schema migrations | REQUIRED | `NOT_STARTED` | — |
| F293 | Rollback deploy | REQUIRED | `NOT_STARTED` | — |
| F294 | Ambientes isolados | REQUIRED | `NOT_STARTED` | — |
| F295 | Least privilege | REQUIRED | `NOT_STARTED` | — |
| F296 | Audit health data access | REQUIRED | `NOT_STARTED` | — |

### Web Console

_NOT_STARTED: 34_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F297 | Dashboard geral | REQUIRED | `NOT_STARTED` | — |
| F298 | Dashboard individual | REQUIRED | `NOT_STARTED` | — |
| F299 | FC panel | REQUIRED | `NOT_STARTED` | — |
| F300 | Atividade panel | REQUIRED | `NOT_STARTED` | — |
| F301 | Sono panel | REQUIRED | `NOT_STARTED` | — |
| F302 | Timeline eventos | REQUIRED | `NOT_STARTED` | — |
| F303 | Devices online | REQUIRED | `NOT_STARTED` | — |
| F304 | Bateria sync | REQUIRED | `NOT_STARTED` | — |
| F305 | Comparação períodos | REQUIRED | `NOT_STARTED` | — |
| F306 | Tendências | REQUIRED | `NOT_STARTED` | — |
| F307 | Filtros avançados | REQUIRED | `NOT_STARTED` | — |
| F308 | Live charts | REQUIRED | `NOT_STARTED` | — |
| F309 | Alert history | REQUIRED | `NOT_STARTED` | — |
| F310 | Automation builder | REQUIRED | `NOT_STARTED` | — |
| F311 | Rule simulator | REQUIRED | `NOT_STARTED` | — |
| F312 | Threshold editor | REQUIRED | `NOT_STARTED` | — |
| F313 | AI chat | REQUIRED | `NOT_STARTED` | — |
| F314 | Insights reports | REQUIRED | `NOT_STARTED` | — |
| F315 | User management | REQUIRED | `NOT_STARTED` | — |
| F316 | Family grants | REQUIRED | `NOT_STARTED` | — |
| F317 | Organizations | REQUIRED | `NOT_STARTED` | — |
| F318 | Devices inventory | REQUIRED | `NOT_STARTED` | — |
| F319 | Integration management | REQUIRED | `NOT_STARTED` | — |
| F320 | Webhooks | REQUIRED | `NOT_STARTED` | — |
| F321 | Log explorer | REQUIRED | `NOT_STARTED` | — |
| F322 | Audit explorer | REQUIRED | `NOT_STARTED` | — |
| F323 | API tokens | REQUIRED | `NOT_STARTED` | — |
| F324 | Report exports | REQUIRED | `NOT_STARTED` | — |
| F325 | Dashboard sharing control | REQUIRED | `NOT_STARTED` | — |
| F326 | Notification center | REQUIRED | `NOT_STARTED` | — |
| F327 | Help center | REQUIRED | `NOT_STARTED` | — |
| F328 | Cost usage | REQUIRED | `NOT_STARTED` | — |
| F329 | Billing plans | REQUIRED | `NOT_STARTED` | — |
| F330 | Superadmin operations | REQUIRED | `NOT_STARTED` | — |

### Experimental: Gesture Engine

_NOT_STARTED: 5_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F331 | Captura experimental movimento | HARDWARE_GATED | `NOT_STARTED` | — |
| F332 | Treinar gestos | HARDWARE_GATED | `NOT_STARTED` | — |
| F333 | Reconhecimento de padrões | HARDWARE_GATED | `NOT_STARTED` | — |
| F334 | Associar gesto a comando | HARDWARE_GATED | `NOT_STARTED` | — |
| F335 | Atuação gestual autorizada | HARDWARE_GATED | `NOT_STARTED` | — |

### Experimental: Personal Digital Twin

_NOT_STARTED: 5_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F336 | Modelo de rotina computacional | REQUIRED | `NOT_STARTED` | — |
| F337 | Baseline individual | REQUIRED | `NOT_STARTED` | — |
| F338 | Simular rotina | REQUIRED | `NOT_STARTED` | — |
| F339 | Identificar desvio de padrões | REQUIRED | `NOT_STARTED` | — |
| F340 | Projeções experimentais | REQUIRED | `NOT_STARTED` | — |

### Experimental: Ambient Intelligence

_NOT_STARTED: 5_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F341 | Conector Home Assistant | REQUIRED | `NOT_STARTED` | — |
| F342 | Contexto sensores ambiente | REQUIRED | `NOT_STARTED` | — |
| F343 | Automação contextual | REQUIRED | `NOT_STARTED` | — |
| F344 | Automação por presença | REQUIRED | `NOT_STARTED` | — |
| F345 | Combinar sinais fisiológicos e IoT | REQUIRED | `NOT_STARTED` | — |

### Experimental: JEV Engine

_NOT_STARTED: 5_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F346 | Telemetria para JEV | EXTERNAL_DEPENDENCY | `NOT_STARTED` | — |
| F347 | Classificar estados via adaptador JEV | EXTERNAL_DEPENDENCY | `NOT_STARTED` | — |
| F348 | Simular cenários com JEV | EXTERNAL_DEPENDENCY | `NOT_STARTED` | — |
| F349 | Selecionar ações condicionadas | EXTERNAL_DEPENDENCY | `NOT_STARTED` | — |
| F350 | Auditar decisões JEV | EXTERNAL_DEPENDENCY | `NOT_STARTED` | — |

### Android: Wearable UI

_DESCOPED_BY_OWNER: 22_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F351 | Identificar variante HW e firmware para temas | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F352 | Verificar capability RESOURCE_FLASH com evidência de hardware | HARDWARE_GATED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F353 | Catálogo de temas na tela do dispositivo | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F354 | Filtrar temas por compatibilidade e versão | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F355 | Prévia realista monocromática 128x80 | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F356 | Comparação antes/depois por seção de interface | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F357 | Exibir autor licença versão e changelog dos temas | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F358 | Selecionar e fixar versão de tema para instalação | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F359 | Baixar artefato por HTTPS autorizado e cache local | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F360 | Validar manifesto assinatura SHA256 e expiração | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F361 | Importar arquivo RES local confiável em modo avançado | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F362 | Negar flash por incompatibilidade exata de recursos firmware ou variante | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F363 | Checar bateria conexão e conflitos BLE de preflight | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F364 | Solicitar consentimento explícito presencial para cada flash | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F365 | Isolar lock exclusivo de atualização GATT e desarmar gestos | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F366 | Instalar pacote RES por protocolo BLE comprovado | HARDWARE_GATED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F367 | Mostrar progresso por etapas e bytes reconhecidos | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F368 | Persistir journal de atualização para interrupções | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F369 | Reconectar e validar instalação sem falso positivo | HARDWARE_GATED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F370 | Histórico de instalação erro versão e hash por dispositivo | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F371 | Reinstalar recurso original conhecido se dispositivo suportar | HARDWARE_GATED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F372 | Diagnóstico e recuperação assistida quando falhar | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |

### Cloudflare: Wearable UI

_DESCOPED_BY_OWNER: 15_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F373 | Servir catálogo de temas versionado e filtrável | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F374 | Publicar manifestos assinados com compatibilidade estrita | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F375 | Armazenar artefatos no R2 privado com integridade | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F376 | Emitir tickets curtos autorizados para download | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F377 | Cadastrar projetos e recursos no painel de administração | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F378 | Editor Theme Studio com sprites e slots mapeados | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F379 | Compilar deterministicamente recursos RES suportados | HARDWARE_GATED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F380 | Validar layouts monocromáticos no simulador | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F381 | Associar provas de hardware a versões publicáveis | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F382 | Aplicar aprovação dupla para publicação de temas | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F383 | Publicar versões de temas compatíveis e assinadas | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F384 | Revogar pacotes e impedir novas instalações | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F385 | Controlar rollout canary por revisão de hardware | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F386 | Registrar tentativas e eventos auditáveis em D1 | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F387 | Expor acompanhamento de progresso por API e WSS | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |

### Qualidade: Wearable UI

_DESCOPED_BY_OWNER: 3_

| ID | Funcionalidade | Escopo | Estado | Evidência |
|---|---|---|---|---|
| F388 | Verificar licenças e direito de redistribuição dos recursos | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F389 | Executar QA de flash real por combo variante firmware | HARDWARE_GATED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
| F390 | Testar acessibilidade i18n e estados de recuperação OTA | REQUIRED | `DESCOPED_BY_OWNER` | ADR-0005 (decisão do proprietário 2026-10-11) |
