package com.deltabots.pulse.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.deltabots.pulse.data.repo.Prefs
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun LoadingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun OnboardingScreen() {
    val prefs: Prefs = koinInject()
    val scope = rememberCoroutineScope()
    var accepted by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("DeltaBots Pulse", style = MaterialTheme.typography.headlineMedium)
        Text("Conecta a sua Mi Band 3 ao aplicativo, mostra seus dados de saúde e (opcionalmente) os sincroniza com a sua conta.")
        Text("Seus dados de saúde são sensíveis (LGPD). Eles ficam neste aparelho e só são enviados com o seu consentimento específico, que você pode revogar a qualquer momento em Ajustes → Privacidade.", style = MaterialTheme.typography.bodyMedium)
        Text("Este app não é um dispositivo médico: as leituras da pulseira não servem para diagnóstico.", style = MaterialTheme.typography.bodyMedium)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(accepted, { accepted = it })
            Text("Li e aceito os termos e a política de privacidade.")
        }
        Button(enabled = accepted, onClick = { scope.launch { prefs.update { it.copy(termsAccepted = true, onboardingDone = true) } } }) { Text("Continuar") }
    }
}
