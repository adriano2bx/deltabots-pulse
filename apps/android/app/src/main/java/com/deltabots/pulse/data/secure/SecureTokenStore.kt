package com.deltabots.pulse.data.secure

import android.content.Context
import com.deltabots.pulse.network.StoredSession
import com.deltabots.pulse.network.TokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Refresh token cifrado (AES-GCM/Keystore); nunca em texto claro em disco. */
class SecureTokenStore(context: Context) : TokenStore {
    private val prefs = context.getSharedPreferences("pulse_secure", Context.MODE_PRIVATE)
    private val box = KeystoreBox("pulse_token_key")

    override suspend fun load(): StoredSession? = withContext(Dispatchers.IO) {
        val blob = prefs.getString("session", null) ?: return@withContext null
        val json = box.decrypt(blob) ?: return@withContext null
        runCatching {
            val j = JSONObject(json)
            StoredSession(j.getString("rt"), j.getString("tid"), j.getString("sid"), j.optString("gw").ifEmpty { null })
        }.getOrNull()
    }

    override suspend fun save(session: StoredSession) = withContext(Dispatchers.IO) {
        val json = JSONObject().put("rt", session.refreshToken).put("tid", session.tenantId).put("sid", session.sessionId).put("gw", session.gatewayId ?: "").toString()
        prefs.edit().putString("session", box.encrypt(json)).apply()
    }

    override suspend fun clear() = withContext(Dispatchers.IO) { prefs.edit().remove("session").apply() }
}
