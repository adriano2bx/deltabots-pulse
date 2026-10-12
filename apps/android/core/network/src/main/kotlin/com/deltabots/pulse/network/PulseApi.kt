package com.deltabots.pulse.network

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import java.time.Instant
import java.util.Base64
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

/** Falha tipada da API — o código segue docs/10 (AUTH_REQUIRED, CONSENT_REQUIRED, ...). */
class ApiException(val status: Int, val code: String, override val message: String, val traceId: String = "") : Exception(message) {
    val isAuth get() = code == "AUTH_REQUIRED" || code == "TOKEN_EXPIRED"
    val isOffline get() = status == 0
}

val PulseJson = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }

class PulseApi(
    private val baseUrl: String,
    client: HttpClient,
    private val store: TokenStore,
    private val signer: RequestSigner? = null,
    private val clock: () -> Instant = Instant::now,
) {
    private val http = client.config { install(ContentNegotiation) { json(PulseJson) } }
    private val refreshLock = Mutex()
    private var access: Pair<String, Long>? = null
    private var gatewayId: String? = null

    private suspend fun accessToken(): String {
        val a = access
        if (a != null && a.second - clock().toEpochMilli() > 60_000) return a.first
        return refreshLock.withLock {
            val again = access
            if (again != null && again.second - clock().toEpochMilli() > 60_000) return@withLock again.first
            val session = store.load() ?: throw ApiException(401, "AUTH_REQUIRED", "sem sessão")
            val t = send(HttpMethod.Post, "/auth/refresh", RefreshRequest(session.refreshToken), false, false, emptyMap()).body<AuthTokens>()
            // Rotação: o novo refresh token substitui o antigo antes de qualquer outra chamada.
            store.save(session.copy(refreshToken = t.refreshToken ?: session.refreshToken, tenantId = t.tenantId.ifEmpty { session.tenantId }))
            access = t.accessToken to clock().toEpochMilli() + t.expiresIn * 1000L
            t.accessToken
        }
    }

    private suspend fun send(method: HttpMethod, path: String, body: Any?, auth: Boolean, signed: Boolean, query: Map<String, String>): HttpResponse {
        val bodyText = if (body == null) "" else encode(body)
        val res = try {
            http.request("$baseUrl/v1$path") {
                this.method = method
                query.forEach { (k, v) -> url.parameters.append(k, v) }
                if (auth) header("authorization", "Bearer ${accessToken()}")
                if (body != null) {
                    contentType(ContentType.Application.Json)
                    setBody(bodyText)
                }
                if (signed) {
                    val s = signer ?: throw ApiException(0, "SIGNER_MISSING", "chave do gateway indisponível")
                    val ts = clock().toString()
                    val msg = SigningMessage.build(method.value, "/v1$path", ts, bodyText)
                    header("x-pulse-timestamp", ts)
                    header("x-pulse-signature", Base64.getUrlEncoder().withoutPadding().encodeToString(s.sign(msg.toByteArray())))
                }
            }
        } catch (e: ApiException) {
            throw e
        } catch (e: Exception) {
            throw ApiException(0, "OFFLINE", e.message ?: "sem conexão")
        }
        if (res.status.value in 200..299) return res
        val text = res.bodyAsText()
        val p = runCatching { PulseJson.decodeFromString(Problem.serializer(), text) }.getOrNull()
        throw ApiException(res.status.value, p?.code ?: "HTTP_${res.status.value}", p?.detail ?: p?.title ?: "erro ${res.status.value}", p?.traceId ?: "")
    }

    private fun encode(body: Any): String = when (body) {
        is RegisterRequest -> PulseJson.encodeToString(RegisterRequest.serializer(), body)
        is LoginRequest -> PulseJson.encodeToString(LoginRequest.serializer(), body)
        is RefreshRequest -> PulseJson.encodeToString(RefreshRequest.serializer(), body)
        is CreateConsent -> PulseJson.encodeToString(CreateConsent.serializer(), body)
        is GatewayRegister -> PulseJson.encodeToString(GatewayRegister.serializer(), body)
        is DeviceRegister -> PulseJson.encodeToString(DeviceRegister.serializer(), body)
        is DeviceUpdate -> PulseJson.encodeToString(DeviceUpdate.serializer(), body)
        is BatchRequest -> PulseJson.encodeToString(BatchRequest.serializer(), body)
        is Heartbeat -> PulseJson.encodeToString(Heartbeat.serializer(), body)
        is CommandAck -> PulseJson.encodeToString(CommandAck.serializer(), body)
        is ExportRequestDto -> PulseJson.encodeToString(ExportRequestDto.serializer(), body)
        is DeleteAccountDto -> PulseJson.encodeToString(DeleteAccountDto.serializer(), body)
        is UpdateAutomation -> PulseJson.encodeToString(UpdateAutomation.serializer(), body)
        is kotlinx.serialization.json.JsonElement -> PulseJson.encodeToString(kotlinx.serialization.json.JsonElement.serializer(), body)
        else -> error("tipo não serializável: ${body::class}")
    }

    // ------------------------------------------------------------------ autenticação
    suspend fun register(req: RegisterRequest, label: String? = null): AuthTokens = startSession(send(HttpMethod.Post, "/auth/register", req, false, false, emptyMap()).body())

    suspend fun login(req: LoginRequest): AuthTokens = startSession(send(HttpMethod.Post, "/auth/login", req, false, false, emptyMap()).body())

    private suspend fun startSession(t: AuthTokens): AuthTokens {
        store.save(StoredSession(t.refreshToken ?: error("sem refresh token"), t.tenantId, t.sessionId, gatewayId))
        access = t.accessToken to clock().toEpochMilli() + t.expiresIn * 1000L
        return t
    }

    suspend fun logout() {
        runCatching { send(HttpMethod.Post, "/auth/logout", null, true, false, emptyMap()) }
        store.clear()
        access = null
    }

    suspend fun me(): UserDto = send(HttpMethod.Get, "/me", null, true, false, emptyMap()).body<Envelope<UserDto>>().data

    // ------------------------------------------------------------------ consentimentos / gateway / dispositivos
    suspend fun consents(): List<ConsentDto> = send(HttpMethod.Get, "/consents", null, true, false, emptyMap()).body<ListEnvelope<ConsentDto>>().data
    suspend fun grantConsent(c: CreateConsent): ConsentDto = send(HttpMethod.Post, "/consents", c, true, false, emptyMap()).body<Envelope<ConsentDto>>().data
    suspend fun revokeConsent(id: String) { send(HttpMethod.Delete, "/consents/$id", null, true, false, emptyMap()) }

    suspend fun registerGateway(g: GatewayRegister): GatewayDto {
        val dto = send(HttpMethod.Post, "/gateways", g, true, false, emptyMap()).body<Envelope<GatewayDto>>().data
        gatewayId = dto.id
        store.load()?.let { store.save(it.copy(gatewayId = dto.id)) }
        return dto
    }

    suspend fun registerDevice(d: DeviceRegister): DeviceDto = send(HttpMethod.Post, "/devices", d, true, true, emptyMap()).body<Envelope<DeviceDto>>().data
    suspend fun reportCapabilities(deviceId: String, caps: List<CapabilityReport>): DeviceDto = send(HttpMethod.Patch, "/devices/$deviceId", DeviceUpdate(capabilities = caps), true, true, emptyMap()).body<Envelope<DeviceDto>>().data

    // ------------------------------------------------------------------ telemetria
    suspend fun ingest(batch: BatchRequest): BatchAckDto = send(HttpMethod.Post, "/telemetry/batch", batch, true, true, emptyMap()).body()

    suspend fun heartbeat(gatewayId: String, hb: Heartbeat): HeartbeatAck = send(HttpMethod.Post, "/gateways/$gatewayId/heartbeat", hb, true, true, emptyMap()).body<Envelope<HeartbeatAck>>().data
    suspend fun pendingCommands(gatewayId: String): List<PendingCommand> = send(HttpMethod.Get, "/gateways/$gatewayId/commands", null, true, true, emptyMap()).body<ListEnvelope<PendingCommand>>().data
    suspend fun ackCommand(gatewayId: String, commandId: String, ack: CommandAck) { send(HttpMethod.Post, "/gateways/$gatewayId/commands/$commandId/ack", ack, true, true, emptyMap()) }

    // ------------------------------------------------------------------ automações / alertas
    suspend fun automations(): AutomationListEnvelope = send(HttpMethod.Get, "/automations", null, true, false, emptyMap()).body()
    suspend fun automationTemplates(): List<AutomationTemplate> = send(HttpMethod.Get, "/automations/templates", null, true, false, emptyMap()).body<ListEnvelope<AutomationTemplate>>().data
    /** Modelos nascem desativados (a API valida o AST e o risco); ativar é uma ação explícita do usuário. */
    suspend fun createAutomation(ast: kotlinx.serialization.json.JsonElement): AutomationDto = send(HttpMethod.Post, "/automations", ast, true, false, emptyMap()).body<Envelope<AutomationDto>>().data
    suspend fun setAutomationEnabled(id: String, version: Int, enabled: Boolean): AutomationDto =
        send(HttpMethod.Patch, "/automations/$id", UpdateAutomation(version, enabled), true, false, emptyMap()).body<Envelope<AutomationDto>>().data
    suspend fun alerts(): List<AlertDto> = send(HttpMethod.Get, "/alerts", null, true, false, emptyMap()).body<ListEnvelope<AlertDto>>().data
    suspend fun ackAlert(id: String) { send(HttpMethod.Post, "/alerts/$id/ack", null, true, false, emptyMap()) }

    // ------------------------------------------------------------------ LGPD: exportação e exclusão
    suspend fun exports(): List<ExportJobDto> = send(HttpMethod.Get, "/exports", null, true, false, emptyMap()).body<ListEnvelope<ExportJobDto>>().data
    suspend fun requestExport(kind: String): ExportJobDto = send(HttpMethod.Post, "/exports", ExportRequestDto(kind), true, false, emptyMap()).body<Envelope<ExportJobDto>>().data
    /** Download autenticado; só o titular consegue. O conteúdo nunca é registrado em log. */
    suspend fun downloadExport(id: String): ByteArray = send(HttpMethod.Get, "/exports/$id/download", null, true, false, emptyMap()).body()
    suspend fun requestAccountDeletion(confirmEmail: String, reason: String? = null): DeletionDto =
        send(HttpMethod.Post, "/me/delete", DeleteAccountDto(confirmEmail, reason), true, false, emptyMap()).body<Envelope<DeletionDto>>().data
}
