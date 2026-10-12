package com.deltabots.pulse.domain.gestures

import kotlin.math.abs
import kotlin.math.min
import kotlin.math.sqrt

data class Template(val label: String, val series: List<FloatArray>)

data class Prediction(val label: String?, val confidence: Float, val reason: Reason) {
    enum class Reason { ACCEPTED, LOW_CONFIDENCE, OUT_OF_DISTRIBUTION, AMBIGUOUS, NO_TEMPLATES, INSUFFICIENT_SIGNAL }
}

/**
 * DTW multivariado com restrição de banda (Sakoe-Chiba). Baseline determinístico antes de qualquer ML (docs/07).
 * Confiança = margem entre o melhor e o segundo melhor rótulo; fora de distribuição = distância > limiar.
 */
class DtwClassifier(
    private val templates: List<Template>,
    private val bandRatio: Float = 0.2f,
    /** Se nulo, é calibrado a partir da dispersão intra-classe dos próprios modelos. */
    oodDistance: Float? = null,
    private val minMargin: Float = 0.15f,
    private val minAmplitudeRatio: Float = 0.3f,
) {
    private fun rms(series: List<FloatArray>): Float {
        if (series.isEmpty()) return 0f
        var sum = 0.0
        var n = 0
        for (v in series) for (x in v) { sum += x * x; n++ }
        return sqrt(sum / n).toFloat()
    }

    /** Remove a média por eixo e escala por um desvio conjunto: preserva a energia relativa entre eixos. */
    private fun norm(series: List<FloatArray>): List<FloatArray> {
        if (series.isEmpty()) return series
        val dims = series[0].size
        val mean = FloatArray(dims) { d -> series.map { it[d] }.average().toFloat() }
        var acc = 0.0
        for (v in series) for (d in 0 until dims) acc += (v[d] - mean[d]) * (v[d] - mean[d])
        val scale = sqrt(acc / (series.size * dims)).toFloat().coerceAtLeast(1e-3f)
        return series.map { v -> FloatArray(dims) { d -> (v[d] - mean[d]) / scale } }
    }

    private val minTemplateRms: Float = templates.minOfOrNull { rms(it.series) } ?: 0f

    fun distance(a: List<FloatArray>, b: List<FloatArray>): Float {
        val x = norm(a)
        val y = norm(b)
        val n = x.size
        val m = y.size
        val band = maxOf((maxOf(n, m) * bandRatio).toInt(), abs(n - m))
        val inf = Float.MAX_VALUE / 4
        var prev = FloatArray(m + 1) { inf }
        prev[0] = 0f
        for (i in 1..n) {
            val cur = FloatArray(m + 1) { inf }
            val lo = maxOf(1, i - band)
            val hi = min(m, i + band)
            for (j in lo..hi) {
                var d = 0f
                for (k in x[i - 1].indices) {
                    val diff = x[i - 1][k] - y[j - 1][k]
                    d += diff * diff
                }
                cur[j] = sqrt(d) + minOf(prev[j], cur[j - 1], prev[j - 1])
            }
            prev = cur
        }
        return prev[m] / (n + m)
    }

    /** Limiar OOD: 3× a maior distância entre modelos da mesma classe (com piso), nunca um número mágico fixo. */
    private val ood: Float = oodDistance ?: run {
        var maxIntra = 0f
        for ((_, ts) in templates.groupBy { it.label }) {
            for (i in ts.indices) for (j in i + 1 until ts.size) maxIntra = maxOf(maxIntra, distance(ts[i].series, ts[j].series))
        }
        maxOf(maxIntra * 3f, 0.5f)
    }

    fun classify(window: List<FloatArray>, minConfidence: Float): Prediction {
        if (window.size < 8) return Prediction(null, 0f, Prediction.Reason.INSUFFICIENT_SIGNAL)
        if (templates.isEmpty()) return Prediction(null, 0f, Prediction.Reason.NO_TEMPLATES)
        if (rms(window) < minTemplateRms * minAmplitudeRatio) return Prediction(null, 0f, Prediction.Reason.INSUFFICIENT_SIGNAL)
        val perLabel = templates.groupBy { it.label }.mapValues { (_, ts) -> ts.minOf { t -> distance(window, t.series) } }
        val sorted = perLabel.entries.sortedBy { it.value }
        val best = sorted[0]
        if (best.value > ood) return Prediction(null, 0f, Prediction.Reason.OUT_OF_DISTRIBUTION)
        val second = sorted.getOrNull(1)?.value
        val margin = if (second == null) 1f else ((second - best.value) / second).coerceIn(0f, 1f)
        if (margin < minMargin) return Prediction(null, margin, Prediction.Reason.AMBIGUOUS)
        val confidence = (1f - best.value / ood).coerceIn(0f, 1f) * 0.4f + margin * 0.6f
        return if (confidence >= minConfidence) Prediction(best.key, confidence, Prediction.Reason.ACCEPTED)
        else Prediction(null, confidence, Prediction.Reason.LOW_CONFIDENCE)
    }
}

/** Debounce/refratário: um mesmo gesto não dispara duas vezes dentro do período. */
class Debouncer(private val refractoryMs: Long = 1200) {
    private val last = HashMap<String, Long>()
    fun allow(label: String, nowMs: Long): Boolean {
        val prev = last[label]
        if (prev != null && nowMs - prev < refractoryMs) return false
        last[label] = nowMs
        return true
    }
}
