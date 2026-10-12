package com.deltabots.pulse.data.secure

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.deltabots.pulse.network.RequestSigner
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/** Chave de posse do gateway: P-256 no Android Keystore (não exportável; StrongBox quando disponível). */
class KeystoreSigner(private val alias: String = "pulse_gateway_key") : RequestSigner {
    private val ks: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun ensureKey() {
        if (ks.containsAlias(alias)) return
        fun spec(strongBox: Boolean) = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .apply { if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setIsStrongBoxBacked(true) }
            .build()
        val gen = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        try {
            gen.initialize(spec(strongBox = true))
            gen.generateKeyPair()
        } catch (e: Exception) {
            // Sem StrongBox: usa TEE/software do Keystore.
            gen.initialize(spec(strongBox = false))
            gen.generateKeyPair()
        }
    }

    override val publicKeySpkiBase64Url: String
        get() {
            ensureKey()
            return Base64.getUrlEncoder().withoutPadding().encodeToString(ks.getCertificate(alias).publicKey.encoded)
        }

    override fun sign(message: ByteArray): ByteArray {
        ensureKey()
        val key = ks.getKey(alias, null) as PrivateKey
        return Signature.getInstance("SHA256withECDSA").run {
            initSign(key)
            update(message)
            sign() // DER; a API aceita DER ou raw (r||s)
        }
    }

    fun reset() {
        if (ks.containsAlias(alias)) ks.deleteEntry(alias)
    }
}
