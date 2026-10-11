package com.deltabots.pulse.design

import androidx.compose.ui.graphics.Color
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.Typography
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

object PulseColors {
    val Obsidian = Color(0xFF0A0A0B)
    val Surface = Color(0xFF111214)
    val Border = Color(0xFF25282C)
    val Bone = Color(0xFFF5F7FA)
    val Muted = Color(0xFF8A929A)
    val DeltaCyan = Color(0xFF00D5D8)
    val Good = Color(0xFF64D9A8)
    val Warning = Color(0xFFF0BA6A)
    val Danger = Color(0xFFF58A8A)
}
val PulseDarkScheme = darkColorScheme(
    primary=PulseColors.DeltaCyan,
    onPrimary=PulseColors.Obsidian,
    background=PulseColors.Obsidian,
    onBackground=PulseColors.Bone,
    surface=PulseColors.Surface,
    onSurface=PulseColors.Bone,
    outline=PulseColors.Border,
    error=PulseColors.Danger,
)
@Composable fun PulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme=PulseDarkScheme, typography=Typography(), content=content)
}
