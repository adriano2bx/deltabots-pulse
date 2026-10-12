package com.deltabots.pulse.network

import java.security.MessageDigest

/**
 * Prova de posse do gateway: assinatura ECDSA P-256 sobre `METHOD\nPATH\nTIMESTAMP\nSHA256(body)`.
 * No Android a chave vive no Keystore (não exportável); testes usam java.security.
 */
interface RequestSigner {
    val publicKeySpkiBase64Url: String
    fun sign(message: ByteArray): ByteArray
}

object SigningMessage {
    fun sha256Hex(body: String): String =
        MessageDigest.getInstance("SHA-256").digest(body.toByteArray()).joinToString("") { "%02x".format(it) }

    fun build(method: String, path: String, timestampIso: String, body: String): String =
        "$method\n$path\n$timestampIso\n${sha256Hex(body)}"
}
