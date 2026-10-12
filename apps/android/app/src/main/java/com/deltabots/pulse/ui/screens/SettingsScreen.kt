package com.deltabots.pulse.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.deltabots.pulse.ble.Miband3Connection
import com.deltabots.pulse.data.repo.Prefs
import com.deltabots.pulse.data.repo.SessionRepository
import com.deltabots.pulse.data.repo.TelemetryRepository
import com.deltabots.pulse.data.local.OutboxDao
import com.deltabots.pulse.sync.SyncScheduler
import com.deltabots.pulse.ui.Notice
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, Modifier.weight(1f))
        Switch(checked, onChange)
    }
}

@Composable
fun SettingsScreen(modifier: Modifier, onSignedOut: () -> Unit, onOpenPrivacy: () -> Unit = {}) {
    val prefs: Prefs = koinInject()
    val session: SessionRepository = koinInject()
    val telemetry: TelemetryRepository = koinInject()
    val outbox: OutboxDao = koinInject()
    val band: Miband3Connection = koinInject()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val p by prefs.flow.collectAsState(initial = com.deltabots.pulse.data.repo.UserPrefs())
    val pending by outbox.pendingCount().collectAsState(initial = 0)
    val rejected by outbox.rejectedCount().collectAsState(initial = 0)
    var message by remember { mutableStateOf<String?>(null) }

    Column(modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Ajustes", style = MaterialTheme.typography.headlineSmall)

        Text("Sincronização", style = MaterialTheme.typography.titleMedium)
        Text("Pendentes: $pending · Rejeitadas: $rejected")
        ToggleRow("Sincronizar só no Wi-Fi", p.syncOnlyOnWifi) { v ->
            scope.launch { prefs.update { it.copy(syncOnlyOnWifi = v) }; SyncScheduler.schedule(ctx, v) }
        }
        Button({
            scope.launch {
                message = when (val r = telemetry.flush()) {
                    TelemetryRepository.FlushResult.NothingToSend -> "Nada a enviar."
                    TelemetryRepository.FlushResult.NotSignedIn -> "Entre na conta para sincronizar."
                    is TelemetryRepository.FlushResult.Sent -> "Enviadas ${r.accepted} leituras."
                    is TelemetryRepository.FlushResult.Failed -> "Falha (${r.error}); será retentado."
                }
            }
        }) { Text("Sincronizar agora") }

        Text("Privacidade (LGPD)", style = MaterialTheme.typography.titleMedium)
        Text("O envio de dados de saúde exige consentimento específico, revogável a qualquer momento.", style = MaterialTheme.typography.bodySmall)
        Button({
            scope.launch {
                message = try { val n = session.grantHealthConsents(); if (n == 0) "Consentimentos já ativos." else "Consentimento registrado." } catch (e: Exception) { "Falha: ${e.message}" }
            }
        }) { Text("Autorizar envio de dados de saúde") }
        OutlinedButton(onOpenPrivacy) { Text("Exportar ou excluir meus dados") }

        Text("Pulseira", style = MaterialTheme.typography.titleMedium)
        ToggleRow("Mão esquerda", p.leftWrist) { v -> scope.launch { prefs.update { it.copy(leftWrist = v) } } }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton({ band.syncTime() }) { Text("Sincronizar hora") }
            OutlinedButton({ band.applyProfile(p) }) { Text("Enviar perfil") }
        }
        if (com.deltabots.pulse.BuildConfig.NOTIFICATION_FORWARDING) {
            ToggleRow("Encaminhar notificações", p.mirrorNotifications) { v ->
                scope.launch { prefs.update { it.copy(mirrorNotifications = v) } }
                if (v) ctx.startActivity(android.content.Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        } else {
            Notice("Notificações do celular", "Disponível na edição \"completo\" (o Play Protect pode bloquear a instalação fora da loja).")
        }

        message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        OutlinedButton({ scope.launch { runCatching { session.logout() }; onSignedOut() } }) { Text("Sair da conta") }
    }
}
