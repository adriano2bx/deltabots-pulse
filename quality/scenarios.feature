# Gherkin — roteiros de aceite físico/funcional (vincular a testes automatizados)
Feature: Gateway e telemetria segura
  Scenario: Sincronização offline idempotente
    Given um usuário autenticado e um dispositivo associado
    And a rede móvel está indisponível
    When três medições válidas são coletadas
    Then as medições entram na outbox local
    When a rede retorna e o app envia o lote duas vezes
    Then o servidor deve persistir cada reading_id apenas uma vez
    And o app deve remover somente itens aceitos

  Scenario: Revogação imediata de acesso de familiar
    Given um familiar com grant de leitura de sono
    And o familiar está conectado via WebSocket
    When o titular revoga o compartilhamento
    Then o servidor deve interromper o envio de dados desse escopo
    And a interface do familiar deve invalidar cache e ocultar o conteúdo

Feature: Controle remoto físico seguro
  Scenario: Comando sem sessão armada
    Given um equipamento de bancada elegível mas DISARMED
    When um gesto de alta confiança chega pelo WebSocket
    Then o sistema deve responder CONTROL_DISARMED
    And nenhum comando deve ser encaminhado para o equipamento

  Scenario: Watchdog com falha de rede
    Given um ESP32 com sessão ARMADA e saída ativa
    When o link WSS/MQTT deixa de receber comandos válidos
    Then o ESP32 deve neutralizar a saída antes do watchdog limite
    And a retomada de rede não deve reexecutar comandos expirados

  Scenario: Firmware sem acelerômetro bruto comprovado
    Given uma Mi Band 3 cuja capability raw_accel_stream está UNVERIFIED
    When o usuário abre o laboratório de gestos
    Then a UI deve mostrar capability indisponível na pulseira
    And a API deve recusar sessão CONTROL_ARMED baseada nessa capability
    And pode oferecer sensor Android de laboratório claramente rotulado

  Scenario: Replay por MQTT
    Given um comando válido já executado no dispositivo de demonstração
    When o broker entrega novamente o mesmo command_id
    Then a operação não deve ocorrer novamente
    And o gateway deve retornar o ACK anterior

Feature: Dados pessoais e IA
  Scenario: Dados sem consentimento para IA
    Given o usuário revogou ai_analysis
    When o assistente recebe uma pergunta sobre batimentos
    Then o backend deve negar acesso a dados sensíveis
    And a UI deve pedir consentimento válido sem exibir histórico

  Scenario: Uma organização não acessa saúde por papel admin
    Given um org_admin e um membro com telemetria privada
    When o admin tenta consultar histórico do membro
    Then a API deve negar sem grant específico do titular
