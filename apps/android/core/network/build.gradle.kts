plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization")
}

kotlin { jvmToolchain(17) }

val ktor = "3.0.3"

dependencies {
    api(project(":core:domain"))
    api("io.ktor:ktor-client-core:$ktor")
    api("io.ktor:ktor-client-content-negotiation:$ktor")
    api("io.ktor:ktor-serialization-kotlinx-json:$ktor")
    api("io.ktor:ktor-client-websockets:$ktor")
    testImplementation("io.ktor:ktor-client-mock:$ktor")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
