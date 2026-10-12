package com.deltabots.pulse.domain

/**
 * Contrato de estado de toda tela (docs/15): nenhum estado pode mascarar desconexão como online,
 * e dado desatualizado carrega a idade para exibição.
 */
sealed interface ScreenState<out T> {
    data object Loading : ScreenState<Nothing>
    data class Data<T>(val value: T, val provenance: Provenance) : ScreenState<T>
    data object Empty : ScreenState<Nothing>
    data class Offline<T>(val lastKnown: T?, val lastKnownAt: Long?) : ScreenState<T>
    data class Error(val code: String, val message: String, val retryable: Boolean = true) : ScreenState<Nothing>
    data class PermissionRequired(val permission: String, val rationale: String) : ScreenState<Nothing>
    data class Unsupported(val capability: String, val reason: String) : ScreenState<Nothing>
    data class Stale<T>(val value: T, val provenance: Provenance, val ageMs: Long) : ScreenState<T>
}

/** Proveniência obrigatória de toda leitura (RF-01). */
data class Provenance(
    val deviceId: String?,
    val source: String,
    val observedAtMs: Long,
    val quality: Quality,
    val synthetic: Boolean = false,
)

enum class Quality { MEASURED, ESTIMATED, INVALID, STALE }

object Freshness {
    /** Mesmos limites do backend (STALE_AFTER_MS) para consistência entre app e API. */
    val staleAfterMs: Map<String, Long> = mapOf(
        "heart_rate_bpm" to 60 * 60_000L,
        "steps_delta" to 60 * 60_000L,
        "steps_total" to 60 * 60_000L,
        "sleep_interval" to 36 * 3600_000L,
        "activity" to 24 * 3600_000L,
        "battery_percent" to 6 * 3600_000L,
        "connection_state" to 15 * 60_000L,
    )

    fun isStale(kind: String, observedAtMs: Long, nowMs: Long): Boolean =
        nowMs - observedAtMs > (staleAfterMs[kind] ?: 3600_000L)

    fun <T> stateFor(kind: String, value: T?, provenance: Provenance?, nowMs: Long): ScreenState<T> = when {
        value == null || provenance == null -> ScreenState.Empty
        provenance.quality == Quality.INVALID -> ScreenState.Error("INVALID_READING", "Leitura inválida descartada.", retryable = true)
        isStale(kind, provenance.observedAtMs, nowMs) -> ScreenState.Stale(value, provenance, nowMs - provenance.observedAtMs)
        else -> ScreenState.Data(value, provenance)
    }

    /** "há 5 min", "há 2 h" — idade legível para o cabeçalho de frescor. */
    fun humanAge(ageMs: Long): String {
        val m = ageMs / 60_000
        return when {
            m < 1 -> "agora"
            m < 60 -> "há $m min"
            m < 24 * 60 -> "há ${m / 60} h"
            else -> "há ${m / (24 * 60)} d"
        }
    }
}
