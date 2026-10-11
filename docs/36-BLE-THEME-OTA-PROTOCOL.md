# 36 — Especificação BLE de atualização de recursos da Mi Band 3

## 1. Escopo e cautela
Este documento especifica uma **máquina de estados e um contrato seguro** para instalar recursos `.res` pelo Pulse Android. **Não é alegação de que conhecemos todos os opcodes GATT ou que o driver DeltaBots já consegue instalá-los.** A semântica exata (handshake, tamanho de bloco, ordem, checksum/CRC no transporte, commit, progress notifications, reboot) deve ser derivada de documentação/observação autorizada e **validada por versão de firmware e revisão de hardware**, nunca inventada.

A documentação do Gadgetbridge confirma que pacotes de recursos para Mi Band 3 podem ser instalados e alerta sobre risco de brick. Fontes e firmware têm procedimentos próprios. Não reutilizar código AGPLv3 sem decisão de licença.

## 2. API abstrata Kotlin
```kotlin
interface WearableResourceUpdater {
    suspend fun probe(device: BoundWearable): ResourceUpdateCapabilities
    suspend fun validate(packageFile: LocalVerifiedPackage, device: BoundWearable): CompatibilityResult
    fun install(request: ThemeInstallRequest): Flow<ThemeInstallEvent>
    suspend fun postCheck(device: BoundWearable, expected: ThemeManifest): PostCheckResult
    suspend fun safeAbort(attemptId: String): AbortResult  // UNSUPPORTED quando não provado
}

data class ThemeInstallRequest(
    val attemptId: String,
    val deviceId: String,
    val packageHashSha256: String,
    val manifestVersion: String,
    val localConsentReceiptId: String
)

sealed interface ThemeInstallEvent {
    data class Phase(val phase: String) : ThemeInstallEvent
    data class Progress(val confirmedBytes: Long, val totalBytes: Long) : ThemeInstallEvent
    data class Failure(val code: String, val recoveryHint: String) : ThemeInstallEvent
    data class Completed(val verified: Boolean, val evidenceId: String?) : ThemeInstallEvent
}
```

## 3. Máquina de estados de atualização
`IDLE → MANIFEST_FETCHED → VERIFIED_LOCAL → COMPATIBLE → PREFLIGHT_PASSED → AWAITING_LOCAL_CONFIRMATION → QUEUED → PREPARING_BLE → TRANSFERRING → DEVICE_PROCESSING → WAITING_RECONNECT → POSTCHECK → (VERIFIED_INSTALLED | TRANSFER_COMPLETE_UNVERIFIED | FAILED | RECOVERY_REQUIRED)`.

Qualquer estado antes de `TRANSFERRING` pode ser cancelado e voltar a `IDLE`; após envio de bytes ao wearable, abortar **somente** se o protocolo do firmware aceitar cancelamento seguro. Caso contrário, UI bloqueia cancelar, explica como manter BLE/energia e mantém o serviço. Após `process death`, marcar `INTERRUPTED`, recuperar journal e consultar status do dispositivo; não presumir retomada válida por offset.

## 4. Detalhes do pipeline BLE
- Um único `GattOperationScheduler` por wearable serializa writes/reads/subscribe, impede comandos de sensor/medição durante flash e mantém prioridade de estado do link; nenhum concorrente escreve no mesmo GATT durante OTA.
- `Preflight`: auth, bonding, battery, fingerprint de modelo/revisão/firmware, current resources version se disponível, capacidade `RESOURCE_FLASH`, assinatura, hashes, revogações e estado ARM `DISARMED`.
- `Prepare`: manter sessão BLE autorizada, inspecionar MTU efetivo e características aceitas, definir limites de fragmentação de acordo com *driver validado*. GATT write with response vs without response depende de protocolo; nunca usar valor arbitrário.
- `Transfer`: buffer de arquivo local verificado imutável; pacote dividido em fragmentos conforme negociação; retransmitir apenas em mensagens que o protocolo define como seguras/idempotentes; timeout e backoff limitados; evitar write flooding.
- `Progress`: contador de bytes/segmentos **ACK pelo dispositivo** (quando protocolo fornece ACK); se não, exibir 'Enviando...' indeterminado ou 'bytes enviados ao BLE' claramente, sem afirmar armazenamento no dispositivo.
- `Finalize`: comando de finalize/commit somente se documentado e confirmado pelo driver; aguardar resposta, eventual reboot e reconexão. Nunca deduzir sucesso de desconexão.
- `Postcheck`: reler recursos/firmware quando disponível, verificar leitura bateria e telemetria simples, solicitação voluntária do usuário para confirmar visualmente a skin; diferenciar verificação do pacote e simples sanidade de conectividade.
- `Journal`: gravar transições persistentes locais com monotonic clock, `attempt_id`, `device_fingerprint_pseudonym`, `release_id`, hash, confirmed bytes, firmware antes/depois, código de falha; upload metadados mínimos com autorização.

## 5. Regras de cancelamento, concorrência e recuperação
- Botão 'Cancelar' disponível apenas em preflight/download/fases provadamente canceláveis.
- Sem suporte do bootloader para resume, nunca reiniciar no offset suposto e jamais enviar payload de continuação presumida.
- Após falha: congelar operações de flash concorrentes e exigir novo reconhecimento de estado/compatibilidade; sugerir restauração somente com pacote original confiável e BLE operacional.
- Em `RECOVERY_REQUIRED`, parar tentativas automáticas, preservar logs, mostrar opções de suporte. Não prometer restauração garantida ou recuperação sem acesso BLE.
- Se sinal instável, solicitar aproximação; falha por bateria baixa ou falta de autorização não inicia envio.
- Processo OTA é local no Android; `WorkManager` apenas download/filas sem urgência, não carrega a transferência crítica em background sem um serviço conectado com política Android vigente. Notificação foreground descreve operação.

## 6. Quadro de capacidades
| Capability | Interpretacão |
|---|---|
| `RESOURCE_INSPECT` | ler/derivar versão e codename confiáveis |
| `RESOURCE_FLASH` | protocolo `.res` validado e driver apto |
| `RESOURCE_VERSION_READ` | ler versão instalada de modo confiável |
| `RESOURCE_SAFE_ABORT` | device aceita abort sem corrupção, testado |
| `RESOURCE_RESUME` | device/protocolo permite recomeçar em offset comprovado |
| `RESOURCE_REFLASH_STOCK` | reflash de recurso original compatível suportado |
| `FONT_FLASH` | gravação de fonte validada para firmware/idioma |
| `FIRMWARE_FLASH_LAB` | operação separada, somente conta laboratório/admin |

Use capability por **versão/revisão** e evidência de hardware, não flag estático por nome de modelo. `RESOURCE_SAFE_ABORT` e `RESOURCE_RESUME` são `UNVERIFIED` até ensaio direto, não assumidos verdadeiros.

## 7. Testes automatizados e hardware
- Fake GATT reproduz ACK normal, perda de ACK, duplicação, reorder, MTU variável, stack reset, disconnect no 1%, 50% e 99%, app kill, bateria crítica, checksum inválido, cancelamento, pacote revogado e ausência de recursos suficientes.
- Emulator não comprova OTA real. Hardware: cada variante suportada, diferentes firmwares homologados, pelo menos 10 instalações repetidas por combo em unidade de laboratório para sinais de regressão; número de repetições ajustado pelo engenheiro responsável conforme risco.
- Pós-update: 24h de observação do wearable em teste (conexão, sincronização de HR/sono/passos, notificações, autonomia), testes com original permitido e pacote DeltaBots, documentação de diferenças.
- Critérios de aceite: see `docs/20-ACCEPTANCE.md` and `docs/21-HARDWARE-VALIDATION.md`.

## 8. Protocolo de eventos de progresso para servidor
O Android reporta somente eventos da operação em `POST /devices/{deviceId}/theme-installations/{installationId}/events`. Corpo `contracts/theme-install-event.schema.json`. Server pode refletir ao Console por WSS `theme.install.updated` com metadados mínimos. O servidor **não** pode interagir diretamente com BLE, iniciar ou completar flash à distância. Cada evento tem sequence monotônica e idempotência; `VERIFIED_INSTALLED` só após checagem real.
