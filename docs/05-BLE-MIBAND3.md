# 05 — Protocolo BLE Mi Band 3 / validação por capabilities

## Situação comprovada / não comprovada
- Comprovado por existência de suporte open source: integração BLE com Mi Band 3 e família Huami em Gadgetbridge; NÃO infere que nosso driver proprietário esteja pronto.
- Documentado em código da família Huami: características `RAW_SENSOR_CONTROL` = `00000001-0000-3512-2118-0009af100700` e `RAW_SENSOR_DATA` = `00000002-0000-3512-2118-0009af100700`.
- **Não confirmado para Mi Band 3 específica:** disponibilidade de stream contínuo, frequência, semântica dos bytes, estabilidade, firmware, autenticação, botão exposto, feedback de vibração personalizado. GATT discovery e teste in loco são condição para habilitação.
- Mi Band 3 não mede glicose/pressão e não tem GPS próprio/giroscópio independente; app não inventará métricas.

## API abstrata do driver
```kotlin
interface WearableDriver {
  val capabilities: StateFlow<DeviceCapabilities>
  suspend fun discover(): List<DiscoveredDevice>
  suspend fun connect(deviceId: String): ConnectionResult
  suspend fun authenticate(credentialRef: SecureCredentialRef): AuthResult
  suspend fun readBattery(): Measurement<Int>?
  suspend fun syncActivity(cursor: Cursor?): Page<ActivityReading>
  suspend fun syncHeartRate(cursor: Cursor?): Page<HeartRateReading>
  suspend fun syncSleep(cursor: Cursor?): Page<SleepReading>
  suspend fun vibrate(pattern: SupportedVibration): Result<Unit>
  fun liveSensorStream(): Flow<SensorFrame> // throws CapabilityUnavailable where unproved
  suspend fun disconnect()
}
```

## Capability document
Cada capability tem `id`, `support_state` (`SUPPORTED|UNSUPPORTED|UNVERIFIED|TEMPORARILY_UNAVAILABLE`), `firmware`, `driver_version`, `verified_at`, `test_artifact`, `sample_rate_hz`, `battery_impact`, `limitations`. API e UI devem consultar capability efetiva por dispositivo/firmware, nunca usar um `supportsMiBand3=true` global.

## Reconhecimento de dispositivos
Scan com filtros por service UUID/manufacturer quando documentados, mas não exclusivamente por nome; lidar com clones, MAC random, BLE bonding e limites do Android. Identidade local baseada em identificador protegido, fingerprint de serviços e associação. Evitar coletar MAC bruto no backend; converter pseudônimo por gateway.

## Processo de autenticação
Determinar, por firmware, se requer chave de autenticação e processo oficial. Aceitar chave obtida legitimamente pelo titular, via fluxo autorizado; jamais exigir credenciais Xiaomi dentro do Pulse, interceptar credenciais, burlar segurança ou forçar firmware. Se pareamento não autorizado não for possível, mostrar instrução e capability block.

## Coleta
- Frequência cardíaca: distinguir leitura imediata/intervalada/histórica. Capturar timestamp de medição e qualidade; não assumir stream contínuo.
- Passos: tratar contadores acumulados, reboot/reset, períodos, fusos e duplicações.
- Sono: intervalos/proveniência do algoritmo/qualidade; não categorizar REM com confiança médica.
- Bateria, firmware e alertas: derivar apenas do que o serviço GATT suportar.
- Acelerômetro: mapear payload bruto apenas por experimento com logs sintéticos/reais consentidos; quando disponível, registrar eixos, unidade, taxa, timestamp monotônico e perdas.

## Discovery e experimento RAW
1. Documentar modelo e firmware sem identificador pessoal.
2. Escanear serviços, características, propriedades CCCD, permissões e MTU.
3. Confirmar autenticação e rotina de subscribe; usar captura local com consentimento.
4. Tentar START/STOP de stream apenas com comandos seguros conhecidos; não emitir bytes aleatórios ao hardware.
5. Capturar ≥10 minutos em repouso e padrões de movimento; medir Hz, jitter, perdas, consumo e desconexões.
6. Reiniciar app/BLE, repetir 3 vezes e verificar reprodutibilidade.
7. Comparar amostras com IMU de referência conhecida para mapear eixos; documentar proveniência.
8. Registrar decisão `SUPPORTED` ou `UNSUPPORTED/UNVERIFIED`, vídeo/log anônimo e versão do firmware.
9. Nunca habilitar Gesture Control por padrão se a capacidade não estiver comprovada.

## Licença
Gadgetbridge é AGPLv3. Referências técnicas, inspeção de interoperabilidade e implementação original documentada são preferidas. Qualquer cópia/adaptação exige parecer sobre licença e obrigações de disponibilização do código correspondente. Não incorporar classes Gadgetbridge diretamente no produto fechado por padrão.

## Atualização de recursos gráficos `.res` e `.ft` pelo Android
Existem evidências públicas de instalação de recursos na Mi Band 3, mas **nosso driver ainda precisa validar o protocolo OTA por revisão e firmware reais**. Adicionar interface `WearableResourceUpdater`, capability `RESOURCE_FLASH`, `RESOURCE_VERSION_READ`, `RESOURCE_SAFE_ABORT`, `RESOURCE_RESUME`, `RESOURCE_REFLASH_STOCK` e `FONT_FLASH`; todas evidenciadas por modelo+revisão+firmware. Suportar `wuhan`, `hankou`, `chongqing` de acordo com documentação verificada, sem inferir variante pelo nome comercial. Não permitir upload de firmware `.fw` no fluxo de temas. `34-WEARABLE-UI-UPDATES.md` e `36-BLE-THEME-OTA-PROTOCOL.md` são normativos. Referência de compatibilidade: https://gadgetbridge.org/internals/specifics/mi-band-3/. O risco de brick é real; nunca forçar flashing em aparelho não homologado.
