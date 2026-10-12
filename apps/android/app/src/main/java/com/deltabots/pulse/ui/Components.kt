package com.deltabots.pulse.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.deltabots.pulse.domain.Freshness
import com.deltabots.pulse.domain.ScreenState

/** Renderiza todos os estados do contrato de tela (docs/15): nenhum erro/offline é mascarado. */
@Composable
fun <T> StateHost(state: ScreenState<T>, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null, content: @Composable (T, String?) -> Unit) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (state) {
            ScreenState.Loading -> CircularProgressIndicator(Modifier.size(28.dp))
            ScreenState.Empty -> Notice("Sem dados ainda", "Nenhuma leitura recebida da pulseira.")
            is ScreenState.Data -> content(state.value, null)
            is ScreenState.Stale -> content(state.value, "Dado desatualizado (${Freshness.humanAge(state.ageMs)})")
            is ScreenState.Offline -> {
                Notice("Sem conexão", "Mostrando o último valor conhecido.")
                state.lastKnown?.let { content(it, state.lastKnownAt?.let { at -> "Última leitura ${Freshness.humanAge(System.currentTimeMillis() - at)}" }) }
            }
            is ScreenState.Error -> {
                Notice("Erro (${state.code})", state.message)
                if (state.retryable && onRetry != null) TextButton(onRetry) { Text("Tentar novamente") }
            }
            is ScreenState.PermissionRequired -> Notice("Permissão necessária", state.rationale)
            is ScreenState.Unsupported -> Notice("Não suportado", "${state.capability}: ${state.reason}")
        }
    }
}

@Composable
fun Notice(title: String, body: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(body, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun MetricTile(label: String, value: String, caption: String?, modifier: Modifier = Modifier) {
    Card(modifier) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium)
            Text(value, style = MaterialTheme.typography.headlineMedium)
            if (caption != null) Text(caption, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        }
    }
}

@Composable
fun ConfirmRow(text: String, action: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(text, Modifier.weight(1f))
        Button(onClick) { Text(action) }
    }
}
