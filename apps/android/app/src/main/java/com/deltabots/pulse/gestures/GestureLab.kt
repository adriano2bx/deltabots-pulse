package com.deltabots.pulse.gestures

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.deltabots.pulse.data.local.GestureDao
import com.deltabots.pulse.data.local.GestureTemplateEntity
import com.deltabots.pulse.domain.gestures.Debouncer
import com.deltabots.pulse.domain.gestures.Detection
import com.deltabots.pulse.domain.gestures.DtwClassifier
import com.deltabots.pulse.domain.gestures.Filters
import com.deltabots.pulse.domain.gestures.GestureEngine
import com.deltabots.pulse.domain.gestures.GestureMode
import com.deltabots.pulse.domain.gestures.Sample
import com.deltabots.pulse.domain.gestures.SensorSource
import com.deltabots.pulse.domain.gestures.Template
import com.deltabots.pulse.domain.Ulid
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

data class LabUi(
    val sensorAvailable: Boolean = true,
    val recording: Boolean = false,
    val recognizing: Boolean = false,
    val templates: List<GestureTemplateEntity> = emptyList(),
    val last: Detection? = null,
    val message: String? = null,
)

/**
 * Laboratório de gestos com o IMU do CELULAR (fonte ANDROID_IMU). O stream bruto da Mi Band 3 não foi
 * comprovado (capability raw_accel_stream UNVERIFIED), então esta tela nunca o oferece. Reconhecimento
 * aqui é só local/observação: nenhum gesto vira comando sem armação local (docs/07, docs/11).
 */
class GestureLab(private val context: Context, private val dao: GestureDao) : SensorEventListener {
    private val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accel: Sensor? = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val json = Json
    private val ser = ListSerializer(ListSerializer(Float.serializer()))

    private val _ui = MutableStateFlow(LabUi(sensorAvailable = accel != null))
    val ui: StateFlow<LabUi> = _ui.asStateFlow()

    private var recording: MutableList<Sample>? = null
    private var recordLabel = ""
    private var engine: GestureEngine? = null

    companion object { const val RATE_HZ = 50f; const val RECORD_MS = 1500L }

    suspend fun reload() {
        _ui.update { it.copy(templates = dao.templatesOnce()) }
    }

    private fun start() { accel?.let { sm.registerListener(this, it, (1_000_000 / RATE_HZ).toInt()) } }
    private fun stopIfIdle() { if (recording == null && engine == null) sm.unregisterListener(this) }

    fun record(label: String) {
        if (accel == null || label.isBlank()) return
        recordLabel = label.trim()
        recording = mutableListOf()
        _ui.update { it.copy(recording = true, message = "Gravando $RECORD_MS ms — faça o gesto agora.") }
        start()
    }

    suspend fun delete(id: String) { dao.delete(id); reload() }

    suspend fun startRecognition() {
        val templates = dao.templatesOnce().map { t ->
            Template(t.label, json.decodeFromString(ser, t.seriesJson).map { it.toFloatArray() })
        }
        if (templates.map { it.label }.toSet().size < 2 || templates.size < 4) {
            _ui.update { it.copy(message = "Grave ao menos 2 gestos com 2 repetições cada antes de reconhecer.") }
            return
        }
        val e = GestureEngine(SensorSource.ANDROID_IMU, false, DtwClassifier(templates), "local-dtw-1", RATE_HZ, Debouncer())
        if (!e.setMode(GestureMode.RECOGNIZE_LOCAL)) return
        engine = e
        _ui.update { it.copy(recognizing = true, message = "Reconhecendo (somente observação, sem comandos).") }
        start()
    }

    fun stopRecognition() {
        engine = null
        _ui.update { it.copy(recognizing = false) }
        stopIfIdle()
    }

    override fun onSensorChanged(event: SensorEvent) {
        val s = Sample(event.timestamp, event.values[0], event.values[1], event.values[2])
        recording?.let { buf ->
            buf += s
            if (buf.size > 1 && (buf.last().tNs - buf.first().tNs) / 1_000_000 >= RECORD_MS) {
                recording = null
                saveTemplate(recordLabel, buf)
                stopIfIdle()
            }
        }
        engine?.onSample(s, System.currentTimeMillis())?.let { d -> _ui.update { it.copy(last = d) } }
    }

    private fun saveTemplate(label: String, samples: List<Sample>) {
        val series = Filters.linear(samples).map { listOf(it.first, it.second, it.third) }
        val entity = GestureTemplateEntity(Ulid.generate(), label, SensorSource.ANDROID_IMU.name, json.encodeToString(ser, series), System.currentTimeMillis())
        kotlinx.coroutines.runBlocking { dao.upsert(entity); reload() }
        _ui.update { it.copy(recording = false, message = "Gesto \"$label\" gravado (${samples.size} amostras).") }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
