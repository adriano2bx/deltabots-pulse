package com.deltabots.pulse.notifications

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.deltabots.pulse.ble.Miband3Connection
import com.deltabots.pulse.data.repo.Prefs
import com.deltabots.pulse.device.miband3.MiBandProtocol
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.koin.android.ext.android.inject

/** Somente no flavor "completo". Encaminha só apps escolhidos pelo usuário; conteúdo nunca vai à nuvem. */
class NotificationForwarder : NotificationListenerService() {
    private val band: Miband3Connection by inject()
    private val prefs: Prefs by inject()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val p = runBlocking { prefs.flow.first() }
        if (!p.mirrorNotifications || sbn.packageName !in p.mirrorApps || sbn.isOngoing) return
        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return
        band.sendText(title.ifBlank { sbn.packageName }, text, MiBandProtocol.Icon.APP)
    }
}
