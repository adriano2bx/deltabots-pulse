package com.deltabots.pulse.data.repo

import android.os.Build
import com.deltabots.pulse.BuildConfig
import com.deltabots.pulse.data.local.DeviceDao
import com.deltabots.pulse.data.secure.KeystoreSigner
import com.deltabots.pulse.network.CapabilityReport
import com.deltabots.pulse.network.ConsentPurposes
import com.deltabots.pulse.network.CreateConsent
import com.deltabots.pulse.network.DeviceRegister
import com.deltabots.pulse.network.GatewayRegister
import com.deltabots.pulse.network.LoginRequest
import com.deltabots.pulse.network.PulseApi
import com.deltabots.pulse.network.RegisterRequest
import com.deltabots.pulse.network.TokenStore
import com.deltabots.pulse.network.UserDto

const val TERMS_VERSION = "2026-01"

/** Conta, gateway Android (par de chaves no Keystore) e registro do dispositivo no servidor. */
class SessionRepository(
    private val api: PulseApi,
    private val tokens: TokenStore,
    private val signer: KeystoreSigner,
    private val devices: DeviceDao,
) {
    suspend fun isSignedIn(): Boolean = tokens.load() != null

    suspend fun login(email: String, password: String, mfa: String?): UserDto {
        api.login(LoginRequest(email, password, "${Build.MANUFACTURER} ${Build.MODEL}", mfa?.ifBlank { null }))
        ensureGateway()
        return api.me()
    }

    suspend fun register(email: String, password: String, name: String?): UserDto {
        api.register(RegisterRequest(email, password, name?.ifBlank { null }, acceptedTermsVersion = TERMS_VERSION))
        ensureGateway()
        return api.me()
    }

    suspend fun logout() = api.logout()

    private suspend fun ensureGateway() {
        if (tokens.load()?.gatewayId != null) return
        api.registerGateway(GatewayRegister(displayName = "${Build.MANUFACTURER} ${Build.MODEL}", publicKey = signer.publicKeySpkiBase64Url, appVersion = BuildConfig.VERSION_NAME))
    }

    suspend fun grantHealthConsents(): Int {
        val existing = api.consents().filter { it.revokedAt == null }.map { it.purpose }.toSet()
        var n = 0
        for (p in ConsentPurposes.healthSync) if (p !in existing) {
            api.grantConsent(CreateConsent(p, TERMS_VERSION)); n++
        }
        return n
    }

    /** Registra a pulseira vinculada no servidor (idempotente) e envia as capacidades com evidência. */
    suspend fun registerDevice(localId: String, caps: List<CapabilityReport>) {
        val local = devices.byId(localId) ?: return
        val gateway = tokens.load()?.gatewayId ?: return
        val serverId = local.serverDeviceId ?: api.registerDevice(
            DeviceRegister("miband3", "Xiaomi", local.name, local.firmware, gateway, local.fingerprint),
        ).id.also { devices.upsert(local.copy(serverDeviceId = it)) }
        if (caps.isNotEmpty()) api.reportCapabilities(serverId, caps)
    }
}
