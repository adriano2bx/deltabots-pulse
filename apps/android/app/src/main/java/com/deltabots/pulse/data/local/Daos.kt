package com.deltabots.pulse.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface ReadingDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(items: List<ReadingEntity>)

    @Query("SELECT * FROM reading WHERE deviceId=:deviceId AND kind=:kind ORDER BY observedAtMs DESC LIMIT 1")
    fun latest(deviceId: String, kind: String): Flow<ReadingEntity?>

    @Query("SELECT * FROM reading WHERE kind=:kind ORDER BY observedAtMs DESC LIMIT 1")
    fun latestAny(kind: String): Flow<ReadingEntity?>

    @Query("SELECT * FROM reading WHERE kind=:kind AND observedAtMs>=:from AND observedAtMs<:to AND quality IN ('MEASURED','ESTIMATED') ORDER BY observedAtMs")
    fun range(kind: String, from: Long, to: Long): Flow<List<ReadingEntity>>

    @Query("SELECT * FROM reading WHERE observedAtMs>=:from ORDER BY observedAtMs DESC LIMIT :limit")
    fun timeline(from: Long, limit: Int): Flow<List<ReadingEntity>>

    @Query("DELETE FROM reading WHERE observedAtMs<:before")
    suspend fun deleteOlderThan(before: Long): Int

    @Query("DELETE FROM reading")
    suspend fun clear()

    @Query("SELECT COUNT(*) FROM reading")
    suspend fun count(): Int
}

@Dao
interface OutboxDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(items: List<OutboxEntity>)

    @Query("SELECT * FROM outbox WHERE state='PENDING' AND nextAttemptAtMs<=:now ORDER BY observedAtMs LIMIT :limit")
    suspend fun due(now: Long, limit: Int): List<OutboxEntity>

    @Update
    suspend fun update(items: List<OutboxEntity>)

    @Query("DELETE FROM outbox WHERE readingId IN (:ids)")
    suspend fun delete(ids: List<String>)

    @Query("SELECT COUNT(*) FROM outbox WHERE state='PENDING'")
    fun pendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox WHERE state='REJECTED_PERMANENT'")
    fun rejectedCount(): Flow<Int>

    @Query("SELECT MIN(observedAtMs) FROM outbox WHERE state='PENDING'")
    fun oldestPending(): Flow<Long?>

    @Query("DELETE FROM outbox")
    suspend fun clear()
}

@Dao
interface DeviceDao {
    @Query("SELECT * FROM device ORDER BY pairedAtMs DESC")
    fun all(): Flow<List<DeviceEntity>>

    @Query("SELECT * FROM device WHERE id=:id")
    suspend fun byId(id: String): DeviceEntity?

    @Query("SELECT * FROM device ORDER BY pairedAtMs DESC LIMIT 1")
    suspend fun first(): DeviceEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(d: DeviceEntity)

    @Query("DELETE FROM device WHERE id=:id")
    suspend fun delete(id: String)

    @Query("DELETE FROM device")
    suspend fun clear()

    @Insert
    suspend fun addEvent(e: ConnectionEventEntity)

    @Query("SELECT * FROM connection_event WHERE deviceId=:id ORDER BY atMs DESC LIMIT :limit")
    fun events(id: String, limit: Int): Flow<List<ConnectionEventEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCapabilities(items: List<CapabilityEntity>)

    @Query("SELECT * FROM capability WHERE deviceId=:id ORDER BY capability")
    fun capabilities(id: String): Flow<List<CapabilityEntity>>

    @Query("SELECT * FROM capability WHERE deviceId=:id AND reported=0")
    suspend fun unreportedCapabilities(id: String): List<CapabilityEntity>

    @Query("UPDATE capability SET reported=1 WHERE deviceId=:id")
    suspend fun markReported(id: String)

    @Query("DELETE FROM connection_event WHERE atMs<:before")
    suspend fun purgeEvents(before: Long)
}

@Dao
interface GestureDao {
    @Query("SELECT * FROM gesture_template ORDER BY createdAtMs DESC")
    fun templates(): Flow<List<GestureTemplateEntity>>

    @Query("SELECT * FROM gesture_template")
    suspend fun templatesOnce(): List<GestureTemplateEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(t: GestureTemplateEntity)

    @Query("DELETE FROM gesture_template WHERE id=:id")
    suspend fun delete(id: String)

    @Query("DELETE FROM gesture_template")
    suspend fun clear()
}
