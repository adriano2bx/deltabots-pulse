package com.deltabots.pulse.network

/** Armazenamento seguro de tokens (Keystore/EncryptedSharedPreferences no Android). */
interface TokenStore {
    suspend fun load(): StoredSession?
    suspend fun save(session: StoredSession)
    suspend fun clear()
}

data class StoredSession(val refreshToken: String, val tenantId: String, val sessionId: String, val gatewayId: String? = null)

class InMemoryTokenStore : TokenStore {
    private var s: StoredSession? = null
    override suspend fun load() = s
    override suspend fun save(session: StoredSession) { s = session }
    override suspend fun clear() { s = null }
}
