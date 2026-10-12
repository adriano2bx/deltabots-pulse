package com.deltabots.pulse.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.deltabots.pulse.gestures.GestureLab
import com.deltabots.pulse.ui.Notice
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun GestureScreen(modifier: Modifier, onBack: () -> Unit = {}) {
    val lab: GestureLab = koinInject()
    val ui by lab.ui.collectAsState()
    val scope = rememberCoroutineScope()
    var label by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { lab.reload() }

    LazyColumn(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { OutlinedButton(onBack) { Text("← Pulseira") } }
        item { Text("Laboratório de gestos", style = MaterialTheme.typography.headlineSmall) }
        item {
            Notice(
                "Fonte: sensor do celular",
                "O acelerômetro bruto da Mi Band 3 não foi comprovado neste firmware, por isso o laboratório usa o sensor do celular. O reconhecimento só observa: nenhum gesto envia comando.",
            )
        }
        if (!ui.sensorAvailable) item { Notice("Sem sensor", "Este aparelho não tem acelerômetro.") }
        item {
            OutlinedTextField(label, { label = it.take(30) }, Modifier.fillMaxWidth(), label = { Text("Nome do gesto") }, singleLine = true)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button({ lab.record(label) }, enabled = ui.sensorAvailable && !ui.recording && !ui.recognizing && label.isNotBlank()) { Text(if (ui.recording) "Gravando…" else "Gravar exemplo") }
                if (ui.recognizing) OutlinedButton({ lab.stopRecognition() }) { Text("Parar") }
                else OutlinedButton({ scope.launch { lab.startRecognition() } }, enabled = ui.sensorAvailable && !ui.recording) { Text("Reconhecer") }
            }
        }
        ui.message?.let { item { Text(it, style = MaterialTheme.typography.bodySmall) } }
        ui.last?.let { d -> item { Notice("Último gesto", "${d.label} · confiança ${"%.0f".format(d.confidence * 100)}% · modelo ${d.modelVersion}") } }
        item { Text("Exemplos gravados (${ui.templates.size})", style = MaterialTheme.typography.titleSmall) }
        if (ui.templates.isEmpty()) item { Text("Nenhum exemplo ainda. Grave pelo menos 2 gestos com 2 repetições cada.", style = MaterialTheme.typography.bodySmall) }
        items(ui.templates) { t ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(t.label)
                OutlinedButton({ scope.launch { lab.delete(t.id) } }) { Text("Excluir") }
            }
        }
    }
}
