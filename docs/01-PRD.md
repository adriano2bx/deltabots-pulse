# 01 — PRD integral | DELTABOTS PULSE
**Versão:** 1.1 · **Data-base:** 2026-10-11 · **Status:** Especificação de produto para engenharia

## 1. Visão
Uma plataforma multiplataforma de inteligência wearable, que conecta dispositivos BLE pelo Android a serviços Cloudflare e a um ecossistema de ações remotas supervisionadas. O Android é aplicativo funcional e gateway; o console web acompanha dados, usuários e automações; a nuvem autentica, armazena, transmite, organiza e analisa; conectores IoT/MCP/JEV executam somente ações permitidas.

## 2. Problemas que resolve
1. Dados de pulseiras isolados em aplicativos proprietários e sem APIs acessíveis.
2. Ausência de telemetria contínua consultável por usuários e familiares consentidos.
3. Dificuldade em transformar sensores e gestos em automações reais auditáveis.
4. Fragmentação entre monitoramento, armazenamento, regras, dispositivos IoT e inteligência artificial.
5. Falta de observabilidade, privacidade e segurança em protótipos experimentais.

## 3. Público-alvo e personas
- Usuário pessoal: consultar saúde não clínica, sono/atividade, alertas, assistente e privacidade.
- Cuidador/familiar: acesso explicitamente consentido a painéis e check-ins, sem tratar sistema como dispositivo médico.
- Maker/desenvolvedor: laboratório de gestos, WebSocket, MQTT, SDK, API e simulador.
- Administrador de organização: equipes, políticas, perfis, medição de uso, auditoria e faturamento.
- Operador SRE: health, eventos, dead letter, latência, releases e incidentes.

## 4. Experiência e jornadas completas
### 4.1 Primeiro acesso
Splash→idioma→onboarding 3 passos→registro/login→consentimentos separados (dados sensíveis/IA/compartilhamento)→permissões Android contextualizadas→descoberta BLE→pareamento/autenticação→inventário de capabilities comprovadas→sincronização inicial→dashboard com histórico real ou estado vazio→tutorial de funcionalidades.
### 4.2 Monitoramento
Coleta BLE→persistência Room local→normalização e flags de qualidade→fila offline→HTTPS ingestão em lotes→D1/R2 agregação→painel em quase tempo real via WSS ou consulta→notificações/relatórios→exportação.
### 4.3 Gestão remota
Usuário configura regra→simula com histórico→ativa regra→backend avalia sinais válidos→requer autorização e janela temporal→dispara notificação, webhook, ação remota ou solicitação de ajuda; mantém auditoria, ACK e DLQ.
### 4.4 Controle por gesto
Usuário escolhe equipamento permitido→faz arm local explícito com tempo limite→captura amostras se firmware permitir→extrai características, classifica com confidência≥limiar→preview e confirmação para ações sensíveis→evento WSS com TTL→DO faz autorização→gateway remoto confirma→feedback local; desarmar em qualquer perda de conexão. Acesso RAW condicionado a teste real.
### 4.5 Compartilhamento
Titular convida familiar→familiar aceita→titular concede escopos/métricas e período→painel apenas dos dados liberados→titular revoga a qualquer momento→auditoria.
### 4.6 Organização
Admin cria organização, define usuários/papéis, vincula dispositivos autorizados, quotas, integrações, billing e trilhas; tenant isolation obrigatório.

## 5. Escopo contratual final
**Dentro:** F001–F390 do `02-FEATURE-MATRIX.md`; Android+Cloudflare+console+bridge MQTT+exemplo ESP32; capacidades BLE suportadas; gateway com modo offline; regras/IA; gestão familiar; multi-organização; telemetria; logs; faturamento; testes/UX/docs.
**Condicionado ao hardware:** streaming IMU em Mi Band 3, classificação gestual baseada em IMU, comandos por botão, localização por vibração, ajustes de firmware avançados. Entregar sistema e driver com negociação de capabilities, mas expor indisponibilidade na ausência de prova.
**Fora de alegação:** diagnóstico médico, sensor de glicemia/pressão inexistente, posicionamento GPS da pulseira, detecção validada de quedas, controle de máquinas perigosas, garantia de latência em WAN pública, disponibilidade 24/7 garantida pelo OS.

## 6. Requisitos funcionais de produto
- RF-01 Toda leitura exibida deve identificar dispositivo, coleta, origem, qualidade e instante (data source provenance).
- RF-02 Suportar pelo menos um dispositivo BLE simultâneo conectado por gateway no lançamento; arquitetar múltiplos drivers e perfis sem estado global.
- RF-03 BLE e nuvem desacoplados: dados continuam disponíveis offline no aparelho.
- RF-04 Dashboard atualiza com pub/sub lógico e fallback HTTP; não inventar leituras para compor gráficos.
- RF-05 Escrita de comando remoto apenas a papéis aprovados, dentro de sessão armada, com TTL e sem dispositivos safety-critical.
- RF-06 Um comando duplicado nunca pode produzir efeitos duplicados em ações não idempotentes.
- RF-07 Alertas sensíveis precisam de consentimento, contexto, supressão de falso-positivo, feedback e desativação.
- RF-08 Agentes somente usam ferramentas definidas por política e não interpretam dados como comandos executáveis.
- RF-09 Exibir capacidade indisponível do firmware com explicação, não interface simulada.
- RF-10 Comandos de controle em sessão ativa são mensurados end-to-end; roteamento não é dependente de gravação síncrona em banco.
- RF-11 Cada usuário pode exportar e excluir dados conforme política de retenção aplicável.
- RF-12 Suportar atualização de app e migrações sem perda de histórico.

## 7. Requisitos não funcionais (SLOs aspiracionais verificáveis)
- API 99,9% disponibilidade mensal (exclui dependências BLE/celular; ajustar contratos SLA conforme provedor).
- Latência de API leitura p95 ≤350ms no mesmo continente, em ensaio controlado; writes p95 ≤700ms.
- Roteamento de evento WSS p95 ≤120ms *dentro do edge* com clientes e rede controlados; sem SLA global para BLE→atuador.
- Meta experimento WAN gesto→atuador p95 ≤400ms e p99 ≤800ms sob ambiente de teste definido, não compromisso antes das medições.
- Reconnect app após troca de rede em até 15s p95 em ensaio com Android suportado; dependência do OS.
- Ingestão sem duplicação lógica sob retries e desconexão: 100% de IDs tratados idempotentemente.
- RPO ≤24h para config/telemetria persistida; RTO ≤4h para falha recuperável de backend (definir backup e exercícios).
- WCAG 2.2 AA como objetivo de web; Android TalkBack/tamanho dinâmico.
- 0 vazamentos cross-tenant e 0 bypass de política em testes adversariais.
- Bateria e uso de rede mensurados em pelo menos 3 perfis de aparelho; alvos a estabelecer por testes reais, sem número inventado.

## 7.1 Novo requisito de produto — atualização da interface da Mi Band 3 no app
- **RF-13** Usuário deve poder selecionar um tema DeltaBots, pré-visualizar 128×80 monocromático, consultar compatibilidade, baixar pacote autenticado e instalar `.res` por BLE **sem usar outro app**, quando a revisão de hardware/firmware tiver suporte comprovado. Módulo obrigatório: `34-WEARABLE-UI-UPDATES.md`.
- **RF-14** Nunca disparar flash a partir da Cloudflare, de uma automação, IA, painel web ou notificação, sem confirmação local do proprietário no Android.
- **RF-15** Validar manifesto assinado, hash SHA-256, revogação, licença e versão antes de tocar o GATT; negar pacotes não homologados/variantes trocadas e não prometer rollback atômico.
- **RF-16** A app deve mostrar etapas de instalação, status verificado/inconclusivo, histórico e recuperação assistida. Arquivos `.fw` são operações separadas de laboratório, não temas regulares.
- **RF-17** O Console Cloudflare deve oferecer catálogo, editor visual, pipeline de release/review, associação a teste em hardware, distribuição R2 e auditoria. Os testes de hardware gateiam a publicação do tema, não a implementação de infraestrutura.
- **RF-18** Todos os requisitos F351–F390 e telas A65–A76 entram no produto final. Capabilities sem prova não podem ser marcadas `PASS`.

## 8. Critérios de pronto comercial
Todas as epics e jornadas completas executadas em staging; provas de hardware para features BLE anunciadas; funcionalidades condicionais rotuladas; SLOs ensaiados; threat model revisado; testes de acessibilidade e regressão; termos/privacidade LGPD, planilhas de consentimento; playbooks operacionais; release firmado. Referência: `20-ACCEPTANCE.md`.

**Complemento normativo v1.1:** consultar `docs/34-WEARABLE-UI-UPDATES.md`, `docs/35-THEME-STUDIO-PIPELINE.md`, `docs/36-BLE-THEME-OTA-PROTOCOL.md`, `docs/adr/0004-wearable-resource-vs-firmware.md`, `contracts/theme-manifest.schema.json`, `infra/migrations/0002_themes.sql`.
