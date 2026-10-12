package com.deltabots.pulse.network

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/** Impede que o app peça finalidades que a API (fonte de verdade em packages/contracts) não conhece. */
class ContractDriftTest {
    @Test
    fun consentPurposesExistInContracts() {
        var dir: File? = File("").absoluteFile
        var src: File? = null
        while (dir != null && src == null) {
            File(dir, "packages/contracts/src/consent.ts").takeIf { it.exists() }?.let { src = it }
            dir = dir.parentFile
        }
        val text = checkNotNull(src) { "packages/contracts/src/consent.ts não encontrado" }.readText()
        val enumBlock = text.substringAfter("ConsentPurpose = z.enum([").substringBefore("]);")
        val known = Regex("'([a-z_]+)'").findAll(enumBlock).map { it.groupValues[1] }.toSet()
        listOf(ConsentPurposes.HEALTH_PROCESSING, ConsentPurposes.CLOUD_SYNC_HEALTH, ConsentPurposes.NOTIFICATION_MIRRORING).forEach {
            assertTrue("finalidade desconhecida pela API: $it", it in known)
        }
    }
}
