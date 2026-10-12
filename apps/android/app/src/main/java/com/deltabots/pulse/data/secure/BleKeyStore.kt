package com.deltabots.pulse.data.secure

import android.content.Context
import com.deltabots.pulse.device.miband3.MiBandProtocol
import com.deltabots.pulse.device.miband3.MiBandProtocol.toHex
import java.security.SecureRandom

/**
 * Chave de autenticação BLE (P0, docs/12): gerada no aparelho, cifrada no Keystore e nunca exibida/logada.
 * O estado "autorizado" é por pulseira e invalidado ao esquecer o dispositivo.
 */
class BleKeyStore(context: Context) {
    private val prefs = context.getSharedPreferences("pulse_ble", Context.MODE_PRIVATE)
    private val box = KeystoreBox("pulse_ble_key")

    fun key(): ByteArray {
        prefs.getString("auth_key", null)?.let { box.decrypt(it) }?.let { return MiBandProtocol.hexToBytes(it) }
        val key = ByteArray(16).also { SecureRandom().nextBytes(it) }
        prefs.edit().putString("auth_key", box.encrypt(key.toHex())).apply()
        return key
    }

    fun isAuthorized(deviceId: String): Boolean = prefs.getBoolean("authorized_v2_$deviceId", false)
    fun setAuthorized(deviceId: String, value: Boolean) = prefs.edit().putBoolean("authorized_v2_$deviceId", value).apply()

    fun forget(deviceId: String) {
        prefs.edit().remove("authorized_v2_$deviceId").apply()
    }

    fun wipe() {
        prefs.edit().clear().apply()
        box.delete()
    }
}
