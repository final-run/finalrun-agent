import com.google.protobuf.gradle.proto
import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.protobuf")
}

android {
    namespace = "app.finalrun.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.finalrun.android"
        minSdk = 23
        targetSdk = 34
        versionCode = 3
        versionName = "1.3"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }

    // Defining a custom task to build and install both APKs
    tasks.register("buildBothApks") {
        dependsOn(tasks.named("assembleDebug"))
        dependsOn(tasks.named("assembleDebugAndroidTest"))
    }

    tasks.register("uninstallBothApks") {
        dependsOn(tasks.named("uninstallDebug"))
        dependsOn(tasks.named("uninstallDebugAndroidTest"))
    }

    // Defining a custom task to build and install both APKs
    tasks.register("installBothApks") {
        dependsOn(tasks.named("buildBothApks"))

        doLast {
            // Install both APKs using adb
            val projectDir = project.projectDir
            val separator = File.separator
            val debugAndroidTestApkPath = projectDir.toPath()
                .resolve("build${separator}outputs${separator}apk${separator}androidTest${separator}debug${separator}app-debug-androidTest.apk")
            val debugAndroidApkPath =
                projectDir.toPath().resolve("build${separator}outputs${separator}apk${separator}debug${separator}app-debug.apk")

            // Install both APKs using adb
            exec {
                commandLine("adb", "install", "-r", debugAndroidTestApkPath.toString())
            }
            exec {
                commandLine("adb", "install", "-r", debugAndroidApkPath.toString())
            }
        }
    }
}

protobuf {
    protoc {
        artifact = "com.google.protobuf:protoc:3.25.1"
    }
    plugins {
        create("grpc") {
            artifact = "io.grpc:protoc-gen-grpc-java:1.62.2"
        }
    }
    generateProtoTasks {
        all().forEach { task ->
            task.builtins {
                create("java") {
                    option("lite")
                }
            }
            task.plugins {
                create("grpc") {
                    option("lite")
                }
            }
        }
    }
}

android.sourceSets {
    getByName("main") {
        proto {
            // Resolve the shared protocol from the monorepo root after importing the driver repo.
            srcDir(rootDir.resolve("../..").resolve("proto"))
        }
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")

    // Keep existing test dependencies (will be removed after full migration)
    androidTestImplementation("com.squareup.okhttp3:okhttp:4.12.0")
    androidTestImplementation("org.java-websocket:Java-WebSocket:1.5.2")

    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    androidTestImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // gRPC dependencies
    implementation("io.grpc:grpc-okhttp:1.62.2")
    implementation("io.grpc:grpc-protobuf-lite:1.62.2")
    implementation("io.grpc:grpc-stub:1.62.2")

    // Add javax.annotation for @Generated annotation used by gRPC
    compileOnly("javax.annotation:javax.annotation-api:1.3.2")

    implementation("com.fasterxml.jackson.core:jackson-core:2.17.1")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.17.1")
    implementation("com.fasterxml.jackson.core:jackson-annotations:2.17.1")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.17.1")
}
