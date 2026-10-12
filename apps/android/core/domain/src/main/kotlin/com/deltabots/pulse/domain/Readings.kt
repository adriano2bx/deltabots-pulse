package com.deltabots.pulse.domain

import java.security.SecureRandom

enum class ReadingKind(val wire: String, val unit: String, val health: Boolean) {
    HEART_RATE("heart_rate_bpm", "bpm", true),
    STEPS_DELTA("steps_delta", "steps", true),
    STEPS_TOTAL("steps_total", "steps", true),
    SLEEP_INTERVAL("sleep_interval", "interval", true),
    ACTIVITY("activity", "activity", true),
    BATTERY("battery_percent", "%", false),
    CONNECTION("connection_state", "state", false),
}

/** Leitura coletada no aparelho, com id estável desde a coleta (dedupe fim a fim). */
data class Reading(
    val id: String,
    val deviceId: String,
    val kind: ReadingKind,
    val observedAtMs: Long,
    val valueNum: Double?,
    val valueText: String?,
    val quality: Quality,
    val source: String,
    val firmware: String?,
)

object Ulid {
    private const val CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    private val rnd = SecureRandom()

    fun generate(nowMs: Long = System.currentTimeMillis()): String {
        val sb = StringBuilder(26)
        var t = nowMs
        val time = CharArray(10)
        for (i in 9 downTo 0) {
            time[i] = CROCKFORD[(t % 32).toInt()]
            t /= 32
        }
        sb.append(time)
        repeat(16) { sb.append(CROCKFORD[rnd.nextInt(32)]) }
        return sb.toString()
    }
}

/**
 * Passos acumulados da pulseira → deltas, tratando reset (meia-noite da pulseira, reboot):
 * quando o total diminui, o novo total é o delta desde o reset.
 */
class StepsNormalizer(private var previousTotal: Int? = null) {
    data class Step(val delta: Int, val reset: Boolean)

    fun next(total: Int): Step? {
        val prev = previousTotal
        previousTotal = total
        return when {
            prev == null -> null
            total >= prev -> Step(total - prev, false)
            else -> Step(total, true)
        }
    }
}

/** Valida plausibilidade (não clínica) antes de enfileirar; leituras absurdas viram INVALID, nunca somem. */
object ReadingValidator {
    fun qualityFor(kind: ReadingKind, value: Double?): Quality = when (kind) {
        ReadingKind.HEART_RATE -> if (value != null && value in 25.0..250.0) Quality.MEASURED else Quality.INVALID
        ReadingKind.BATTERY -> if (value != null && value in 0.0..100.0) Quality.MEASURED else Quality.INVALID
        ReadingKind.STEPS_DELTA -> if (value != null && value in 0.0..50_000.0) Quality.MEASURED else Quality.INVALID
        ReadingKind.STEPS_TOTAL -> if (value != null && value in 0.0..2_000_000.0) Quality.MEASURED else Quality.INVALID
        else -> Quality.MEASURED
    }
}
