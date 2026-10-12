package com.deltabots.pulse.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Histórico local de leituras (offline-first, F110): permanece mesmo após o envio. */
@Entity(tableName = "reading", indices = [Index("deviceId", "kind", "observedAtMs")])
data class ReadingEntity(
    @PrimaryKey val id: String,
    val deviceId: String,
    val kind: String,
    val observedAtMs: Long,
    val valueNum: Double?,
    val valueText: String?,
    val quality: String,
    val source: String,
    val firmware: String?,
)

/** Fila de saída append-only; a remoção só ocorre com ACK individual do servidor. */
@Entity(tableName = "outbox", indices = [Index("state", "nextAttemptAtMs")])
data class OutboxEntity(
    @PrimaryKey val readingId: String,
    val deviceId: String,
    val kind: String,
    val observedAtMs: Long,
    val valueNum: Double?,
    val valueText: String?,
    val quality: String,
    val source: String,
    val firmware: String?,
    val attempts: Int,
    val nextAttemptAtMs: Long,
    val state: String,
    val lastError: String?,
)

/** Pulseira vinculada. O endereço BLE fica só no aparelho; ao servidor vai um fingerprint pseudônimo. */
@Entity(tableName = "device")
data class DeviceEntity(
    @PrimaryKey val id: String,
    val address: String,
    val name: String?,
    val model: String,
    val firmware: String?,
    val hardware: String?,
    val serial: String?,
    val fingerprint: String,
    val serverDeviceId: String?,
    val pairedAtMs: Long,
    val authorized: Boolean,
)

@Entity(tableName = "connection_event", indices = [Index("deviceId", "atMs")])
data class ConnectionEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val deviceId: String,
    val state: String,
    val status: Int?,
    val reason: String?,
    val atMs: Long,
)

@Entity(tableName = "capability", primaryKeys = ["deviceId", "capability"])
data class CapabilityEntity(
    val deviceId: String,
    val capability: String,
    val state: String,
    val firmware: String?,
    val driverVersion: String,
    val verifiedAtMs: Long?,
    val testArtifact: String?,
    val limitations: String?,
    @ColumnInfo(defaultValue = "0") val reported: Boolean = false,
)

@Entity(tableName = "gesture_template")
data class GestureTemplateEntity(
    @PrimaryKey val id: String,
    val label: String,
    val sensorSource: String,
    /** Série linear (x,y,z) serializada em JSON. */
    val seriesJson: String,
    val createdAtMs: Long,
)

@Entity(tableName = "pending_command")
data class PendingCommandEntity(
    @PrimaryKey val id: String,
    val deviceId: String,
    val action: String,
    val argsJson: String,
    val expiresAtMs: Long,
    val state: String,
)
