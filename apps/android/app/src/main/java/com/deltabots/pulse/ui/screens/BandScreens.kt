package com.deltabots.pulse.ui.screens

import android.Manifest
import android.content.Context
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.deltabots.pulse.ble.Miband3Connection
import com.deltabots.pulse.data.local.DeviceDao
import com.deltabots.pulse.data.repo.SessionRepository
import com.deltabots.pulse.domain.BleState
import com.deltabots.pulse.domain.CapabilityId
import com.deltabots.pulse.domain.Freshness
import com.deltabots.pulse.domain.Provenance
import com.deltabots.pulse.domain.Quality
import com.deltabots.pulse.domain.ScreenState
import com.deltabots.pulse.gateway.GatewayService
import com.deltabots.pulse.network.CapabilityReport
import com.deltabots.pulse.ui.ConfirmRow
import com.deltabots.pulse.ui.MetricTile
import com.deltabots.pulse.ui.Notice
import com.deltabots.pulse.ui.StateHost
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

private fun blePermissions(): Array<String> =
    if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

private fun hasBle(ctx: Context) = blePermissions().all { ContextCompat.checkSelfPermission(ctx, it) == android.content.pm.PackageManager.PERMISSION_GRANTED }

@Composable
fun HomeScreen(modifier: Modifier) {
    val band: Miband3Connection = koinInject()
    val devices: DeviceDao = koinInject()
    val session: SessionRepository = koinInject()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val ui by band.ui.collectAsState()
    val scan by band.scanResults.collectAsState()
    val scanning by band.scanning.collectAsState()
    var permDenied by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        val ok = r.values.all { it }
        permDenied = !ok
        band.permissionGranted(ok)
        if (ok) band.startScan()
    }

    LazyColumn(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Pulseira", style = MaterialTheme.typography.headlineSmall) }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(ui.name ?: "Nenhuma pulseira", style = MaterialTheme.typography.titleMedium)
                    Text("Estado: ${ui.state}")
                    ui.ble.giveUpReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    ui.lastError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    if (ui.awaitingTap) Notice("Confirme na pulseira", "Toque na tela da Mi Band 3 para autorizar o pareamento.")
                    ui.firmware?.let { Text("Firmware $it", style = MaterialTheme.typography.bodySmall) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (ui.state == BleState.READY || ui.isReady) {
                            OutlinedButton({ band.disconnect(); GatewayService.stop(ctx) }) { Text("Desconectar") }
                            OutlinedButton({ band.refresh() }) { Text("Atualizar") }
                        } else {
                            Button(onClick = {
                                if (hasBle(ctx)) { band.permissionGranted(true); band.startScan() } else launcher.launch(blePermissions())
                            }, enabled = !scanning) { Text(if (scanning) "Procurando…" else "Procurar pulseira") }
                            OutlinedButton({ scope.launch { band.connectSaved() } }) { Text("Reconectar") }
                        }
                    }
                    if (permDenied) Notice("Permissão necessária", "Sem a permissão de Bluetooth não é possível procurar nem conectar à pulseira.")
                }
            }
        }
        if (!ui.isReady) {
            items(scan) { s ->
                ConfirmRow("${s.name ?: "Dispositivo BLE"} · ${s.rssi} dBm" + if (s.looksLikeMiBand) " ★" else "", "Parear") {
                    band.stopScan()
                    band.connect(s.address, s.name)
                    GatewayService.start(ctx)
                }
            }
            item { Text("Se a pulseira estiver ligada ao Mi Fit/Zepp Life, desvincule-a antes: ela aceita um app por vez.", style = MaterialTheme.typography.bodySmall) }
        } else {
            item { SyncCard(ui.deviceId, ui.capabilities.map { CapabilityReport(it.id.wire, it.state.name, it.firmware, it.driverVersion, it.testArtifact, it.limitations) }, ui.name) }
            item { VitalsRow() }
            item { CapabilityList() }
        }
    }
}

@Composable
private fun SyncCard(deviceId: String?, caps: List<CapabilityReport>, name: String?) {
    val session: SessionRepository = koinInject()
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<String?>(null) }
    if (deviceId == null) return
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Conta DeltaBots", style = MaterialTheme.typography.titleSmall)
            Text("Envia leituras para a nuvem somente com consentimento. Os dados continuam salvos neste aparelho.", style = MaterialTheme.typography.bodySmall)
            Button({
                scope.launch {
                    status = try { session.registerDevice(deviceId, caps); "Pulseira registrada na conta." } catch (e: Exception) { "Falha ao registrar: ${e.message}" }
                }
            }) { Text("Vincular à conta") }
            status?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun VitalsRow() {
    val band: Miband3Connection = koinInject()
    val ui by band.ui.collectAsState()
    val now = System.currentTimeMillis()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        MetricTile("Bateria", ui.battery?.let { "$it%" } ?: "—", if (ui.charging) "carregando" else null, Modifier.weight(1f))
        MetricTile("Passos", ui.steps?.toString() ?: "—", ui.stepsAtMs?.let { Freshness.humanAge(now - it) }, Modifier.weight(1f))
    }
}

@Composable
private fun CapabilityList() {
    val band: Miband3Connection = koinInject()
    val ui by band.ui.collectAsState()
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Capacidades (com evidência)", style = MaterialTheme.typography.titleSmall)
            ui.capabilities.forEach { Text("${it.id.wire}: ${it.state}" + (it.limitations?.let { l -> " — $l" } ?: ""), style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
fun HealthScreen(modifier: Modifier) {
    val band: Miband3Connection = koinInject()
    val ui by band.ui.collectAsState()
    val now = System.currentTimeMillis()
    val hrState: ScreenState<Int> = when {
        ui.heartRate == null -> ScreenState.Empty
        else -> Freshness.stateFor("heart_rate_bpm", ui.heartRate, Provenance(ui.deviceId, "miband3", ui.heartRateAtMs ?: now, Quality.MEASURED), now)
    }
    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Saúde", style = MaterialTheme.typography.headlineSmall)
        StateHost(hrState) { hr, caption -> MetricTile("Frequência cardíaca", "$hr bpm", caption) }
        if (!ui.isReady) Notice("Pulseira desconectada", "Conecte a pulseira para medir.")
        val canHr = ui.capabilities.firstOrNull { it.id == CapabilityId.HR_ON_DEMAND }?.state?.name
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { band.measureHeartRate() }, enabled = ui.isReady && !ui.measuringHeartRate) { Text(if (ui.measuringHeartRate) "Medindo…" else "Medir agora") }
            OutlinedButton(onClick = { band.setContinuousHeartRate(!ui.continuousHeartRate) }, enabled = ui.isReady) { Text(if (ui.continuousHeartRate) "Parar contínuo" else "Contínuo") }
        }
        canHr?.let { Text("Capacidade de FC: $it", style = MaterialTheme.typography.bodySmall) }
        Text("Valores informativos; não use para diagnóstico.", style = MaterialTheme.typography.bodySmall)
        MetricTile("Passos", ui.steps?.toString() ?: "—", ui.stepsAtMs?.let { Freshness.humanAge(now - it) })
    }
}

@Composable
fun BandScreen(modifier: Modifier, onOpenGestures: () -> Unit = {}) {
    val band: Miband3Connection = koinInject()
    val ui by band.ui.collectAsState()
    val log by band.log.collectAsState()
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Conversar", style = MaterialTheme.typography.headlineSmall)
            OutlinedButton(onOpenGestures) { Text("Gestos") }
        }
        OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("Título") }, singleLine = true)
        OutlinedTextField(body, { body = it }, Modifier.fillMaxWidth(), label = { Text("Mensagem") })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button({ band.sendSms(title.ifBlank { "Mensagem" }, body) }, enabled = ui.isReady && body.isNotBlank()) { Text("Enviar SMS") }
            OutlinedButton({ band.sendText(title.ifBlank { "Aviso" }, body) }, enabled = ui.isReady) { Text("Notificação") }
            OutlinedButton({ band.vibrate() }, enabled = ui.isReady) { Text("Vibrar") }
        }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            items(log.takeLast(100).reversed()) { Text((if (it.fromBand) "← " else "→ ") + it.text, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
