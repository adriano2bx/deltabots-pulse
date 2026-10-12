package com.deltabots.pulse.data.repo

import com.deltabots.pulse.data.local.DeviceDao
import com.deltabots.pulse.data.local.GestureDao
import com.deltabots.pulse.data.local.OutboxDao
import com.deltabots.pulse.data.local.ReadingDao
import com.deltabots.pulse.data.secure.BleKeyStore
import com.deltabots.pulse.data.secure.KeystoreSigner
import com.deltabots.pulse.network.TokenStore

/** Apaga todos os dados deste aparelho (LGPD): leituras, fila, vínculos, gestos, chaves e sessão. */
class LocalDataWiper(
    private val readings: ReadingDao,
    private val outbox: OutboxDao,
    private val devices: DeviceDao,
    private val gestures: GestureDao,
    private val keys: BleKeyStore,
    private val signer: KeystoreSigner,
    private val tokens: TokenStore,
    private val prefs: Prefs,
) {
    suspend fun wipeAll() {
        readings.clear()
        outbox.clear()
        gestures.clear()
        devices.clear()
        keys.wipe()
        signer.reset()
        tokens.clear()
        prefs.clear()
    }
}
