package com.deltabots.pulse.domain.gestures

enum class GestureMode { OBSERVE, RECORD, CALIBRATE, TRAIN, RECOGNIZE_LOCAL, CONTROL_ARMED }

data class Detection(val label: String, val confidence: Float, val modelVersion: String, val atNs: Long, val source: SensorSource)

sealed interface EngineStatus {
    data object Ready : EngineStatus
    data class Unsupported(val reason: String) : EngineStatus
    data class Blocked(val reason: String) : EngineStatus
}

/**
 * Orquestra janela → features/série → classificador → debounce. Regras de segurança:
 * - `MIBAND3_RAW` só funciona com a capability `raw_accel_stream` SUPPORTED (nunca inventar sensor);
 * - em `CONTROL_ARMED` exige armação local ativa e confiança mínima mais alta; nunca em qualquer outro modo;
 * - sem modelo ativo, apenas observa.
 */
class GestureEngine(
    private val source: SensorSource,
    private val rawAccelSupported: Boolean,
    private val classifier: DtwClassifier?,
    private val modelVersion: String,
    private val sampleRateHz: Float,
    private val debouncer: Debouncer = Debouncer(),
) {
    var mode: GestureMode = GestureMode.OBSERVE
        private set
    var armedLocally: Boolean = false
        private set
    private val windower = SlidingWindower(windowMs = 1000, source = source, rateHz = sampleRateHz)

    fun status(): EngineStatus = when {
        source == SensorSource.MIBAND3_RAW && !rawAccelSupported ->
            EngineStatus.Unsupported("O stream bruto do acelerômetro da Mi Band 3 não foi comprovado neste firmware (HW08).")
        else -> EngineStatus.Ready
    }

    fun setMode(m: GestureMode): Boolean {
        if (status() !is EngineStatus.Ready) return false
        if (m == GestureMode.CONTROL_ARMED && (classifier == null || !armedLocally)) return false
        mode = m
        if (m != GestureMode.CONTROL_ARMED) armedLocally = armedLocally && m == GestureMode.RECOGNIZE_LOCAL
        return true
    }

    /** Armação por interação local explícita; qualquer falha a desfaz. */
    fun armLocally() {
        if (status() is EngineStatus.Ready && classifier != null) armedLocally = true
    }

    fun disarm(reason: String = "") {
        armedLocally = false
        if (mode == GestureMode.CONTROL_ARMED) mode = GestureMode.OBSERVE
    }

    fun onSample(s: Sample, nowMs: Long): Detection? {
        if (status() !is EngineStatus.Ready) return null
        if (mode != GestureMode.RECOGNIZE_LOCAL && mode != GestureMode.CONTROL_ARMED) return null
        val clf = classifier ?: return null
        val window = windower.push(s) ?: return null
        val diag = SignalDiagnostics.analyze(window.samples, sampleRateHz)
        if (!diag.usable) return null // sinal insuficiente → ambíguo → nada de ação
        val series = Filters.linear(window.samples).map { floatArrayOf(it.first, it.second, it.third) }
        val minConf = if (mode == GestureMode.CONTROL_ARMED) 0.85f else 0.7f
        val p = clf.classify(series, minConf)
        val label = p.label ?: return null
        if (!debouncer.allow(label, nowMs)) return null
        return Detection(label, p.confidence, modelVersion, s.tNs, source)
    }

    /** Detecção pode virar comando somente em CONTROL_ARMED com armação local ativa. */
    fun mayActuate(): Boolean = mode == GestureMode.CONTROL_ARMED && armedLocally && status() is EngineStatus.Ready
}
