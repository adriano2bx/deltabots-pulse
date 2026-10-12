package com.deltabots.pulse.domain.gestures

import kotlin.math.abs
import kotlin.math.sqrt

/** Origem do sinal — nunca apresentar gesto de outra fonte como "da Mi Band 3" (docs/07). */
enum class SensorSource { MIBAND3_RAW, ANDROID_IMU, SYNTHETIC_LAB }

/** Amostra de acelerômetro em m/s², timestamp monotônico em ns. */
data class Sample(val tNs: Long, val x: Float, val y: Float, val z: Float)

data class Window(val samples: List<Sample>, val source: SensorSource, val rateHz: Float, val dropouts: Int)

/** Diagnóstico de taxa efetiva, jitter e perdas (F331, A27). */
data class StreamDiagnostics(val effectiveHz: Float, val jitterMs: Float, val dropouts: Int, val usable: Boolean)

object SignalDiagnostics {
    fun analyze(samples: List<Sample>, expectedHz: Float): StreamDiagnostics {
        if (samples.size < 3) return StreamDiagnostics(0f, 0f, 0, false)
        val dts = samples.zipWithNext { a, b -> (b.tNs - a.tNs) / 1e6f }
        val mean = dts.average().toFloat()
        val jitter = sqrt(dts.map { (it - mean) * (it - mean) }.average().toFloat())
        val expectedMs = 1000f / expectedHz
        val drops = dts.count { it > expectedMs * 2.5f }
        val hz = if (mean > 0) 1000f / mean else 0f
        return StreamDiagnostics(hz, jitter, drops, usable = hz >= expectedHz * 0.8f && drops <= samples.size / 20)
    }
}

object Filters {
    /** Filtro passa-baixa de 1ª ordem (componente de gravidade). */
    fun gravity(samples: List<Sample>, alpha: Float = 0.9f): List<Triple<Float, Float, Float>> {
        if (samples.isEmpty()) return emptyList()
        var gx = samples[0].x
        var gy = samples[0].y
        var gz = samples[0].z
        return samples.map {
            gx = alpha * gx + (1 - alpha) * it.x
            gy = alpha * gy + (1 - alpha) * it.y
            gz = alpha * gz + (1 - alpha) * it.z
            Triple(gx, gy, gz)
        }
    }

    /** Aceleração linear = bruto − gravidade estimada. */
    fun linear(samples: List<Sample>): List<Triple<Float, Float, Float>> {
        val g = gravity(samples)
        return samples.mapIndexed { i, s -> Triple(s.x - g[i].first, s.y - g[i].second, s.z - g[i].third) }
    }
}

/** Janela deslizante adaptativa (500–1500 ms, 50% de sobreposição). */
class SlidingWindower(private val windowMs: Long = 1000, private val overlap: Float = 0.5f, private val source: SensorSource, private val rateHz: Float) {
    private val buffer = ArrayDeque<Sample>()
    private var lastEmitNs = Long.MIN_VALUE

    fun push(s: Sample): Window? {
        buffer.addLast(s)
        val windowNs = windowMs * 1_000_000
        while (buffer.size > 1 && s.tNs - buffer.first().tNs > windowNs) buffer.removeFirst()
        val span = s.tNs - buffer.first().tNs
        val stepNs = (windowNs * (1 - overlap)).toLong()
        if (span < windowNs * 0.9) return null
        if (lastEmitNs != Long.MIN_VALUE && s.tNs - lastEmitNs < stepNs) return null
        lastEmitNs = s.tNs
        val list = buffer.toList()
        return Window(list, source, rateHz, SignalDiagnostics.analyze(list, rateHz).dropouts)
    }
}

/** Features candidatas (docs/07): média/desvio/RMS por eixo, pico, jerk, energia, correlação inter-eixos, cruzamentos por zero. */
data class Features(val values: FloatArray, val names: List<String>) {
    override fun equals(other: Any?): Boolean = other is Features && values.contentEquals(other.values)
    override fun hashCode(): Int = values.contentHashCode()
}

object FeatureExtractor {
    val names = listOf(
        "mean_x", "mean_y", "mean_z", "std_x", "std_y", "std_z", "rms_x", "rms_y", "rms_z",
        "peak_x", "peak_y", "peak_z", "jerk", "energy", "corr_xy", "corr_xz", "corr_yz", "zc_x", "zc_y", "zc_z",
    )

    fun extract(window: Window): Features {
        val lin = Filters.linear(window.samples)
        val xs = lin.map { it.first }
        val ys = lin.map { it.second }
        val zs = lin.map { it.third }
        fun mean(a: List<Float>) = a.average().toFloat()
        fun std(a: List<Float>): Float {
            val m = mean(a)
            return sqrt(a.map { (it - m) * (it - m) }.average().toFloat())
        }
        fun rms(a: List<Float>) = sqrt(a.map { it * it }.average().toFloat())
        fun peak(a: List<Float>) = a.maxOf { abs(it) }
        fun corr(a: List<Float>, b: List<Float>): Float {
            val ma = mean(a)
            val mb = mean(b)
            var num = 0f
            var da = 0f
            var db = 0f
            for (i in a.indices) {
                num += (a[i] - ma) * (b[i] - mb)
                da += (a[i] - ma) * (a[i] - ma)
                db += (b[i] - mb) * (b[i] - mb)
            }
            return if (da == 0f || db == 0f) 0f else num / sqrt(da * db)
        }
        fun zc(a: List<Float>): Float = a.zipWithNext().count { (p, q) -> p * q < 0 }.toFloat() / a.size
        var jerk = 0f
        for (i in 1 until lin.size) {
            val dt = ((window.samples[i].tNs - window.samples[i - 1].tNs) / 1e9f).coerceAtLeast(1e-3f)
            jerk += sqrt(
                ((xs[i] - xs[i - 1]) / dt).let { it * it } + ((ys[i] - ys[i - 1]) / dt).let { it * it } + ((zs[i] - zs[i - 1]) / dt).let { it * it },
            )
        }
        val energy = lin.sumOf { (it.first * it.first + it.second * it.second + it.third * it.third).toDouble() }.toFloat() / lin.size
        return Features(
            floatArrayOf(
                mean(xs), mean(ys), mean(zs), std(xs), std(ys), std(zs), rms(xs), rms(ys), rms(zs),
                peak(xs), peak(ys), peak(zs), jerk / lin.size, energy, corr(xs, ys), corr(xs, zs), corr(ys, zs), zc(xs), zc(ys), zc(zs),
            ),
            names,
        )
    }
}
