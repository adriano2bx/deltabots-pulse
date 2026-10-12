package com.deltabots.pulse.domain.gestures

/** Métricas de holdout por sessão (nunca quadros aleatórios correlacionados) — docs/07. */
data class EvaluationReport(
    val labels: List<String>,
    val confusion: List<List<Int>>,
    val macroPrecision: Float,
    val macroRecall: Float,
    val balancedAccuracy: Float,
    val falseActivationsPerHour: Float,
    val latencyP95Ms: Float,
    val holdoutSessions: Int,
)

object Evaluation {
    /** Gate de ativação para atuar em equipamento (mesmo da API: ACTIVATION_GATE). */
    const val MIN_PRECISION = 0.95f
    const val MIN_RECALL = 0.90f
    const val MAX_FALSE_PER_HOUR = 1f / 8f

    data class Case(val truth: String?, val predicted: String?, val sessionId: String, val latencyMs: Float = 0f)

    fun evaluate(cases: List<Case>, labels: List<String>, nonGestureHours: Float): EvaluationReport {
        val idx = labels.withIndex().associate { it.value to it.index }
        val n = labels.size
        val confusion = MutableList(n) { MutableList(n) { 0 } }
        var falseActivations = 0
        for (c in cases) {
            val t = c.truth?.let { idx[it] }
            val p = c.predicted?.let { idx[it] }
            if (t != null && p != null) confusion[t][p]++
            else if (t != null && p == null) { /* falso negativo: contado na revocação */ }
            else if (t == null && p != null) falseActivations++
        }
        val truthCount = IntArray(n)
        val tp = IntArray(n)
        val predicted = IntArray(n)
        for (c in cases) {
            c.truth?.let { idx[it] }?.let { truthCount[it]++ }
            c.predicted?.let { idx[it] }?.let { predicted[it]++ }
        }
        for (i in 0 until n) tp[i] = confusion[i][i]
        val precisions = (0 until n).map { if (predicted[it] == 0) 0f else tp[it].toFloat() / predicted[it] }
        val recalls = (0 until n).map { if (truthCount[it] == 0) 0f else tp[it].toFloat() / truthCount[it] }
        val lat = cases.filter { it.predicted != null }.map { it.latencyMs }.sorted()
        return EvaluationReport(
            labels, confusion,
            precisions.average().toFloat(), recalls.average().toFloat(), recalls.average().toFloat(),
            if (nonGestureHours > 0) falseActivations / nonGestureHours else Float.POSITIVE_INFINITY,
            if (lat.isEmpty()) 0f else lat[((lat.size - 1) * 0.95).toInt()],
            cases.map { it.sessionId }.toSet().size,
        )
    }

    fun meetsActivationGate(r: EvaluationReport, source: SensorSource): Boolean =
        source != SensorSource.SYNTHETIC_LAB && r.holdoutSessions >= 2 &&
            r.macroPrecision >= MIN_PRECISION && r.macroRecall >= MIN_RECALL && r.falseActivationsPerHour <= MAX_FALSE_PER_HOUR
}
