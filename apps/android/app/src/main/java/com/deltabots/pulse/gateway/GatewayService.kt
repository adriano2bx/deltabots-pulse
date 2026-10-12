package com.deltabots.pulse.gateway

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.deltabots.pulse.PulseApp
import com.deltabots.pulse.R
import com.deltabots.pulse.ble.Miband3Connection
import com.deltabots.pulse.ui.MainActivity
import org.koin.android.ext.android.inject

/** Mantém a conexão BLE viva em segundo plano; a notificação reflete o estado real, nunca "conectado" falso. */
class GatewayService : Service() {
    private val band: Miband3Connection by inject()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(1, notification(band.ui.value.state.name), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        band.onStateChanged = { ui ->
            getSystemService(android.app.NotificationManager::class.java).notify(1, notification(ui.state.name))
        }
        return START_STICKY
    }

    private fun notification(state: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, PulseApp.CHANNEL_CONNECTION)
            .setSmallIcon(R.drawable.ic_stat_band)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("Pulseira: $state")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        band.onStateChanged = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_STOP = "com.deltabots.pulse.STOP"
        fun start(context: Context) = androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, GatewayService::class.java))
        fun stop(context: Context) { context.startService(Intent(context, GatewayService::class.java).setAction(ACTION_STOP)) }
    }
}
