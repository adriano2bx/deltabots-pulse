package com.deltabots.pulse.ui.screens

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Star
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.deltabots.pulse.data.repo.Prefs
import com.deltabots.pulse.data.repo.SessionRepository
import org.koin.compose.koinInject

private enum class Tab(val label: String, val icon: ImageVector) {
    HOME("Início", Icons.Filled.Home),
    HEALTH("Saúde", Icons.Filled.Favorite),
    BAND("Pulseira", Icons.Filled.Send),
    GESTURES("Gestos", Icons.Filled.Star),
    SETTINGS("Ajustes", Icons.Filled.Settings),
}

@Composable
fun PulseRoot() {
    val session: SessionRepository = koinInject()
    val prefs: Prefs = koinInject()
    val userPrefs by prefs.flow.collectAsState(initial = null)
    var signedIn by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(Unit) { signedIn = session.isSignedIn() }

    val p = userPrefs
    when {
        p == null || signedIn == null -> LoadingScreen()
        !p.termsAccepted || !p.onboardingDone -> OnboardingScreen()
        signedIn == false -> AuthScreen(onDone = { signedIn = true })
        else -> {
            var tab by remember { mutableStateOf(Tab.HOME) }
            Scaffold(bottomBar = {
                NavigationBar {
                    Tab.entries.forEach {
                        NavigationBarItem(selected = tab == it, onClick = { tab = it }, icon = { Icon(it.icon, null) }, label = { Text(it.label) })
                    }
                }
            }) { pad ->
                val m = Modifier.padding(pad)
                when (tab) {
                    Tab.HOME -> HomeScreen(m)
                    Tab.HEALTH -> HealthScreen(m)
                    Tab.BAND -> BandScreen(m)
                    Tab.GESTURES -> GestureScreen(m)
                    Tab.SETTINGS -> SettingsScreen(m, onSignedOut = { signedIn = false })
                }
            }
        }
    }
}
