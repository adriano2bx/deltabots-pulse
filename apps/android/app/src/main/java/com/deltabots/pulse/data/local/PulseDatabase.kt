package com.deltabots.pulse.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        ReadingEntity::class, OutboxEntity::class, DeviceEntity::class, ConnectionEventEntity::class,
        CapabilityEntity::class, GestureTemplateEntity::class, PendingCommandEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class PulseDatabase : RoomDatabase() {
    abstract fun readings(): ReadingDao
    abstract fun outbox(): OutboxDao
    abstract fun devices(): DeviceDao
    abstract fun gestures(): GestureDao
}
