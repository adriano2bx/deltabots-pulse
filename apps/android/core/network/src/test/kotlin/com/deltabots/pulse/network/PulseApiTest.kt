package com.deltabots.pulse.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.utils.io.core.toByteArray
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.time.Instant
import java.util.Base64
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class PulseApiTest {
    private val json = headersOf(HttpHeaders.ContentType, "application/json")
    private fun MockRequestHandleScope.ok(body: String, status: HttpStatusCode = HttpStatusCode.OK) = respond(body, status, json)
    private val tokens = """{"access_token":"at1","expires_in":900,"refresh_token":"rt_new","session_id":"ses_1","tenant_id":"ten_1"}"""

    private class TestSigner : RequestSigner {
        private val kp = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        override val publicKeySpkiBase64Url: String = Base64.getUrlEncoder().withoutPadding().encodeToString(kp.public.encoded)
        override fun sign(message: ByteArray): ByteArray = Signature.getInstance("SHA256withECDSA").run { initSign(kp.private); update(message); sign() }
        fun verify(message: ByteArray, sig: ByteArray): Boolean = Signature.getInstance("SHA256withECDSA").run { initVerify(kp.public); update(message); verify(sig) }
    }

    private fun api(signer: RequestSigner? = null, store: TokenStore = InMemoryTokenStore(), clock: () -> Instant = Instant::now, handler: suspend MockRequestHandleScope.(HttpRequestData) -> HttpResponseData) =
        PulseApi("https://api.test", HttpClient(MockEngine(handler)), store, signer, clock) to store

    @Test fun loginStoresRotatingRefreshAndUsesBearer() = runTest {
        val seen = mutableListOf<String?>()
        val (api, store) = api { req ->
            seen += req.headers["authorization"]
            when (req.url.encodedPath) {
                "/v1/auth/login" -> ok(tokens)
                "/v1/me" -> ok("""{"data":{"id":"usr_1","email":"a@b.test","mfa_enabled":false}}""")
                else -> respond("", HttpStatusCode.NotFound)
            }
        }
        api.login(LoginRequest("a@b.test", "senha-forte-123"))
        assertEquals("rt_new", store.load()?.refreshToken)
        assertEquals("usr_1", api.me().id)
        assertEquals("Bearer at1", seen.last())
    }

    @Test fun expiredAccessTriggersSingleRefreshAndRotates() = runTest {
        var refreshCalls = 0
        var now = Instant.parse("2026-10-11T12:00:00Z")
        val (api, store) = api(clock = { now }) { req ->
            when (req.url.encodedPath) {
                "/v1/auth/login" -> ok(tokens)
                "/v1/auth/refresh" -> { refreshCalls++; ok("""{"access_token":"at2","expires_in":900,"refresh_token":"rt_${refreshCalls + 1}","session_id":"ses_1","tenant_id":"ten_1"}""") }
                else -> ok("""{"data":{"id":"usr_1","email":"a@b.test"}}""")
            }
        }
        api.login(LoginRequest("a@b.test", "senha-forte-123"))
        now = now.plusSeconds(1000)
        api.me(); api.me()
        assertEquals(1, refreshCalls)
        assertEquals("rt_2", store.load()?.refreshToken)
    }

    @Test fun problemJsonBecomesTypedException() = runTest {
        val (api, _) = api { ok("""{"type":"x","title":"Consentimento necessário","status":403,"code":"CONSENT_REQUIRED","trace_id":"trc_9","detail":"conceda health_processing"}""", HttpStatusCode.Forbidden) }
        try {
            api.login(LoginRequest("a@b.test", "x"))
            fail()
        } catch (e: ApiException) {
            assertEquals("CONSENT_REQUIRED", e.code); assertEquals(403, e.status); assertEquals("trc_9", e.traceId)
        }
    }

    @Test fun networkFailureIsOfflineNotCrash() = runTest {
        val (api, _) = api { throw java.io.IOException("sem rota") }
        try {
            api.login(LoginRequest("a@b.test", "x"))
            fail()
        } catch (e: ApiException) {
            assertTrue(e.isOffline); assertEquals("OFFLINE", e.code)
        }
    }

    @Test fun gatewayRequestsCarryVerifiableSignature() = runTest {
        val signer = TestSigner()
        var captured: HttpRequestData? = null
        var bodyText = ""
        val (api, _) = api(signer) { req ->
            captured = req
            if (req.url.encodedPath == "/v1/auth/login") ok(tokens)
            else { bodyText = (req.body as io.ktor.http.content.TextContent).text; ok("""{"batch_id":"b1","accepted":["r1"],"duplicates":[],"rejected":[],"server_time":"x"}""") }
        }
        api.login(LoginRequest("a@b.test", "x"))
        val ack = api.ingest(BatchRequest("gw_1", "dev_1", "b1", listOf(ReadingDto("r1", "heart_rate_bpm", "2026-10-11T12:00:00Z", JsonPrimitive(72), "bpm", "measured", "ble_miband3"))))
        assertEquals(listOf("r1"), ack.accepted)
        val ts = captured!!.headers["x-pulse-timestamp"]
        val sig = captured!!.headers["x-pulse-signature"]
        assertNotNull(ts); assertNotNull(sig)
        val msg = SigningMessage.build("POST", "/v1/telemetry/batch", ts!!, bodyText)
        assertTrue(signer.verify(msg.toByteArray(), Base64.getUrlDecoder().decode(sig!!)))
        assertFalse(signer.verify(msg.replace("batch", "batcH").toByteArray(), Base64.getUrlDecoder().decode(sig)))   // adulteração invalida
    }

    @Test fun signedCallWithoutKeyFailsClosed() = runTest {
        val (api, _) = api(signer = null) { req -> if (req.url.encodedPath.endsWith("login")) ok(tokens) else ok("{}") }
        api.login(LoginRequest("a@b.test", "x"))
        try {
            api.ingest(BatchRequest("g", "d", "b", emptyList()))
            fail()
        } catch (e: ApiException) {
            assertEquals("SIGNER_MISSING", e.code)
        }
    }

    @Test fun logoutClearsLocalSessionEvenOffline() = runTest {
        val store = InMemoryTokenStore()
        var offline = false
        val (api, _) = api(store = store) { req -> if (offline) throw java.io.IOException("x") else ok(tokens) }
        api.login(LoginRequest("a@b.test", "x"))
        offline = true
        api.logout()
        assertEquals(null, store.load())
    }

    @Test fun automationsListSurfacesKillSwitchAndPatchCarriesVersion() = runTest {
        var patchBody = ""
        var patchPath = ""
        val (api, _) = api(store = InMemoryTokenStore().also { it.save(StoredSession("rt", "ten_1", "ses_1")) }) { req ->
            when {
                req.url.encodedPath == "/v1/auth/refresh" -> ok(tokens)
                req.method.value == "GET" && req.url.encodedPath == "/v1/automations" ->
                    ok("""{"data":[{"id":"aut_1","title":"Bateria baixa","enabled":false,"version":3,"risk_level":"low"}],"next_cursor":null,"meta":{"kill_switch":true}}""")
                req.method.value == "PATCH" -> {
                    patchPath = req.url.encodedPath
                    patchBody = (req.body as io.ktor.http.content.TextContent).text
                    ok("""{"data":{"id":"aut_1","title":"Bateria baixa","enabled":true,"version":4}}""")
                }
                else -> respond("", HttpStatusCode.NotFound)
            }
        }
        val list = api.automations()
        assertTrue(list.meta.killSwitch)
        assertEquals(3, list.data.single().version)
        val updated = api.setAutomationEnabled("aut_1", 3, true)
        assertEquals("/v1/automations/aut_1", patchPath)
        assertTrue(patchBody.contains("\"expected_version\":3"))
        assertTrue(patchBody.contains("\"enabled\":true"))
        assertEquals(4, updated.version)
    }
}
