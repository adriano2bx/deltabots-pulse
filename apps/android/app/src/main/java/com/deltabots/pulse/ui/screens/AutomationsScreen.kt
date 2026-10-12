package com.deltabots.pulse.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
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
import androidx.compose.ui.unit.dp
import com.deltabots.pulse.domain.ScreenState
import com.deltabots.pulse.network.AlertDto
import com.deltabots.pulse.network.ApiException
import com.deltabots.pulse.network.AutomationListEnvelope
import com.deltabots.pulse.network.AutomationTemplate
import com.deltabots.pulse.network.PulseApi
import com.deltabots.pulse.ui.Notice
import com.deltabots.pulse.ui.StateHost
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.koin.compose.koinInject

private data class AutomationsData(val list: AutomationListEnvelope, val templates: List<AutomationTemplate>, val alerts: List<AlertDto>)

private fun describe(e: Throwable): ScreenState.Error = when {
    e is ApiException && e.code == "CONSENT_REQUIRED" -> ScreenState.Error(e.code, "Esta função precisa de um consentimento ativo em Ajustes → Privacidade.", retryable = false)
    e is ApiException && e.code == "FORBIDDEN" -> ScreenState.Error(e.code, "Seu papel ou escopo não permite este recurso.", retryable = false)
    e is ApiException -> ScreenState.Error(e.code, e.message)
    else -> ScreenState.Error("NETWORK", "Sem conexão com o servidor.")
}

@Composable
fun AutomationsScreen(modifier: Modifier) {
    val api: PulseApi = koinInject()
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<ScreenState<AutomationsData>>(ScreenState.Loading) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirmEnable by remember { mutableStateOf<com.deltabots.pulse.network.AutomationDto?>(null) }

    suspend fun load() {
        state = try {
            val list = api.automations()
            val templates = runCatching { api.automationTemplates() }.getOrDefault(emptyList())
            val alerts = runCatching { api.alerts() }.getOrDefault(emptyList())
            ScreenState.Data(AutomationsData(list, templates, alerts), com.deltabots.pulse.domain.Provenance(null, "api", System.currentTimeMillis(), com.deltabots.pulse.domain.Quality.MEASURED))
        } catch (e: Exception) { describe(e) }
    }
    LaunchedEffect(Unit) { load() }

    confirmEnable?.let { a ->
        AlertDialog(
            onDismissRequest = { confirmEnable = null },
            title = { Text("Ativar \"${a.title}\"?") },
            text = { Text("Risco ${a.riskLevel}. A automação passará a executar sozinha. Ações de controle de equipamentos exigem armação local e nunca são remotas.") },
            confirmButton = {
                TextButton({
                    confirmEnable = null
                    scope.launch {
                        message = try { api.setAutomationEnabled(a.id, a.version, true); "Automação ativada." } catch (e: Exception) { describe(e).message }
                        load()
                    }
                }) { Text("Ativar") }
            },
            dismissButton = { TextButton({ confirmEnable = null }) { Text("Cancelar") } },
        )
    }

    LazyColumn(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("Automações e alertas", style = MaterialTheme.typography.headlineSmall) }
        message?.let { item { Text(it, style = MaterialTheme.typography.bodySmall) } }
        item {
            StateHost(state, onRetry = { scope.launch { state = ScreenState.Loading; load() } }) { d, _ ->
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (d.list.meta.killSwitch) Notice("Kill switch ativo", "Nenhuma automação executa enquanto o administrador mantiver o bloqueio.")
                    Text("Alertas", style = MaterialTheme.typography.titleMedium)
                    if (d.alerts.isEmpty()) Text("Nenhum alerta.", style = MaterialTheme.typography.bodySmall)
                    d.alerts.take(20).forEach { al ->
                        Card(Modifier.fillMaxWidth()) {
                            Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column(Modifier.weight(1f)) {
                                    Text("${al.kind} · ${al.severity}", style = MaterialTheme.typography.titleSmall)
                                    Text(al.summary, style = MaterialTheme.typography.bodySmall)
                                    Text(al.createdAt, style = MaterialTheme.typography.labelSmall)
                                }
                                if (al.status == "open") OutlinedButton({ scope.launch { runCatching { api.ackAlert(al.id) }; load() } }) { Text("Reconhecer") }
                            }
                        }
                    }
                    Text("Minhas automações", style = MaterialTheme.typography.titleMedium)
                    if (d.list.data.isEmpty()) Text("Nenhuma automação criada.", style = MaterialTheme.typography.bodySmall)
                    d.list.data.forEach { a ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(Modifier.weight(1f)) {
                                Text(a.title)
                                Text("v${a.version} · risco ${a.riskLevel}", style = MaterialTheme.typography.labelSmall)
                            }
                            Switch(a.enabled, { on ->
                                if (on) confirmEnable = a
                                else scope.launch {
                                    message = try { api.setAutomationEnabled(a.id, a.version, false); "Automação desativada." } catch (e: Exception) { describe(e).message }
                                    load()
                                }
                            }, enabled = !d.list.meta.killSwitch || a.enabled)
                        }
                    }
                    Text("Modelos (criados desativados)", style = MaterialTheme.typography.titleMedium)
                    d.templates.forEach { t ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(t.title, Modifier.weight(1f))
                            Button({
                                scope.launch {
                                    message = try {
                                        val ast = (t.ast as? JsonObject)?.let { JsonObject(it + ("enabled" to JsonPrimitive(false))) } ?: t.ast
                                        api.createAutomation(ast); "Modelo adicionado (desativado)."
                                    } catch (e: Exception) { describe(e).message }
                                    load()
                                }
                            }) { Text("Adicionar") }
                        }
                    }
                }
            }
        }
    }
}
