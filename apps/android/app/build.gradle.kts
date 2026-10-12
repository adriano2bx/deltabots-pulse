plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.deltabots.pulse"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.deltabots.pulse"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.1.0"
        // Endpoint da API: definido por ambiente de build; nenhum domínio é assumido como existente.
        buildConfigField("String", "API_BASE_URL", "\"${providers.gradleProperty("pulse.apiBaseUrl").orElse("https://api.example.invalid").get()}\"")
    }

    flavorDimensions += "edicao"
    productFlavors {
        // "padrao": sem NotificationListenerService (evita o bloqueio do Play Protect em sideload).
        create("padrao") {
            dimension = "edicao"
            buildConfigField("boolean", "NOTIFICATION_FORWARDING", "false")
        }
        create("completo") {
            dimension = "edicao"
            applicationIdSuffix = ".completo"
            versionNameSuffix = "-completo"
            buildConfigField("boolean", "NOTIFICATION_FORWARDING", "true")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Assinatura: fornecida pelo CI/secret manager; nenhuma chave é versionada.
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    testOptions { unitTests.isReturnDefaultValues = true }
    packaging { resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/INDEX.LIST", "META-INF/io.netty.versions.properties") }
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

/** Release bloqueado até o MASTER corporativo aprovado existir (design/brand/approved/PLACE_OFFICIAL_ASSETS_HERE.md). */
val checkBrandAssets by tasks.registering {
    val approved = rootProject.layout.projectDirectory.dir("../../design/brand/approved")
    doLast {
        val masters = approved.asFile.listFiles { f -> f.name.startsWith("deltabots_symbol_8C1_master") && f.extension == "svg" }.orEmpty()
        if (masters.isEmpty()) {
            throw GradleException("BLOQUEADO: logo MASTER DeltaBots v4.1 ausente em design/brand/approved. Não gere substitutos; insira os arquivos oficiais.")
        }
    }
}
tasks.matching { it.name.startsWith("assemble") && it.name.contains("Release") || it.name.startsWith("bundle") && it.name.contains("Release") }.configureEach { dependsOn(checkBrandAssets) }

dependencies {
    implementation(project(":core:domain"))
    implementation(project(":core:network"))
    implementation(project(":device:miband3"))

    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
    implementation("io.insert-koin:koin-android:4.0.0")
    implementation("io.insert-koin:koin-androidx-compose:4.0.0")
    implementation("io.ktor:ktor-client-okhttp:3.0.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
