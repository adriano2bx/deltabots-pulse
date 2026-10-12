package com.deltabots.pulse.data.repo

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.store by preferencesDataStore("pulse_prefs")

enum class SyncMode(val label: String) { NORMAL("Normal"), ECONOMY("Economia de bateria"), LAB("Laboratório") }

data class UserPrefs(
    val onboardingDone: Boolean = false,
    val termsAccepted: Boolean = false,
    val locale: String = "pt-BR",
    val stepGoal: Int = 8000,
    val sleepGoalMin: Int = 450,
    val hrHigh: Int = 120,
    val hrLow: Int = 40,
    val syncMode: SyncMode = SyncMode.NORMAL,
    val syncOnlyOnWifi: Boolean = false,
    val biometricLock: Boolean = false,
    val mirrorNotifications: Boolean = false,
    val mirrorApps: Set<String> = emptySet(),
    val quietStart: String = "22:00",
    val quietEnd: String = "07:00",
    val heightCm: Int = 170,
    val weightKg: Int = 70,
    val birthYear: Int = 1990,
    val gender: Int = 2,
    val leftWrist: Boolean = true,
    val largeText: Boolean = false,
)

class Prefs(private val context: Context) {
    private object K {
        val onboarding = booleanPreferencesKey("onboarding")
        val terms = booleanPreferencesKey("terms")
        val locale = stringPreferencesKey("locale")
        val stepGoal = intPreferencesKey("step_goal")
        val sleepGoal = intPreferencesKey("sleep_goal")
        val hrHigh = intPreferencesKey("hr_high")
        val hrLow = intPreferencesKey("hr_low")
        val sync = stringPreferencesKey("sync_mode")
        val wifi = booleanPreferencesKey("wifi_only")
        val bio = booleanPreferencesKey("biometric")
        val mirror = booleanPreferencesKey("mirror")
        val mirrorApps = stringSetPreferencesKey("mirror_apps")
        val quietStart = stringPreferencesKey("quiet_start")
        val quietEnd = stringPreferencesKey("quiet_end")
        val height = intPreferencesKey("height")
        val weight = intPreferencesKey("weight")
        val birth = intPreferencesKey("birth")
        val gender = intPreferencesKey("gender")
        val wrist = booleanPreferencesKey("left_wrist")
        val largeText = booleanPreferencesKey("large_text")
    }

    val flow: Flow<UserPrefs> = context.store.data.map { p ->
        UserPrefs(
            onboardingDone = p[K.onboarding] ?: false,
            termsAccepted = p[K.terms] ?: false,
            locale = p[K.locale] ?: "pt-BR",
            stepGoal = p[K.stepGoal] ?: 8000,
            sleepGoalMin = p[K.sleepGoal] ?: 450,
            hrHigh = p[K.hrHigh] ?: 120,
            hrLow = p[K.hrLow] ?: 40,
            syncMode = runCatching { SyncMode.valueOf(p[K.sync] ?: "NORMAL") }.getOrDefault(SyncMode.NORMAL),
            syncOnlyOnWifi = p[K.wifi] ?: false,
            biometricLock = p[K.bio] ?: false,
            mirrorNotifications = p[K.mirror] ?: false,
            mirrorApps = p[K.mirrorApps] ?: emptySet(),
            quietStart = p[K.quietStart] ?: "22:00",
            quietEnd = p[K.quietEnd] ?: "07:00",
            heightCm = p[K.height] ?: 170,
            weightKg = p[K.weight] ?: 70,
            birthYear = p[K.birth] ?: 1990,
            gender = p[K.gender] ?: 2,
            leftWrist = p[K.wrist] ?: true,
            largeText = p[K.largeText] ?: false,
        )
    }

    suspend fun update(block: (UserPrefs) -> UserPrefs) {
        context.store.edit { p ->
            val cur = UserPrefs(
                p[K.onboarding] ?: false, p[K.terms] ?: false, p[K.locale] ?: "pt-BR", p[K.stepGoal] ?: 8000, p[K.sleepGoal] ?: 450,
                p[K.hrHigh] ?: 120, p[K.hrLow] ?: 40, runCatching { SyncMode.valueOf(p[K.sync] ?: "NORMAL") }.getOrDefault(SyncMode.NORMAL),
                p[K.wifi] ?: false, p[K.bio] ?: false, p[K.mirror] ?: false, p[K.mirrorApps] ?: emptySet(), p[K.quietStart] ?: "22:00",
                p[K.quietEnd] ?: "07:00", p[K.height] ?: 170, p[K.weight] ?: 70, p[K.birth] ?: 1990, p[K.gender] ?: 2, p[K.wrist] ?: true, p[K.largeText] ?: false,
            )
            val n = block(cur)
            p[K.onboarding] = n.onboardingDone; p[K.terms] = n.termsAccepted; p[K.locale] = n.locale; p[K.stepGoal] = n.stepGoal
            p[K.sleepGoal] = n.sleepGoalMin; p[K.hrHigh] = n.hrHigh; p[K.hrLow] = n.hrLow; p[K.sync] = n.syncMode.name; p[K.wifi] = n.syncOnlyOnWifi
            p[K.bio] = n.biometricLock; p[K.mirror] = n.mirrorNotifications; p[K.mirrorApps] = n.mirrorApps; p[K.quietStart] = n.quietStart
            p[K.quietEnd] = n.quietEnd; p[K.height] = n.heightCm; p[K.weight] = n.weightKg; p[K.birth] = n.birthYear; p[K.gender] = n.gender
            p[K.wrist] = n.leftWrist; p[K.largeText] = n.largeText
        }
    }

    suspend fun clear() = context.store.edit { it.clear() }
}
