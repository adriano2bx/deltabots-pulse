package com.deltabots.pulse.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Dark = darkColorScheme(
    primary = Color(0xFF4DD0E1), onPrimary = Color(0xFF00363D), background = Color(0xFF0A0A0B), surface = Color(0xFF151517),
    onBackground = Color(0xFFEDEDEF), onSurface = Color(0xFFEDEDEF), error = Color(0xFFFF6B6B),
)
private val Light = lightColorScheme(primary = Color(0xFF006874), background = Color(0xFFFAFAFA), surface = Color.White, error = Color(0xFFB3261E))

@Composable
fun PulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
