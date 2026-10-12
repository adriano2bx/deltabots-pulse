package com.deltabots.pulse.domain

import com.deltabots.pulse.domain.gestures.DtwClassifier
import com.deltabots.pulse.domain.gestures.Debouncer
import com.deltabots.pulse.domain.gestures.Evaluation
import com.deltabots.pulse.domain.gestures.EngineStatus
import com.deltabots.pulse.domain.gestures.GestureEngine
import com.deltabots.pulse.domain.gestures.GestureMode
import com.deltabots.pulse.domain.gestures.Prediction
import com.deltabots.pulse.domain.gestures.Sample
import com.deltabots.pulse.domain.gestures.SensorSource
import com.deltabots.pulse.domain.gestures.SignalDiagnostics
import com.deltabots.pulse.domain.gestures.Template
import java.util.Random
import kotlin.math.PI
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Sinais SINTÉTICOS (rotulados) — não representam a Mi Band 3. */
class GesturesTest {
    private val hz = 50f
    private fun gesture(kind: String, seed: Long, startNs: Long = 0, seconds: Float = 1.2f): List<Sample> {
        val r = Random(seed)
        val n = (seconds * hz).toInt()
        return (0 until n).map { i ->
            val t = i / hz
            val noise = { (r.nextGaussian() * 0.05).toFloat() }
            // A fase varia por gravação (como gestos reais), preservando o rótulo.
            val phase = (seed % 7) * 0.9
            val pulse = sin(2 * PI * 2 * t + phase).toFloat() * 6f
            when (kind) {
                "wrist_right" -> Sample(startNs + (t * 1e9).toLong(), pulse + noise(), noise(), 9.8f + noise())
                "wrist_up" -> Sample(startNs + (t * 1e9).toLong(), noise(), noise(), 9.8f + pulse + noise())
                else -> Sample(startNs + (t * 1e9).toLong(), noise(), pulse + noise(), 9.8f + noise())
            }
        }
    }

    private fun series(s: List<Sample>) = com.deltabots.pulse.domain.gestures.Filters.linear(s).map { floatArrayOf(it.first, it.second, it.third) }

    private fun classifier(): DtwClassifier = DtwClassifier(
        listOf("wrist_right", "wrist_up", "wrist_left").flatMap { l -> (1L..6L).map { Template(l, series(gesture(l, it))) } },
    )

    @Test fun classifiesSyntheticGesturesAndRejectsNoise() {
        val c = classifier()
        for (l in listOf("wrist_right", "wrist_up", "wrist_left")) {
            val p = c.classify(series(gesture(l, 99)), 0.5f)
            assertEquals(l, p.label)
        }
        val r = Random(5)
        val noise = (0 until 60).map { floatArrayOf((r.nextGaussian() * 0.05).toFloat(), (r.nextGaussian() * 0.05).toFloat(), (r.nextGaussian() * 0.05).toFloat()) }
        val p = c.classify(noise, 0.7f)
        assertNull(p.label)
    }

    @Test fun diagnosticsDetectDropouts() {
        val ok = gesture("wrist_right", 1, seconds = 2f)
        assertTrue(SignalDiagnostics.analyze(ok, hz).usable)
        val holes = ok.filterIndexed { i, _ -> i % 3 != 0 }
        assertFalse(SignalDiagnostics.analyze(holes, hz).usable)
    }

    @Test fun rawMiBandIsUnsupportedWithoutCapability() {
        val e = GestureEngine(SensorSource.MIBAND3_RAW, rawAccelSupported = false, classifier = classifier(), modelVersion = "g1", sampleRateHz = hz)
        assertTrue(e.status() is EngineStatus.Unsupported)
        assertFalse(e.setMode(GestureMode.RECOGNIZE_LOCAL))
        assertNull(gesture("wrist_right", 7, seconds = 3f).firstNotNullOfOrNull { e.onSample(it, 0) })
    }

    @Test fun controlRequiresLocalArmAndClearsOnDisarm() {
        val e = GestureEngine(SensorSource.ANDROID_IMU, rawAccelSupported = false, classifier = classifier(), modelVersion = "g1", sampleRateHz = hz)
        assertFalse(e.setMode(GestureMode.CONTROL_ARMED))          // sem armação local
        e.armLocally()
        assertTrue(e.setMode(GestureMode.CONTROL_ARMED))
        assertTrue(e.mayActuate())
        e.disarm("ws perdido")
        assertFalse(e.mayActuate())
        assertEquals(GestureMode.OBSERVE, e.mode)
    }

    @Test fun detectsWithDebounce() {
        val e = GestureEngine(SensorSource.ANDROID_IMU, false, classifier(), "g1", hz, Debouncer(1200))
        e.setMode(GestureMode.RECOGNIZE_LOCAL)
        val stream = gesture("wrist_up", 11, seconds = 4f)
        val hits = stream.mapIndexedNotNull { i, s -> e.onSample(s, i * 20L) }
        assertTrue(hits.isNotEmpty())
        assertTrue(hits.all { it.label == "wrist_up" && it.source == SensorSource.ANDROID_IMU })
        // refratário: em 4 s no máximo ~3 disparos
        assertTrue(hits.size <= 4)
        assertNotNull(hits.first().modelVersion)
    }

    @Test fun evaluationGateRejectsSyntheticAndWeakModels() {
        val labels = listOf("a", "b")
        val strong = (1..20).map { Evaluation.Case("a", "a", "s${it % 3}") } + (1..20).map { Evaluation.Case("b", "b", "s${it % 3}") }
        val r = Evaluation.evaluate(strong, labels, nonGestureHours = 8f)
        assertTrue(Evaluation.meetsActivationGate(r, SensorSource.ANDROID_IMU))
        assertFalse(Evaluation.meetsActivationGate(r, SensorSource.SYNTHETIC_LAB))            // sintético nunca atua
        val falsePositives = strong + (1..3).map { Evaluation.Case(null, "a", "s1") }
        assertFalse(Evaluation.meetsActivationGate(Evaluation.evaluate(falsePositives, labels, 8f), SensorSource.ANDROID_IMU))
        val weak = (1..10).map { Evaluation.Case("a", "b", "s1") } + (1..10).map { Evaluation.Case("b", "b", "s2") }
        assertFalse(Evaluation.meetsActivationGate(Evaluation.evaluate(weak, labels, 8f), SensorSource.ANDROID_IMU))
    }

    @Test fun predictionReasonsAreExplicit() {
        val c = DtwClassifier(emptyList())
        assertEquals(Prediction.Reason.INSUFFICIENT_SIGNAL, c.classify(emptyList(), 0.5f).reason)
        assertEquals(Prediction.Reason.NO_TEMPLATES, c.classify(series(gesture("wrist_up", 1)), 0.5f).reason)
    }
}
