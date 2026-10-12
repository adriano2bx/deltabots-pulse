package com.deltabots.pulse.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.deltabots.pulse.data.local.CapabilityEntity
import com.deltabots.pulse.data.local.ConnectionEventEntity
import com.deltabots.pulse.data.local.DeviceDao
import com.deltabots.pulse.data.local.DeviceEntity
import com.deltabots.pulse.data.repo.UserPrefs
import com.deltabots.pulse.data.secure.BleKeyStore
import com.deltabots.pulse.device.miband3.MiBandProtocol
import com.deltabots.pulse.device.miband3.MiBandProtocol.AlertCategory
import com.deltabots.pulse.device.miband3.MiBandProtocol.AuthResponse
import com.deltabots.pulse.device.miband3.MiBandProtocol.DeviceEvent
import com.deltabots.pulse.device.miband3.MiBandUuids
import com.deltabots.pulse.domain.BleEvent
import com.deltabots.pulse.domain.BleSnapshot
import com.deltabots.pulse.domain.BleState
import com.deltabots.pulse.domain.BleStateMachine
import com.deltabots.pulse.domain.Capability
import com.deltabots.pulse.domain.CapabilityId
import com.deltabots.pulse.domain.CapabilityProber
import com.deltabots.pulse.domain.Evidence
import com.deltabots.pulse.domain.GattStatus
import com.deltabots.pulse.domain.Quality
import com.deltabots.pulse.domain.Reading
import com.deltabots.pulse.domain.ReadingKind
import com.deltabots.pulse.domain.ReadingValidator
import com.deltabots.pulse.domain.StepsNormalizer
import com.deltabots.pulse.domain.SupportState
import com.deltabots.pulse.domain.Ulid
import java.security.MessageDigest
import java.util.Calendar
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Destino das leituras coletadas (Room + outbox). */
fun interface ReadingSink {
    suspend fun record(readings: List<Reading>)
}

data class ScannedBand(val address: String, val name: String?, val rssi: Int) {
    val looksLikeMiBand: Boolean get() = name?.contains("band", ignoreCase = true) == true
}

data class BandUi(
    val ble: BleSnapshot = BleSnapshot(),
    val deviceId: String? = null,
    val name: String? = null,
    val battery: Int? = null,
    val charging: Boolean = false,
    val batteryAtMs: Long? = null,
    val steps: Int? = null,
    val meters: Int? = null,
    val calories: Int? = null,
    val stepsAtMs: Long? = null,
    val heartRate: Int? = null,
    val heartRateAtMs: Long? = null,
    val measuringHeartRate: Boolean = false,
    val continuousHeartRate: Boolean = false,
    val firmware: String? = null,
    val hardware: String? = null,
    val serial: String? = null,
    val awaitingTap: Boolean = false,
    val findingPhone: Boolean = false,
    val capabilities: List<Capability> = emptyList(),
    val lastError: String? = null,
) {
    val state: BleState get() = ble.state
    val isReady: Boolean get() = ble.state == BleState.READY || ble.state == BleState.SYNCING || ble.state == BleState.STREAMING
}

data class BleLogLine(val atMs: Long, val text: String, val fromBand: Boolean)

/**
 * Conexão com a Mi Band 3 (protocolo Huami validado em hardware: base UUID …-3512-2118-0009af100700,
 * autenticação com flag 0x00, perfil enviado após autenticar). Toda operação roda na thread principal.
 * Nada é "SUPPORTED" sem evidência do próprio aparelho (docs/05).
 */
@SuppressLint("MissingPermission")
class Miband3Connection(
    private val context: Context,
    private val keys: BleKeyStore,
    private val devices: DeviceDao,
    private val sink: ReadingSink,
    private val prefsProvider: () -> UserPrefs,
) {
    companion object {
        private const val TAG = "Miband3Connection"
        const val DRIVER_VERSION = "miband3-1.1"
        private const val SCAN_MS = 15_000L
        private const val DISCOVERY_TIMEOUT_MS = 15_000L
        private const val HR_PING_MS = 12_000L
        private const val MAX_LOG = 200
    }

    private val handler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val queue = GattQueue(handler) { log(it, false) }
    private val machine = BleStateMachine()
    private val steps = StepsNormalizer()

    private val _ui = MutableStateFlow(BandUi())
    val ui: StateFlow<BandUi> = _ui.asStateFlow()
    private val _scan = MutableStateFlow<List<ScannedBand>>(emptyList())
    val scanResults: StateFlow<List<ScannedBand>> = _scan.asStateFlow()
    private val _scanning = MutableStateFlow(false)
    val scanning: StateFlow<Boolean> = _scanning.asStateFlow()
    private val _log = MutableStateFlow<List<BleLogLine>>(emptyList())
    val log: StateFlow<List<BleLogLine>> = _log.asStateFlow()

    private var gatt: BluetoothGatt? = null
    private var address: String? = null
    private var deviceId: String? = null
    private var firmwareCache: String? = null
    private val observed = mutableSetOf<CapabilityId>()
    private var triedSendingKey = false
    private var ringtone: Ringtone? = null
    private var scanCallback: ScanCallback? = null
    var onStateChanged: ((BandUi) -> Unit)? = null

    private val adapter: BluetoothAdapter? get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
    val bluetoothEnabled: Boolean get() = adapter?.isEnabled == true

    init {
        machine.reduce(BleEvent.Initialize, now())
    }

    private fun now() = System.currentTimeMillis()

    private fun emit(transform: (BandUi) -> BandUi) {
        _ui.update { transform(it).copy(ble = machine.snapshot) }
        onStateChanged?.invoke(_ui.value)
    }

    private fun reduce(e: BleEvent) {
        machine.reduce(e, now())
        emit { it }
    }

    fun log(text: String, fromBand: Boolean) {
        Log.i(TAG, text)
        _log.update { (it + BleLogLine(now(), mask(text), fromBand)).takeLast(MAX_LOG) }
    }

    /** Endereços BLE nunca vão para logs exportáveis (docs/12). */
    private fun mask(text: String) = text.replace(Regex("([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}"), "xx:xx:xx:xx:xx:xx")

    fun permissionGranted(granted: Boolean) = reduce(BleEvent.PermissionResult(granted))

    // =============================================================== varredura
    private val stopScanRunnable = Runnable { stopScan() }

    fun startScan() {
        val scanner = adapter?.bluetoothLeScanner ?: return log("Bluetooth indisponível", false)
        stopScan()
        _scan.value = emptyList()
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val name = result.scanRecord?.deviceName ?: result.device.name
                val d = ScannedBand(result.device.address, name, result.rssi)
                _scan.update { list ->
                    (list.filterNot { it.address == d.address } + d)
                        .sortedWith(compareByDescending<ScannedBand> { it.looksLikeMiBand }.thenByDescending { it.rssi })
                }
            }

            override fun onScanFailed(errorCode: Int) {
                log("Falha na varredura (código $errorCode)", false)
                _scanning.value = false
            }
        }
        scanCallback = cb
        scanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
        _scanning.value = true
        handler.postDelayed(stopScanRunnable, SCAN_MS)
    }

    fun stopScan() {
        handler.removeCallbacks(stopScanRunnable)
        scanCallback?.let { runCatching { adapter?.bluetoothLeScanner?.stopScan(it) } }
        scanCallback = null
        _scanning.value = false
    }

    // =============================================================== conexão
    fun connect(addr: String, name: String?) {
        stopScan()
        handler.post {
            address = addr
            deviceId = fingerprint(addr)
            observed.clear()
            reduce(BleEvent.PermissionResult(true))
            if (machine.snapshot.state == BleState.SCANNING || machine.snapshot.state == BleState.DEVICE_FOUND) machine.reduce(BleEvent.Connect, now()) else machine.reduce(BleEvent.Connect, now())
            emit { it.copy(deviceId = deviceId, name = name ?: it.name, lastError = null, awaitingTap = false) }
            openGatt(addr)
        }
    }

    /** Fingerprint pseudônimo estável; o endereço bruto nunca sai do aparelho. */
    fun fingerprint(addr: String): String =
        MessageDigest.getInstance("SHA-256").digest("pulse-device:$addr".toByteArray()).joinToString("") { "%02x".format(it) }.take(40)

    private fun openGatt(addr: String) {
        handler.removeCallbacks(reconnectRunnable)
        closeGatt()
        val a = adapter ?: return
        val device = runCatching { a.getRemoteDevice(addr) }.getOrElse { return log("Endereço inválido", false) }
        triedSendingKey = false
        log("Conectando…", false)
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        queue.gatt = gatt
    }

    fun disconnect() {
        handler.post {
            handler.removeCallbacks(reconnectRunnable)
            handler.removeCallbacks(hrPing)
            handler.removeCallbacks(discoveryTimeout)
            closeGatt()
            reduce(BleEvent.UserDisconnect)
            emit { it.copy(measuringHeartRate = false, continuousHeartRate = false, awaitingTap = false) }
            record("disconnected", null, "user")
            log("Desconectado", false)
        }
    }

    /** Esquecer a pulseira: remove vínculo, chave e dados de autorização deste dispositivo. */
    suspend fun forget(id: String) {
        disconnect()
        keys.forget(id)
        devices.delete(id)
        emit { BandUi(ble = machine.snapshot) }
    }

    private fun closeGatt() {
        queue.clear()
        gatt?.let { runCatching { it.disconnect(); it.close() } }
        gatt = null
        queue.gatt = null
    }

    private val reconnectRunnable = Runnable {
        val addr = address
        if (machine.snapshot.userWantsConnection && addr != null && machine.snapshot.state == BleState.DISCONNECTED) {
            machine.reduce(BleEvent.Connect, now())
            emit { it }
            openGatt(addr)
        }
    }

    private val discoveryTimeout = Runnable {
        log("A pulseira não respondeu à descoberta de serviços", false)
        gatt?.let { refreshCache(it); it.disconnect() }
    }

    private fun refreshCache(g: BluetoothGatt) {
        runCatching { g.javaClass.getMethod("refresh").invoke(g) }
    }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            handler.post {
                if (g != gatt) return@post
                when (newState) {
                    BluetoothProfile.STATE_CONNECTED -> {
                        reduce(BleEvent.GattConnected)
                        g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
                        if (machine.snapshot.failedAttempts >= 2) refreshCache(g)
                        handler.postDelayed({
                            if (g == gatt) {
                                if (!g.discoverServices()) log("Não foi possível iniciar a descoberta de serviços", false)
                                handler.postDelayed(discoveryTimeout, DISCOVERY_TIMEOUT_MS)
                            }
                        }, 600)
                    }
                    BluetoothProfile.STATE_DISCONNECTED -> onDisconnected(status)
                }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            handler.post {
                if (g != gatt) return@post
                handler.removeCallbacks(discoveryTimeout)
                if (status != BluetoothGatt.GATT_SUCCESS || g.services.isNullOrEmpty()) {
                    log("Falha ao descobrir serviços (código $status)", false)
                    refreshCache(g)
                    g.disconnect()
                    return@post
                }
                log("${g.services.size} serviços encontrados", false)
                reduce(BleEvent.ServicesDiscovered)
                startAuthentication()
            }
        }

        override fun onCharacteristicRead(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
            val copy = value.copyOf()
            handler.post { if (status == BluetoothGatt.GATT_SUCCESS) handleData(ch.uuid, copy); queue.completeCurrent() }
        }

        @Deprecated("Android ≤ 12")
        @Suppress("DEPRECATION")
        override fun onCharacteristicRead(g: BluetoothGatt, ch: BluetoothGattCharacteristic, status: Int) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
            val copy = ch.value?.copyOf() ?: ByteArray(0)
            handler.post { if (status == BluetoothGatt.GATT_SUCCESS) handleData(ch.uuid, copy); queue.completeCurrent() }
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, ch: BluetoothGattCharacteristic, status: Int) {
            handler.post {
                if (status != BluetoothGatt.GATT_SUCCESS) log("Falha na escrita (código $status)", false)
                queue.completeCurrent()
            }
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
            handler.post {
                if (status != BluetoothGatt.GATT_SUCCESS) log("Falha ao ativar notificações (código $status)", false)
                queue.completeCurrent()
            }
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
            val copy = value.copyOf()
            handler.post { handleData(ch.uuid, copy) }
        }

        @Deprecated("Android ≤ 12")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
            val copy = ch.value?.copyOf() ?: return
            handler.post { handleData(ch.uuid, copy) }
        }
    }

    private fun onDisconnected(status: Int) {
        handler.removeCallbacks(discoveryTimeout)
        handler.removeCallbacks(hrPing)
        closeGatt()
        val wasWanted = machine.snapshot.userWantsConnection
        val snap = machine.reduce(BleEvent.Disconnected(status), now())
        emit { it.copy(measuringHeartRate = false, continuousHeartRate = false, awaitingTap = false, lastError = snap.giveUpReason) }
        log("Conexão perdida (código $status)", false)
        record("disconnected", status, GattStatus.explain(status))
        if (!wasWanted) return
        val delay = snap.nextRetryDelayMs
        if (snap.state == BleState.ERROR || delay == null) {
            log("Não foi possível conectar. ${snap.giveUpReason.orEmpty()}", false)
        } else {
            log("Tentando reconectar em ${delay / 1000}s…", false)
            handler.postDelayed(reconnectRunnable, delay)
        }
    }

    // =============================================================== autenticação
    private fun startAuthentication() {
        val id = deviceId ?: return
        if (queue.findCharacteristic(MiBandUuids.CHAR_AUTH) == null) {
            val services = describeServices()
            log("Sem característica de autenticação da Mi Band. Serviços:\n$services", false)
            emit { it.copy(lastError = "O dispositivo não tem o serviço de autenticação Xiaomi/Huami: não é uma Mi Band 3 original.\n\n$services") }
            reduce(BleEvent.Failure("não é uma Mi Band 3 original"))
            gatt?.disconnect()
            return
        }
        queue.enqueue(GattQueue.Op.Notify(MiBandUuids.CHAR_AUTH))
        if (keys.isAuthorized(id)) {
            log("Autenticando com a chave salva…", false)
            queue.enqueue(GattQueue.Op.Write(MiBandUuids.CHAR_AUTH, MiBandProtocol.authRequestRandom(), noResponse = true))
        } else sendAuthKey()
    }

    private fun describeServices(): String {
        fun short(u: UUID): String = u.toString().let { if (it.endsWith("-0000-1000-8000-00805f9b34fb") && it.startsWith("0000")) it.substring(4, 8) else it }
        return gatt?.services.orEmpty().joinToString("\n") { s -> "• ${short(s.uuid)}: " + s.characteristics.joinToString(", ") { short(it.uuid) } }
    }

    private fun sendAuthKey() {
        triedSendingKey = true
        emit { it.copy(awaitingTap = true) }
        log("Pareando: toque na tela da pulseira quando ela vibrar para confirmar.", false)
        queue.enqueue(GattQueue.Op.Write(MiBandUuids.CHAR_AUTH, MiBandProtocol.authSendKey(keys.key()), noResponse = true))
    }

    private fun handleAuth(data: ByteArray) {
        val id = deviceId ?: return
        when (val r = MiBandProtocol.parseAuthResponse(data)) {
            AuthResponse.KeyAccepted -> {
                emit { it.copy(awaitingTap = false) }
                keys.setAuthorized(id, true)
                log("Chave aceita pela pulseira", true)
                queue.enqueue(GattQueue.Op.Write(MiBandUuids.CHAR_AUTH, MiBandProtocol.authRequestRandom(), noResponse = true))
            }
            AuthResponse.KeyRejected -> {
                emit { it.copy(awaitingTap = false, lastError = "A pulseira recusou a chave. Desvincule-a do Mi Fit/Zepp Life ou reinicie-a de fábrica.") }
                reduce(BleEvent.Failure("chave recusada"))
                gatt?.disconnect()
            }
            is AuthResponse.RandomReceived -> {
                log("Desafio recebido, respondendo…", true)
                queue.enqueue(GattQueue.Op.Write(MiBandUuids.CHAR_AUTH, MiBandProtocol.authSendEncrypted(r.random, keys.key()), noResponse = true))
            }
            AuthResponse.RandomFailed, AuthResponse.AuthFailed -> {
                keys.setAuthorized(id, false)
                if (!triedSendingKey) {
                    log("Chave salva inválida, pareando novamente…", false)
                    sendAuthKey()
                } else {
                    emit { it.copy(lastError = "Falha na autenticação.") }
                    reduce(BleEvent.Failure("autenticação falhou"))
                    gatt?.disconnect()
                }
            }
            AuthResponse.Authenticated -> onAuthenticated()
            null -> Unit
        }
    }

    private fun onAuthenticated() {
        reduce(BleEvent.Authenticated)
        observed += CapabilityId.AUTH
        log("Autenticado! Pulseira pronta.", true)
        listOf(MiBandUuids.CHAR_DEVICE_EVENT, MiBandUuids.CHAR_CONFIG, MiBandUuids.CHAR_STEPS, MiBandUuids.CHAR_BATTERY, MiBandUuids.CHAR_HR_MEASUREMENT)
            .forEach { queue.enqueue(GattQueue.Op.Notify(it)) }
        syncTime()
        applyProfile(prefsProvider())
        listOf(MiBandUuids.CHAR_BATTERY, MiBandUuids.CHAR_STEPS, MiBandUuids.CHAR_FIRMWARE, MiBandUuids.CHAR_HARDWARE, MiBandUuids.CHAR_SERIAL)
            .forEach { queue.enqueue(GattQueue.Op.Read(it)) }
        queue.enqueue(GattQueue.Op.Action { handler.post { onProbed() } })
    }

    private fun onProbed() {
        val id = deviceId ?: return
        val chars = gatt?.services.orEmpty().flatMap { s -> s.characteristics.map { it.uuid.toString() } }.toSet()
        val persisted = persistedSupported
        val caps = CapabilityProber.probe(Evidence(chars, observed + persisted), firmwareCache, DRIVER_VERSION, now())
        reduce(BleEvent.CapabilitiesProbed)
        emit { it.copy(capabilities = caps) }
        persistDevice()
        scope.launch { devices.upsertCapabilities(caps.map { it.toEntity(id) }) }
    }

    private var persistedSupported: Set<CapabilityId> = emptySet()

    /** Carrega do banco as capacidades já comprovadas (por confirmação do usuário ou uso real) neste firmware. */
    suspend fun loadPersistedEvidence(id: String) {
        val saved = devices.capabilities(id).first()
        persistedSupported = saved.filter { it.state == SupportState.SUPPORTED.name }.mapNotNull { e -> CapabilityId.entries.firstOrNull { it.name == e.capability } }.toSet()
    }

    private fun Capability.toEntity(deviceId: String) = CapabilityEntity(deviceId, id.name, state.name, firmware, driverVersion, verifiedAtMs, testArtifact, limitations, reported = false)

    /** Confirmação humana de capacidades que não geram retorno verificável (vibração/mensagem/alarme perceptíveis). */
    fun confirmByUser(id: CapabilityId) {
        observed += id
        persistedSupported = persistedSupported + id
        val chars = gatt?.services.orEmpty().flatMap { s -> s.characteristics.map { it.uuid.toString() } }.toSet()
        val caps = CapabilityProber.probe(Evidence(chars, observed + persistedSupported), firmwareCache, DRIVER_VERSION, now())
        emit { it.copy(capabilities = caps) }
        val dev = deviceId ?: return
        scope.launch { devices.upsertCapabilities(caps.map { it.toEntity(dev) }) }
    }

    private fun persistDevice() {
        val id = deviceId ?: return
        val addr = address ?: return
        val ui = _ui.value
        scope.launch {
            val prev = devices.byId(id)
            devices.upsert(
                DeviceEntity(
                    id = id, address = addr, name = ui.name ?: prev?.name, model = "Mi Band 3",
                    firmware = ui.firmware ?: prev?.firmware, hardware = ui.hardware ?: prev?.hardware, serial = ui.serial ?: prev?.serial,
                    fingerprint = id, serverDeviceId = prev?.serverDeviceId, pairedAtMs = prev?.pairedAtMs ?: now(), authorized = keys.isAuthorized(id),
                ),
            )
        }
    }

    // =============================================================== dados
    private fun handleData(uuid: UUID, data: ByteArray) {
        when (uuid) {
            MiBandUuids.CHAR_AUTH -> handleAuth(data)
            MiBandUuids.CHAR_BATTERY -> MiBandProtocol.parseBattery(data)?.let { b ->
                observed += CapabilityId.BATTERY
                emit { it.copy(battery = b.level, charging = b.charging, batteryAtMs = now()) }
                record(ReadingKind.BATTERY, b.level.toDouble())
            }
            MiBandUuids.CHAR_STEPS -> MiBandProtocol.parseSteps(data)?.let { a ->
                observed += CapabilityId.STEPS_REALTIME
                emit { it.copy(steps = a.steps, meters = a.meters ?: it.meters, calories = a.calories ?: it.calories, stepsAtMs = now()) }
                record(ReadingKind.STEPS_TOTAL, a.steps.toDouble())
                steps.next(a.steps)?.let { s -> if (s.delta > 0) record(ReadingKind.STEPS_DELTA, s.delta.toDouble()) }
            }
            MiBandUuids.CHAR_HR_MEASUREMENT -> MiBandProtocol.parseHeartRate(data)?.let { bpm ->
                if (bpm <= 0) return@let
                observed += if (_ui.value.continuousHeartRate) CapabilityId.HR_CONTINUOUS else CapabilityId.HR_ON_DEMAND
                emit { it.copy(heartRate = bpm, heartRateAtMs = now(), measuringHeartRate = it.continuousHeartRate) }
                record(ReadingKind.HEART_RATE, bpm.toDouble())
            }
            MiBandUuids.CHAR_DEVICE_EVENT -> onDeviceEvent(data)
            MiBandUuids.CHAR_FIRMWARE -> text(data).let { v -> firmwareCache = v; observed += CapabilityId.DEVICE_INFO; emit { it.copy(firmware = v) }; persistDevice() }
            MiBandUuids.CHAR_HARDWARE -> text(data).let { v -> emit { it.copy(hardware = v) }; persistDevice() }
            MiBandUuids.CHAR_SERIAL -> text(data).let { v -> emit { it.copy(serial = v) }; persistDevice() }
            else -> Log.d(TAG, "dados de $uuid")
        }
    }

    private fun text(d: ByteArray) = d.decodeToString().trim('\u0000')

    private fun onDeviceEvent(data: ByteArray) {
        val e = DeviceEvent.fromData(data) ?: return log("Evento desconhecido", true)
        when (e) {
            DeviceEvent.FIND_PHONE_START -> { observed += CapabilityId.FIND_PHONE; startFindPhone() }
            DeviceEvent.FIND_PHONE_STOP -> stopFindPhone()
            DeviceEvent.BUTTON_PRESSED, DeviceEvent.BUTTON_PRESSED_LONG -> observed += CapabilityId.BUTTON_EVENTS
            DeviceEvent.TICK_30MIN -> return
            else -> Unit
        }
        log(e.description, true)
    }

    /** Persiste a leitura (histórico + outbox) com id estável gerado no momento da coleta. */
    private fun record(kind: ReadingKind, value: Double) {
        val id = deviceId ?: return
        val q = ReadingValidator.qualityFor(kind, value)
        val r = Reading(Ulid.generate(), id, kind, now(), value, null, q, "ble_miband3", firmwareCache)
        scope.launch { sink.record(listOf(r)) }
    }

    private fun record(state: String, status: Int?, reason: String?) {
        val id = deviceId ?: return
        scope.launch { devices.addEvent(ConnectionEventEntity(deviceId = id, state = state, status = status, reason = reason, atMs = now())) }
        val r = Reading(Ulid.generate(), id, ReadingKind.CONNECTION, now(), null, state, Quality.MEASURED, "ble_miband3", firmwareCache)
        scope.launch { sink.record(listOf(r)) }
    }

    // =============================================================== procurar celular
    private fun startFindPhone() {
        emit { it.copy(findingPhone = true) }
        if (ringtone?.isPlaying == true) return
        val uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ringtone = RingtoneManager.getRingtone(context, uri)?.also {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) it.isLooping = true
            it.play()
        }
    }

    fun stopFindPhone() {
        ringtone?.stop()
        ringtone = null
        emit { it.copy(findingPhone = false) }
    }

    // =============================================================== comandos
    private fun write(uuid: UUID, value: ByteArray, noResponse: Boolean = false) = handler.post { queue.enqueue(GattQueue.Op.Write(uuid, value, noResponse)) }
    private fun read(uuid: UUID) = handler.post { queue.enqueue(GattQueue.Op.Read(uuid)) }
    private fun requireReady(): Boolean = _ui.value.isReady.also { if (!it) log("A pulseira não está conectada", false) }

    fun vibrate() {
        if (!requireReady()) return
        write(MiBandUuids.CHAR_ALERT_LEVEL, byteArrayOf(MiBandProtocol.AlertLevel.HIGH), noResponse = true)
        log("Vibrar", false)
    }

    fun sendText(title: String, body: String, icon: Int = MiBandProtocol.Icon.APP) {
        if (!requireReady()) return
        write(MiBandUuids.CHAR_NEW_ALERT, MiBandProtocol.newAlert(AlertCategory.CUSTOM_HUAMI, title, body, icon))
        log("[mensagem] ${title.take(24)}", false)
    }

    fun sendSms(title: String, body: String) {
        if (!requireReady()) return
        write(MiBandUuids.CHAR_NEW_ALERT, MiBandProtocol.newAlert(AlertCategory.SMS, title, body))
        log("[SMS] ${title.take(24)}", false)
    }

    fun sendCall(caller: String) {
        if (!requireReady()) return
        write(MiBandUuids.CHAR_NEW_ALERT, MiBandProtocol.newAlert(AlertCategory.INCOMING_CALL, caller))
        log("[chamada simulada]", false)
    }

    fun stopCall() {
        if (!requireReady()) return
        write(MiBandUuids.CHAR_NEW_ALERT, MiBandProtocol.stopCallAlert())
        write(MiBandUuids.CHAR_ALERT_LEVEL, byteArrayOf(MiBandProtocol.AlertLevel.NONE), noResponse = true)
    }

    fun refresh() {
        if (!requireReady()) return
        read(MiBandUuids.CHAR_STEPS)
        read(MiBandUuids.CHAR_BATTERY)
    }

    fun syncTime() {
        if (machine.snapshot.state == BleState.DISCONNECTED || machine.snapshot.state == BleState.ERROR) return
        write(MiBandUuids.CHAR_CURRENT_TIME, MiBandProtocol.currentTime(Calendar.getInstance()))
    }

    fun applyProfile(p: UserPrefs) {
        write(MiBandUuids.CHAR_USER_SETTINGS, MiBandProtocol.userInfo(p.birthYear, 1, 1, p.gender, p.heightCm, p.weightKg, userId()))
        write(MiBandUuids.CHAR_USER_SETTINGS, MiBandProtocol.wearLocation(p.leftWrist))
        write(MiBandUuids.CHAR_USER_SETTINGS, MiBandProtocol.stepGoal(p.stepGoal))
        write(MiBandUuids.CHAR_CONFIG, MiBandProtocol.timeFormat24h(true))
        write(MiBandUuids.CHAR_CONFIG, MiBandProtocol.liftWristToActivate(true))
        write(MiBandUuids.CHAR_CONFIG, MiBandProtocol.distanceMetric())
    }

    private fun userId(): Int = (deviceId ?: "pulse").hashCode() and 0x7fffffff

    fun setAlarm(slot: Int, enabled: Boolean, hour: Int, minute: Int, days: Int) {
        if (!requireReady()) return
        write(MiBandUuids.CHAR_CONFIG, MiBandProtocol.alarm(slot, enabled, hour, minute, days))
        log("Alarme ${slot + 1} %02d:%02d ${if (enabled) "ativado" else "desativado"}".format(hour, minute), false)
    }

    fun measureHeartRate() {
        if (!requireReady()) return
        emit { it.copy(measuringHeartRate = true) }
        write(MiBandUuids.CHAR_HR_CONTROL, MiBandProtocol.HR_STOP_CONTINUOUS)
        write(MiBandUuids.CHAR_HR_CONTROL, MiBandProtocol.HR_STOP_MANUAL)
        write(MiBandUuids.CHAR_HR_CONTROL, MiBandProtocol.HR_START_MANUAL)
        log("Medindo frequência cardíaca… mantenha a pulseira firme no pulso", false)
        handler.postDelayed({ if (!_ui.value.continuousHeartRate) emit { it.copy(measuringHeartRate = false) } }, 30_000)
    }

    fun setContinuousHeartRate(enabled: Boolean) {
        if (!requireReady()) return
        emit { it.copy(continuousHeartRate = enabled, measuringHeartRate = enabled) }
        if (enabled) {
            write(MiBandUuids.CHAR_HR_CONTROL, MiBandProtocol.HR_STOP_MANUAL)
            write(MiBandUuids.CHAR_HR_CONTROL, MiBandProtocol.HR_START_CONTINUOUS)
            handler.postDelayed(hrPing, HR_PING_MS)
        } else {
            handler.removeCallbacks(hrPing)
            write(MiBandUuids.CHAR_HR_CONTROL, MiBandProtocol.HR_STOP_CONTINUOUS)
        }
    }

    private val hrPing = object : Runnable {
        override fun run() {
            if (!_ui.value.isReady || !_ui.value.continuousHeartRate) return
            queue.enqueue(GattQueue.Op.Write(MiBandUuids.CHAR_HR_CONTROL, MiBandProtocol.HR_PING))
            handler.postDelayed(this, HR_PING_MS)
        }
    }

    /** Reconexão automática para a pulseira salva (usada pelo serviço de gateway). */
    suspend fun connectSaved(): Boolean {
        val d = devices.first() ?: return false
        loadPersistedEvidence(d.id)
        connect(d.address, d.name)
        return true
    }

    /** Sincroniza hora e dados periodicamente (SyncMode). */
    fun periodicSync() {
        if (!_ui.value.isReady) return
        handler.post { syncTime(); refresh() }
    }
}
