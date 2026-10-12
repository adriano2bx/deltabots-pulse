package com.deltabots.pulse.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable data class Problem(val type: String = "", val title: String = "", val status: Int = 0, val detail: String? = null, val code: String = "INTERNAL_ERROR", @SerialName("trace_id") val traceId: String = "")

@Serializable data class RegisterRequest(val email: String, val password: String, @SerialName("display_name") val displayName: String? = null, val locale: String = "pt-BR", val timezone: String = "America/Sao_Paulo", @SerialName("accepted_terms_version") val acceptedTermsVersion: String)
@Serializable data class LoginRequest(val email: String, val password: String, @SerialName("device_label") val deviceLabel: String? = null, @SerialName("mfa_code") val mfaCode: String? = null)
@Serializable data class RefreshRequest(@SerialName("refresh_token") val refreshToken: String)
@Serializable data class AuthTokens(
    @SerialName("access_token") val accessToken: String,
    @SerialName("expires_in") val expiresIn: Int,
    @SerialName("refresh_token") val refreshToken: String? = null,
    @SerialName("session_id") val sessionId: String = "",
    @SerialName("tenant_id") val tenantId: String = "",
)

@Serializable data class Envelope<T>(val data: T)
@Serializable data class ListEnvelope<T>(val data: List<T>, @SerialName("next_cursor") val nextCursor: String? = null)

@Serializable data class UserDto(val id: String, val email: String, @SerialName("display_name") val displayName: String? = null, val locale: String = "pt-BR", val timezone: String = "America/Sao_Paulo", @SerialName("mfa_enabled") val mfaEnabled: Boolean = false, @SerialName("tenant_id") val tenantId: String = "", @SerialName("org_role") val orgRole: String? = null)

@Serializable data class ConsentDto(val id: String, val purpose: String, @SerialName("policy_version") val policyVersion: String, @SerialName("granted_at") val grantedAt: String, @SerialName("revoked_at") val revokedAt: String? = null)
@Serializable data class CreateConsent(val purpose: String, @SerialName("policy_version") val policyVersion: String, val scope: Map<String, String> = emptyMap())

@Serializable data class GatewayRegister(val kind: String = "android", @SerialName("display_name") val displayName: String? = null, @SerialName("public_key") val publicKey: String? = null, @SerialName("app_version") val appVersion: String? = null)
@Serializable data class GatewayDto(val id: String, val kind: String = "android")
@Serializable data class DeviceRegister(val model: String, val manufacturer: String? = null, val alias: String? = null, val firmware: String? = null, @SerialName("gateway_id") val gatewayId: String, @SerialName("hardware_fingerprint") val hardwareFingerprint: String)
@Serializable data class DeviceDto(val id: String, val model: String, val firmware: String? = null, val alias: String? = null, @SerialName("last_seen_at") val lastSeenAt: String? = null)
@Serializable data class CapabilityReport(val id: String, @SerialName("support_state") val supportState: String, val firmware: String?, @SerialName("driver_version") val driverVersion: String, @SerialName("test_artifact") val testArtifact: String? = null, val limitations: String? = null)
@Serializable data class DeviceUpdate(val alias: String? = null, val firmware: String? = null, val capabilities: List<CapabilityReport>? = null)

@Serializable data class ReadingDto(
    @SerialName("reading_id") val readingId: String,
    val kind: String,
    @SerialName("observed_at") val observedAt: String,
    val value: JsonElement,
    val unit: String,
    val quality: String,
    val source: String,
    val firmware: String? = null,
)
@Serializable data class BatchRequest(@SerialName("gateway_id") val gatewayId: String, @SerialName("device_id") val deviceId: String, @SerialName("batch_id") val batchId: String, val readings: List<ReadingDto>)
@Serializable data class RejectedDto(@SerialName("reading_id") val readingId: String, val code: String)
@Serializable data class BatchAckDto(@SerialName("batch_id") val batchId: String, val accepted: List<String> = emptyList(), val duplicates: List<String> = emptyList(), val rejected: List<RejectedDto> = emptyList(), @SerialName("server_time") val serverTime: String = "")

@Serializable data class HeartbeatDevice(@SerialName("device_id") val deviceId: String, @SerialName("connection_state") val connectionState: String, @SerialName("rssi_dbm") val rssiDbm: Int? = null)
@Serializable data class Heartbeat(@SerialName("app_version") val appVersion: String, @SerialName("os_version") val osVersion: String? = null, @SerialName("clock_skew_ms") val clockSkewMs: Long? = null, val network: String? = null, val devices: List<HeartbeatDevice> = emptyList())
@Serializable data class HeartbeatAck(@SerialName("server_time") val serverTime: String, @SerialName("pending_commands") val pendingCommands: Int = 0)
@Serializable data class PendingCommand(val id: String, @SerialName("device_id") val deviceId: String, val action: String, val arguments: Map<String, JsonElement> = emptyMap(), @SerialName("expires_at") val expiresAt: String)
@Serializable data class CommandAck(val status: String, val code: String? = null)

/** Finalidades de consentimento aceitas pela API (packages/contracts/src/consent.ts); um teste impede divergência. */
object ConsentPurposes {
    const val HEALTH_PROCESSING = "health_processing"
    const val CLOUD_SYNC_HEALTH = "cloud_sync_health"
    const val NOTIFICATION_MIRRORING = "notification_mirroring"
    val healthSync = listOf(HEALTH_PROCESSING, CLOUD_SYNC_HEALTH)
}

@Serializable data class AutomationDto(val id: String, val title: String, val enabled: Boolean, val version: Int, @SerialName("risk_level") val riskLevel: String = "low", val ast: JsonElement? = null, @SerialName("updated_at") val updatedAt: String = "")
@Serializable data class AutomationListEnvelope(val data: List<AutomationDto>, @SerialName("next_cursor") val nextCursor: String? = null, val meta: AutomationMeta = AutomationMeta())
@Serializable data class AutomationMeta(@SerialName("kill_switch") val killSwitch: Boolean = false)
@Serializable data class AutomationTemplate(val id: String, val title: String, val ast: JsonElement)
@Serializable data class UpdateAutomation(@SerialName("expected_version") val expectedVersion: Int, val enabled: Boolean? = null)
@Serializable data class AlertDto(val id: String, val kind: String, val severity: String, val status: String, val summary: String = "", @SerialName("device_id") val deviceId: String? = null, @SerialName("created_at") val createdAt: String = "", @SerialName("ack_at") val ackAt: String? = null)

@Serializable data class ExportRequestDto(val kind: String)
@Serializable data class ExportJobDto(val id: String, val kind: String, val state: String, @SerialName("download_url") val downloadUrl: String? = null, @SerialName("expires_at") val expiresAt: String? = null, @SerialName("created_at") val createdAt: String = "")
@Serializable data class DeleteAccountDto(@SerialName("confirm_email") val confirmEmail: String, val reason: String? = null)
@Serializable data class DeletionDto(val id: String, val state: String)
