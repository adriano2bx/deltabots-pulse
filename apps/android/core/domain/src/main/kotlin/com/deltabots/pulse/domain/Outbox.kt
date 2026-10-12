package com.deltabots.pulse.domain

/** Item de outbox persistido (Room). A remoção só ocorre com ACK individual do servidor. */
data class OutboxItem(
    val readingId: String,
    val deviceId: String,
    val kind: String,
    val observedAtMs: Long,
    val valueNum: Double?,
    val valueText: String?,
    val quality: String,
    val source: String,
    val firmware: String?,
    val attempts: Int = 0,
    val nextAttemptAtMs: Long = 0,
    val state: OutboxState = OutboxState.PENDING,
    val lastError: String? = null,
)

enum class OutboxState { PENDING, REJECTED_PERMANENT }

/** Resposta por item do POST /telemetry/batch. */
data class BatchAck(
    val batchId: String,
    val accepted: Set<String>,
    val duplicates: Set<String>,
    val rejected: Map<String, String>,
)

object OutboxPolicy {
    const val MAX_BATCH = 200
    const val MAX_ATTEMPTS = 12

    /** Códigos que nunca serão aceitos mesmo com retentativa. */
    private val permanent = setOf("UNIT_MISMATCH", "OUT_OF_RANGE", "VALIDATION_ERROR", "TOO_OLD")
    /** Códigos que exigem ação do usuário e não são perdas definitivas. */
    private val needsUser = setOf("CONSENT_REQUIRED")

    /** Lotes por dispositivo (a API aceita um dispositivo por lote), ordenados por observação, ≤ 200. */
    fun nextBatches(pending: List<OutboxItem>, nowMs: Long, maxBatches: Int = 5): List<List<OutboxItem>> =
        pending.filter { it.state == OutboxState.PENDING && it.nextAttemptAtMs <= nowMs }
            .groupBy { it.deviceId }
            .values
            .flatMap { it.sortedBy { r -> r.observedAtMs }.chunked(MAX_BATCH) }
            .take(maxBatches)

    data class Outcome(val toDelete: Set<String>, val toUpdate: List<OutboxItem>)

    /** Aplica o ACK: aceitas/duplicadas saem; rejeição permanente fica marcada; demais recebem backoff. */
    fun apply(batch: List<OutboxItem>, ack: BatchAck, nowMs: Long): Outcome {
        val delete = mutableSetOf<String>()
        val update = mutableListOf<OutboxItem>()
        for (item in batch) {
            val reject = ack.rejected[item.readingId]
            when {
                item.readingId in ack.accepted || item.readingId in ack.duplicates -> delete += item.readingId
                reject != null && reject in permanent -> update += item.copy(state = OutboxState.REJECTED_PERMANENT, lastError = reject)
                reject != null && reject in needsUser -> update += item.copy(nextAttemptAtMs = nowMs + 6 * 3600_000L, lastError = reject)
                else -> update += backoff(item, nowMs, reject ?: "NO_ACK")
            }
        }
        return Outcome(delete, update)
    }

    /** Falha de rede/servidor para o lote inteiro (nada confirmado). */
    fun failBatch(batch: List<OutboxItem>, nowMs: Long, error: String): List<OutboxItem> = batch.map { backoff(it, nowMs, error) }

    private fun backoff(item: OutboxItem, nowMs: Long, error: String): OutboxItem {
        val attempts = item.attempts + 1
        if (attempts >= MAX_ATTEMPTS) return item.copy(attempts = attempts, state = OutboxState.REJECTED_PERMANENT, lastError = "MAX_ATTEMPTS:$error")
        val delay = (30_000L shl (attempts - 1).coerceAtMost(8)).coerceAtMost(3600_000L)
        return item.copy(attempts = attempts, nextAttemptAtMs = nowMs + delay, lastError = error)
    }
}
