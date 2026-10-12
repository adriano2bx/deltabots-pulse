package com.deltabots.pulse.domain

/** Estados do ciclo de vida BLE (docs/04). */
enum class BleState {
    UNINITIALIZED, PERMISSION_REQUIRED, SCANNING, DEVICE_FOUND, CONNECTING, DISCOVERING_SERVICES,
    AUTHENTICATING, CAPABILITY_PROBING, READY, SYNCING, STREAMING, DISCONNECTED, ERROR,
}

sealed interface BleEvent {
    data object Initialize : BleEvent
    data class PermissionResult(val granted: Boolean) : BleEvent
    data object StartScan : BleEvent
    data object DeviceFound : BleEvent
    data object Connect : BleEvent
    data object GattConnected : BleEvent
    data object ServicesDiscovered : BleEvent
    data object Authenticated : BleEvent
    data object CapabilitiesProbed : BleEvent
    data object SyncStarted : BleEvent
    data object SyncFinished : BleEvent
    data object StreamStarted : BleEvent
    data object StreamStopped : BleEvent
    data class Disconnected(val status: Int) : BleEvent
    data class Failure(val reason: String) : BleEvent
    data object UserDisconnect : BleEvent
}

/** Diagnóstico de códigos de status GATT mais comuns (133/8/19/0), em pt-BR. */
object GattStatus {
    fun explain(status: Int): String = when (status) {
        0 -> "Encerrada logo após abrir: a pulseira recusou este celular (vinculada a outro app?) ou o Android falhou no pareamento."
        8 -> "Tempo esgotado: a pulseira parou de responder (distância ou interferência)."
        19 -> "A pulseira encerrou a conexão (ainda vinculada ao Mi Fit/Zepp Life, neste ou em outro celular?)."
        5, 15, 22, 137 -> "Falha de segurança no link: celular e pulseira divergem sobre o pareamento."
        62, 133, 257 -> "Erro genérico do Bluetooth do Android ao falar com a pulseira."
        else -> "Conexão perdida (código $status)."
    }

    /** Códigos que justificam limpar o cache de serviços GATT antes de tentar de novo. */
    fun shouldRefreshCache(status: Int): Boolean = status in setOf(0, 8, 133, 257, 62)
}

data class RetryPolicy(val maxAttempts: Int = 4, val baseDelayMs: Long = 5_000, val maxDelayMs: Long = 60_000) {
    /** Backoff exponencial determinístico (jitter é aplicado pelo chamador). */
    fun delayFor(attempt: Int): Long = (baseDelayMs shl (attempt - 1).coerceIn(0, 10)).coerceAtMost(maxDelayMs)
}

data class BleSnapshot(
    val state: BleState = BleState.UNINITIALIZED,
    val failedAttempts: Int = 0,
    val lastStatus: Int? = null,
    val userWantsConnection: Boolean = false,
    val nextRetryDelayMs: Long? = null,
    val giveUpReason: String? = null,
)

/**
 * Máquina de estados pura e determinística. Toda transição é registrável sem payload sensível.
 * Quedas logo após autenticar contam como falha (evita laço infinito, como visto no hardware real).
 */
class BleStateMachine(private val policy: RetryPolicy = RetryPolicy(), private val stableAfterMs: Long = 60_000) {
    var snapshot: BleSnapshot = BleSnapshot()
        private set
    private var readyAtMs: Long = 0

    fun reduce(event: BleEvent, nowMs: Long): BleSnapshot {
        val s = snapshot
        snapshot = when (event) {
            BleEvent.Initialize -> if (s.state == BleState.UNINITIALIZED) s.copy(state = BleState.PERMISSION_REQUIRED) else s
            is BleEvent.PermissionResult -> if (event.granted) s.copy(state = BleState.DISCONNECTED) else s.copy(state = BleState.PERMISSION_REQUIRED)
            BleEvent.StartScan -> if (s.state == BleState.DISCONNECTED || s.state == BleState.DEVICE_FOUND || s.state == BleState.ERROR) s.copy(state = BleState.SCANNING) else s
            BleEvent.DeviceFound -> if (s.state == BleState.SCANNING) s.copy(state = BleState.DEVICE_FOUND) else s
            BleEvent.Connect -> if (s.state in setOf(BleState.DEVICE_FOUND, BleState.DISCONNECTED, BleState.ERROR)) {
                s.copy(state = BleState.CONNECTING, userWantsConnection = true, giveUpReason = null, nextRetryDelayMs = null)
            } else s
            BleEvent.GattConnected -> if (s.state == BleState.CONNECTING) s.copy(state = BleState.DISCOVERING_SERVICES) else s
            BleEvent.ServicesDiscovered -> if (s.state == BleState.DISCOVERING_SERVICES) s.copy(state = BleState.AUTHENTICATING) else s
            BleEvent.Authenticated -> if (s.state == BleState.AUTHENTICATING) s.copy(state = BleState.CAPABILITY_PROBING) else s
            BleEvent.CapabilitiesProbed -> if (s.state == BleState.CAPABILITY_PROBING) {
                readyAtMs = nowMs
                s.copy(state = BleState.READY)
            } else s
            BleEvent.SyncStarted -> if (s.state == BleState.READY) s.copy(state = BleState.SYNCING) else s
            BleEvent.SyncFinished -> if (s.state == BleState.SYNCING) s.copy(state = BleState.READY) else s
            BleEvent.StreamStarted -> if (s.state == BleState.READY) s.copy(state = BleState.STREAMING) else s
            BleEvent.StreamStopped -> if (s.state == BleState.STREAMING) s.copy(state = BleState.READY) else s
            BleEvent.UserDisconnect -> s.copy(state = BleState.DISCONNECTED, userWantsConnection = false, failedAttempts = 0, nextRetryDelayMs = null)
            is BleEvent.Failure -> s.copy(state = BleState.ERROR, giveUpReason = event.reason, userWantsConnection = false)
            is BleEvent.Disconnected -> onDisconnected(s, event.status, nowMs)
        }
        return snapshot
    }

    private fun onDisconnected(s: BleSnapshot, status: Int, nowMs: Long): BleSnapshot {
        if (s.state == BleState.DISCONNECTED || s.state == BleState.PERMISSION_REQUIRED) return s
        val wasReady = s.state in setOf(BleState.READY, BleState.SYNCING, BleState.STREAMING)
        val stable = wasReady && nowMs - readyAtMs > stableAfterMs
        val attempts = if (stable) 0 else s.failedAttempts + 1
        if (!s.userWantsConnection) return s.copy(state = BleState.DISCONNECTED, lastStatus = status)
        if (attempts >= policy.maxAttempts) {
            return s.copy(
                state = BleState.ERROR,
                failedAttempts = attempts,
                lastStatus = status,
                userWantsConnection = false,
                nextRetryDelayMs = null,
                giveUpReason = GattStatus.explain(status),
            )
        }
        return s.copy(state = BleState.DISCONNECTED, failedAttempts = attempts, lastStatus = status, nextRetryDelayMs = policy.delayFor(attempts))
    }
}
