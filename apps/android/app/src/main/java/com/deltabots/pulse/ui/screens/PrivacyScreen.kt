package com.deltabots.pulse.ui.screens

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.deltabots.pulse.data.repo.LocalDataWiper
import com.deltabots.pulse.network.ApiException
import com.deltabots.pulse.network.ExportJobDto
import com.deltabots.pulse.network.PulseApi
import com.deltabots.pulse.ui.Notice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject

@Composable
fun PrivacyScreen(modifier: Modifier, onBack: () -> Unit, onWiped: () -> Unit) {
    val api: PulseApi = koinInject()
    val wiper: LocalDataWiper = koinInject()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var exports by remember { mutableStateOf<List<ExportJobDto>>(emptyList()) }
    var message by remember { mutableStateOf<String?>(null) }
    var pendingDownload by remember { mutableStateOf<ExportJobDto?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var confirmWipe by remember { mutableStateOf(false) }

    suspend fun reload() { exports = runCatching { api.exports() }.getOrDefault(emptyList()) }
    LaunchedEffect(Unit) { reload() }

    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val job = pendingDownload
        pendingDownload = null
        if (uri != null && job != null) scope.launch {
            message = try {
                val bytes = api.downloadExport(job.id)
                withContext(Dispatchers.IO) { ctx.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } }
                "Exportação salva (${bytes.size / 1024} KB). Guarde-a em local seguro: contém dados de saúde."
            } catch (e: ApiException) { "Falha no download (${e.code})." } catch (e: Exception) { "Falha ao salvar o arquivo." }
        }
    }

    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Excluir minha conta") },
        text = {
            androidx.compose.foundation.layout.Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("O acesso é bloqueado agora e a remoção dos seus dados na nuvem é processada em seguida. Isto não pode ser desfeito. Digite seu e-mail para confirmar.")
                OutlinedTextField(email, { email = it.trim() }, singleLine = true, label = { Text("E-mail") })
            }
        },
        confirmButton = {
            TextButton({
                confirmDelete = false
                scope.launch {
                    try { api.requestAccountDeletion(email); wiper.wipeAll(); onWiped() }
                    catch (e: ApiException) { message = if (e.code == "VALIDATION_ERROR") "O e-mail não confere." else "Falha (${e.code})." }
                    catch (e: Exception) { message = "Sem conexão. Nada foi excluído." }
                }
            }, enabled = email.contains('@')) { Text("Excluir definitivamente") }
        },
        dismissButton = { TextButton({ confirmDelete = false }) { Text("Cancelar") } },
    )
    if (confirmWipe) AlertDialog(
        onDismissRequest = { confirmWipe = false },
        title = { Text("Apagar dados deste aparelho?") },
        text = { Text("Remove leituras, vínculo com a pulseira, chaves, gestos e sua sessão neste celular. Dados já enviados à nuvem continuam lá.") },
        confirmButton = { TextButton({ confirmWipe = false; scope.launch { wiper.wipeAll(); onWiped() } }) { Text("Apagar") } },
        dismissButton = { TextButton({ confirmWipe = false }) { Text("Cancelar") } },
    )

    LazyColumn(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { OutlinedButton(onBack) { Text("← Ajustes") } }
        item { Text("Meus dados (LGPD)", style = MaterialTheme.typography.headlineSmall) }
        message?.let { item { Notice("Aviso", it) } }
        item { Text("Exportar", style = MaterialTheme.typography.titleMedium) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("telemetry_csv" to "CSV", "telemetry_json" to "JSON", "full_json" to "Completo").forEach { (kind, label) ->
                    OutlinedButton({
                        scope.launch {
                            message = try { api.requestExport(kind); "Exportação solicitada; atualize a lista em instantes." } catch (e: ApiException) { "Falha (${e.code})." } catch (e: Exception) { "Sem conexão." }
                            reload()
                        }
                    }) { Text(label) }
                }
            }
        }
        item { OutlinedButton({ scope.launch { reload() } }) { Text("Atualizar lista") } }
        if (exports.isEmpty()) item { Text("Nenhuma exportação.", style = MaterialTheme.typography.bodySmall) }
        items(exports) { e ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${e.kind} · ${e.state}", Modifier.weight(1f))
                if (e.state == "ready" && e.downloadUrl != null) Button({
                    pendingDownload = e
                    saver.launch("pulse-${e.kind}-${e.id.takeLast(6)}.${if (e.kind.endsWith("csv")) "csv" else "json"}")
                }) { Text("Baixar") }
            }
        }
        item { Text("Apagar", style = MaterialTheme.typography.titleMedium) }
        item { OutlinedButton({ confirmWipe = true }) { Text("Apagar dados deste aparelho") } }
        item { Button({ confirmDelete = true }) { Text("Excluir minha conta na nuvem") } }
    }
}
