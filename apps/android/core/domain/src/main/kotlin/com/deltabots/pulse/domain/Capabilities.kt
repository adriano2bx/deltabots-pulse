package com.deltabots.pulse.domain

enum class SupportState { SUPPORTED, UNSUPPORTED, UNVERIFIED, TEMPORARILY_UNAVAILABLE }

/** Capacidades conhecidas (espelha CapabilityId em packages/contracts). */
enum class CapabilityId(val wire: String) {
    AUTH("auth_huami_v2"),
    BATTERY("battery_read"),
    DEVICE_INFO("device_info_read"),
    HR_ON_DEMAND("heart_rate_on_demand"),
    HR_CONTINUOUS("heart_rate_continuous"),
    HR_HISTORY("heart_rate_history"),
    STEPS_REALTIME("steps_realtime"),
    ACTIVITY_HISTORY("activity_history"),
    SLEEP_HISTORY("sleep_history"),
    VIBRATION("vibration_alert"),
    TEXT_NOTIFICATION("text_notification"),
    CALL_NOTIFICATION("call_notification"),
    ALARM_CONFIG("alarm_config"),
    BUTTON_EVENTS("button_events"),
    FIND_PHONE("find_phone_event"),
    RAW_ACCEL("raw_accel_stream"),
    FIRMWARE_OTA("firmware_ota"),
}

data class Capability(
    val id: CapabilityId,
    val state: SupportState,
    val firmware: String?,
    val driverVersion: String,
    val verifiedAtMs: Long? = null,
    val testArtifact: String? = null,
    val limitations: String? = null,
)

/**
 * Evidência colhida do próprio aparelho (GATT + respostas reais). Nada é SUPPORTED sem prova:
 * presença da característica GATT só prova `UNVERIFIED`; é um evento real (ex.: leitura de bateria,
 * eco de vibração, notificação recebida) que promove a SUPPORTED (docs/05).
 */
data class Evidence(val characteristics: Set<String>, val observed: Set<CapabilityId>)

object CapabilityProber {
    private val required = mapOf(
        CapabilityId.AUTH to "00000009-0000-3512-2118-0009af100700",
        CapabilityId.BATTERY to "00000006-0000-3512-2118-0009af100700",
        CapabilityId.STEPS_REALTIME to "00000007-0000-3512-2118-0009af100700",
        CapabilityId.DEVICE_INFO to "00002a28-0000-1000-8000-00805f9b34fb",
        CapabilityId.HR_ON_DEMAND to "00002a39-0000-1000-8000-00805f9b34fb",
        CapabilityId.HR_CONTINUOUS to "00002a39-0000-1000-8000-00805f9b34fb",
        CapabilityId.VIBRATION to "00002a06-0000-1000-8000-00805f9b34fb",
        CapabilityId.TEXT_NOTIFICATION to "00002a46-0000-1000-8000-00805f9b34fb",
        CapabilityId.CALL_NOTIFICATION to "00002a46-0000-1000-8000-00805f9b34fb",
        CapabilityId.ALARM_CONFIG to "00000003-0000-3512-2118-0009af100700",
        CapabilityId.BUTTON_EVENTS to "00000010-0000-3512-2118-0009af100700",
        CapabilityId.FIND_PHONE to "00000010-0000-3512-2118-0009af100700",
        CapabilityId.RAW_ACCEL to "00000002-0000-3512-2118-0009af100700",
    )

    /** Capacidades sem característica correspondente no GATT são UNSUPPORTED; as demais, UNVERIFIED até ensaio. */
    fun probe(evidence: Evidence, firmware: String?, driver: String, nowMs: Long): List<Capability> =
        CapabilityId.entries.map { id ->
            val uuid = required[id]
            when {
                id == CapabilityId.FIRMWARE_OTA -> Capability(id, SupportState.UNSUPPORTED, firmware, driver, nowMs, null, "Atualização de firmware fora do escopo do app.")
                id in evidence.observed -> Capability(id, SupportState.SUPPORTED, firmware, driver, nowMs, "observed:${id.wire}")
                id == CapabilityId.HR_HISTORY || id == CapabilityId.ACTIVITY_HISTORY || id == CapabilityId.SLEEP_HISTORY ->
                    Capability(id, SupportState.UNVERIFIED, firmware, driver, null, null, "Download de histórico ainda não implementado/ensaiado.")
                uuid == null -> Capability(id, SupportState.UNVERIFIED, firmware, driver)
                uuid !in evidence.characteristics -> Capability(id, SupportState.UNSUPPORTED, firmware, driver, nowMs, null, "Característica GATT ausente.")
                id == CapabilityId.RAW_ACCEL -> Capability(id, SupportState.UNVERIFIED, firmware, driver, null, null, "Característica presente; stream não comprovado (HW08).")
                else -> Capability(id, SupportState.UNVERIFIED, firmware, driver, null, null, "Característica presente; aguardando comprovação por uso real.")
            }
        }

    fun isUsable(list: List<Capability>, id: CapabilityId): Boolean = list.firstOrNull { it.id == id }?.state == SupportState.SUPPORTED
}
