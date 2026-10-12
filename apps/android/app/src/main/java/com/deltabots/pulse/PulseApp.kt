package com.deltabots.pulse

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.deltabots.pulse.di.appModule
import com.deltabots.pulse.sync.SyncScheduler
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin

class PulseApp : Application() {
    override fun onCreate() {
        super.onCreate()
        startKoin { androidContext(this@PulseApp); modules(appModule) }
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_CONNECTION, getString(R.string.channel_connection), NotificationManager.IMPORTANCE_LOW),
        )
        SyncScheduler.schedule(this)
    }

    companion object { const val CHANNEL_CONNECTION = "connection" }
}
