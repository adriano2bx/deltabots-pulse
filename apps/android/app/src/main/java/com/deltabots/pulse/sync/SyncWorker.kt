package com.deltabots.pulse.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.deltabots.pulse.data.repo.TelemetryRepository
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import java.util.concurrent.TimeUnit

/** Descarrega a outbox periodicamente, mesmo com o app fechado. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params), KoinComponent {
    private val telemetry: TelemetryRepository by inject()

    override suspend fun doWork(): Result = when (val r = telemetry.flush()) {
        is TelemetryRepository.FlushResult.Failed -> if (r.retryable) Result.retry() else Result.failure()
        else -> Result.success()
    }
}

object SyncScheduler {
    private const val NAME = "pulse-sync"

    fun schedule(context: Context, wifiOnly: Boolean = false) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }
}
