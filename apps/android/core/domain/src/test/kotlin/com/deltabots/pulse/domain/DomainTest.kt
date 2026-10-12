package com.deltabots.pulse.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainTest {
    private fun prov(at: Long, q: Quality = Quality.MEASURED) = Provenance("dev_1", "device:Mi Band 3", at, q)

    @Test fun freshnessMarksStaleWithAge() {
        val now = 10_000_000L
        assertTrue(Freshness.stateFor("heart_rate_bpm", 70, prov(now - 5 * 60_000), now) is ScreenState.Data)
        val s = Freshness.stateFor("heart_rate_bpm", 70, prov(now - 2 * 3600_000), now)
        assertTrue(s is ScreenState.Stale && s.ageMs == 2 * 3600_000L)
        assertTrue(Freshness.stateFor<Int>("heart_rate_bpm", null, null, now) is ScreenState.Empty)
        assertTrue(Freshness.stateFor("heart_rate_bpm", 70, prov(now, Quality.INVALID), now) is ScreenState.Error)
        assertEquals("há 2 h", Freshness.humanAge(2 * 3600_000))
    }

    @Test fun capabilitiesNeverSupportedWithoutEvidence() {
        val ev = Evidence(
            characteristics = setOf("00000009-0000-3512-2118-0009af100700", "00000006-0000-3512-2118-0009af100700"),
            observed = setOf(CapabilityId.BATTERY),
        )
        val caps = CapabilityProber.probe(ev, "V2.4.0.32", "miband3-1.0", 1L)
        assertTrue(CapabilityProber.isUsable(caps, CapabilityId.BATTERY))
        assertEquals(SupportState.UNVERIFIED, caps.first { it.id == CapabilityId.AUTH }.state)          // GATT presente ≠ comprovado
        assertEquals(SupportState.UNSUPPORTED, caps.first { it.id == CapabilityId.RAW_ACCEL }.state)     // característica ausente
        assertEquals(SupportState.UNSUPPORTED, caps.first { it.id == CapabilityId.FIRMWARE_OTA }.state)
        assertFalse(CapabilityProber.isUsable(caps, CapabilityId.HR_ON_DEMAND))
    }

    @Test fun rawAccelPresentIsStillUnverified() {
        val ev = Evidence(setOf("00000002-0000-3512-2118-0009af100700"), emptySet())
        val c = CapabilityProber.probe(ev, null, "d", 1).first { it.id == CapabilityId.RAW_ACCEL }
        assertEquals(SupportState.UNVERIFIED, c.state)
    }

    @Test fun bleHappyPathAndStableReconnect() {
        val m = BleStateMachine()
        var t = 0L
        listOf(BleEvent.Initialize, BleEvent.PermissionResult(true), BleEvent.Connect, BleEvent.GattConnected, BleEvent.ServicesDiscovered, BleEvent.Authenticated, BleEvent.CapabilitiesProbed)
            .forEach { m.reduce(it, t++) }
        assertEquals(BleState.READY, m.snapshot.state)
        val s = m.reduce(BleEvent.Disconnected(8), 120_000)       // estável > 60 s → contador zera
        assertEquals(1, s.failedAttempts.coerceAtLeast(1)); assertEquals(0, s.failedAttempts)
        assertEquals(5_000L, s.nextRetryDelayMs?.let { 5_000L })
    }

    @Test fun bleGivesUpAfterRepeatedEarlyDrops() {
        val m = BleStateMachine(RetryPolicy(maxAttempts = 4))
        m.reduce(BleEvent.Initialize, 0); m.reduce(BleEvent.PermissionResult(true), 0)
        var snap = m.snapshot
        repeat(4) { i ->
            m.reduce(BleEvent.Connect, i * 10L)
            m.reduce(BleEvent.GattConnected, i * 10L + 1)
            snap = m.reduce(BleEvent.Disconnected(0), i * 10L + 2)       // cai antes de autenticar
        }
        assertEquals(BleState.ERROR, snap.state)
        assertFalse(snap.userWantsConnection)
        assertTrue(snap.giveUpReason!!.contains("recusou"))
    }

    @Test fun bleBackoffIsExponentialAndCapped() {
        val p = RetryPolicy(baseDelayMs = 5_000, maxDelayMs = 60_000)
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 40_000L, 60_000L), (1..5).map { p.delayFor(it) })
    }

    @Test fun userDisconnectStopsRetries() {
        val m = BleStateMachine()
        m.reduce(BleEvent.Initialize, 0); m.reduce(BleEvent.PermissionResult(true), 0); m.reduce(BleEvent.Connect, 0)
        m.reduce(BleEvent.UserDisconnect, 1)
        val s = m.reduce(BleEvent.Disconnected(133), 2)
        assertEquals(BleState.DISCONNECTED, s.state); assertNull(s.nextRetryDelayMs)
    }

    @Test fun stepsNormalizerHandlesReset() {
        val n = StepsNormalizer()
        assertNull(n.next(9000))
        assertEquals(StepsNormalizer.Step(500, false), n.next(9500))
        assertEquals(StepsNormalizer.Step(200, true), n.next(200))
    }

    @Test fun readingValidatorMarksAbsurdValuesInvalid() {
        assertEquals(Quality.INVALID, ReadingValidator.qualityFor(ReadingKind.HEART_RATE, 900.0))
        assertEquals(Quality.MEASURED, ReadingValidator.qualityFor(ReadingKind.HEART_RATE, 72.0))
        assertEquals(26, Ulid.generate().length)
    }

    private fun item(id: String, dev: String = "d1", at: Long = 1, attempts: Int = 0) =
        OutboxItem(id, dev, "heart_rate_bpm", at, 70.0, null, "measured", "ble_miband3", null, attempts)

    @Test fun outboxBatchesPerDeviceAndHonorsAck() {
        val items = (1..450).map { item("r$it", at = it.toLong()) } + item("x1", dev = "d2")
        val batches = OutboxPolicy.nextBatches(items, nowMs = 1000, maxBatches = 10)
        assertEquals(listOf(200, 200, 50, 1), batches.map { it.size })
        val b = listOf(item("a"), item("b"), item("c"), item("d"), item("e"))
        val out = OutboxPolicy.apply(b, BatchAck("batch", setOf("a"), setOf("b"), mapOf("c" to "UNIT_MISMATCH", "d" to "CONSENT_REQUIRED")), 1000)
        assertEquals(setOf("a", "b"), out.toDelete)
        assertEquals(OutboxState.REJECTED_PERMANENT, out.toUpdate.first { it.readingId == "c" }.state)
        assertTrue(out.toUpdate.first { it.readingId == "d" }.nextAttemptAtMs > 1000)
        assertEquals(1, out.toUpdate.first { it.readingId == "e" }.attempts)                      // sem ACK individual → permanece
    }

    @Test fun outboxNeverDropsOnNetworkFailureUntilMaxAttempts() {
        var b = listOf(item("a"))
        repeat(OutboxPolicy.MAX_ATTEMPTS - 1) { b = OutboxPolicy.failBatch(b, 0, "HTTP_503") }
        assertEquals(OutboxState.PENDING, b[0].state)
        b = OutboxPolicy.failBatch(b, 0, "HTTP_503")
        assertEquals(OutboxState.REJECTED_PERMANENT, b[0].state)
    }
}
