package com.deltabots.pulse.di

import androidx.room.Room
import com.deltabots.pulse.BuildConfig
import com.deltabots.pulse.ble.Miband3Connection
import com.deltabots.pulse.ble.ReadingSink
import com.deltabots.pulse.data.local.PulseDatabase
import com.deltabots.pulse.data.repo.Prefs
import com.deltabots.pulse.data.repo.SessionRepository
import com.deltabots.pulse.data.repo.TelemetryRepository
import com.deltabots.pulse.data.secure.BleKeyStore
import com.deltabots.pulse.data.secure.KeystoreSigner
import com.deltabots.pulse.data.secure.SecureTokenStore
import com.deltabots.pulse.network.PulseApi
import com.deltabots.pulse.network.RequestSigner
import com.deltabots.pulse.network.TokenStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.koin.android.ext.koin.androidContext
import org.koin.dsl.module

val appModule = module {
    single { Room.databaseBuilder(androidContext(), PulseDatabase::class.java, "pulse.db").build() }
    single { get<PulseDatabase>().readings() }
    single { get<PulseDatabase>().outbox() }
    single { get<PulseDatabase>().devices() }
    single { get<PulseDatabase>().gestures() }
    single { Prefs(androidContext()) }
    single { BleKeyStore(androidContext()) }
    single { KeystoreSigner() }
    single<RequestSigner> { get<KeystoreSigner>() }
    single<TokenStore> { SecureTokenStore(androidContext()) }
    single {
        HttpClient(OkHttp) { install(HttpTimeout) { requestTimeoutMillis = 30_000; connectTimeoutMillis = 10_000 } }
    }
    single { PulseApi(BuildConfig.API_BASE_URL, get(), get(), get()) }
    single { TelemetryRepository(get(), get(), get(), get(), get()) }
    single<ReadingSink> { get<TelemetryRepository>() }
    single { SessionRepository(get(), get(), get(), get()) }
    single {
        val prefs = get<Prefs>()
        Miband3Connection(androidContext(), get(), get(), get()) { runBlocking { prefs.flow.first() } }
    }
}
