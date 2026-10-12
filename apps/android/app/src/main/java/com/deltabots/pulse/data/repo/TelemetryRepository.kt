package com.deltabots.pulse.data.repo

import android.util.Log
import com.deltabots.pulse.ble.ReadingSink
import com.deltabots.pulse.data.local.DeviceDao
import com.deltabots.pulse.data.local.OutboxDao
import com.deltabots.pulse.data.local.OutboxEntity
import com.deltabots.pulse.data.local.ReadingDao
import com.deltabots.pulse.data.local.ReadingEntity
import com.deltabots.pulse.domain.BatchAck
import com.deltabots.pulse.domain.OutboxItem
import com.deltabots.pulse.domain.OutboxPolicy
import com.deltabots.pulse.domain.OutboxState
import com.deltabots.pulse.domain.Reading
import com.deltabots.pulse.domain.ReadingKind
import com.deltabots.pulse.domain.Ulid
import com.deltabots.pulse.network.ApiException
import com.deltabots.pulse.network.BatchRequest
import com.deltabots.pulse.network.PulseApi
import com.deltabots.pulse.network.ReadingDto
import com.deltabots.pulse.network.TokenStore
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant

/** Persiste toda leitura localmente (offline-first) e a envia em lotes com ACK individual. */
class TelemetryRepository(
    private val readings: ReadingDao,
    private val outbox: OutboxDao,
    private val devices: DeviceDao,
    private val api: PulseApi,
    private val tokens: TokenStore,
) : ReadingSink {

    override suspend fun record(readings: List<Reading>) {
        if (readings.isEmpty()) return
        this.readings.insertAll(readings.map {
            ReadingEntity(it.id, it.deviceId, it.kind.wire, it.observedAtMs, it.valueNum, it.valueText, it.quality.name, it.source, it.firmware)
        })
        outbox.insertAll(readings.map {
            OutboxEntity(it.id, it.deviceId, it.kind.wire, it.observedAtMs, it.valueNum, it.valueText, it.quality.name, it.source, it.firmware, 0, 0, OutboxState.PENDING.name, null)
        })
    }

    sealed interface FlushResult {
        data object NothingToSend : FlushResult
        data object NotSignedIn : FlushResult
        data class Sent(val accepted: Int, val remaining: Int) : FlushResult
        data class Failed(val error: String, val retryable: Boolean) : FlushResult
    }

    suspend fun flush(nowMs: Long = System.currentTimeMillis()): FlushResult {
        val session = tokens.load() ?: return FlushResult.NotSignedIn
        val gatewayId = session.gatewayId ?: return FlushResult.NotSignedIn
        val pending = outbox.due(nowMs, OutboxPolicy.MAX_BATCH * 5).map { it.toItem() }
        val batches = OutboxPolicy.nextBatches(pending, nowMs)
        if (batches.isEmpty()) return FlushResult.NothingToSend
        var accepted = 0
        for (batch in batches) {
            val local = devices.byId(batch.first().deviceId)
            val serverDevice = local?.serverDeviceId
            if (serverDevice == null) {
                outbox.update(OutboxPolicy.failBatch(batch, nowMs, "DEVICE_NOT_REGISTERED").map { it.toEntity() })
                continue
            }
            val request = BatchRequest(gatewayId, serverDevice, Ulid.generate(nowMs), batch.map { it.toDto() })
            try {
                val ack = api.ingest(request)
                val outcome = OutboxPolicy.apply(
                    batch,
                    BatchAck(ack.batchId, ack.accepted.toSet(), ack.duplicates.toSet(), ack.rejected.associate { it.readingId to it.code }),
                    nowMs,
                )
                if (outcome.toDelete.isNotEmpty()) outbox.delete(outcome.toDelete.toList())
                if (outcome.toUpdate.isNotEmpty()) outbox.update(outcome.toUpdate.map { it.toEntity() })
                accepted += ack.accepted.size + ack.duplicates.size
            } catch (e: ApiException) {
                Log.w("Telemetry", "lote recusado: ${e.code}")
                outbox.update(OutboxPolicy.failBatch(batch, nowMs, e.code).map { it.toEntity() })
                if (e.status == 401) return FlushResult.Failed(e.code, retryable = false)
            } catch (e: Exception) {
                outbox.update(OutboxPolicy.failBatch(batch, nowMs, "NETWORK").map { it.toEntity() })
                return FlushResult.Failed("NETWORK", retryable = true)
            }
        }
        return FlushResult.Sent(accepted, outbox.due(Long.MAX_VALUE, 1).size)
    }

    private fun OutboxEntity.toItem() = OutboxItem(readingId, deviceId, kind, observedAtMs, valueNum, valueText, quality, source, firmware, attempts, nextAttemptAtMs, OutboxState.valueOf(state), lastError)
    private fun OutboxItem.toEntity() = OutboxEntity(readingId, deviceId, kind, observedAtMs, valueNum, valueText, quality, source, firmware, attempts, nextAttemptAtMs, state.name, lastError)
    private fun OutboxItem.toDto(): ReadingDto {
        val unit = ReadingKind.entries.firstOrNull { it.wire == kind }?.unit ?: ""
        val value = valueNum?.let { if (it % 1.0 == 0.0) JsonPrimitive(it.toLong()) else JsonPrimitive(it) } ?: JsonPrimitive(valueText ?: "")
        return ReadingDto(readingId, kind, Instant.ofEpochMilli(observedAtMs).toString(), value, unit, quality, source, firmware)
    }
}
