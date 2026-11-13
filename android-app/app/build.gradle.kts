import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Release-ondertekening: keystore.properties staat naast dit project en NIET in git.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "be.krachtbal.aantekenaar"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        // Bewust anders dan be.krachtbal.live (gereserveerd voor de TWA uit docs/ANDROID-PLAYSTORE.md).
        applicationId = "be.krachtbal.aantekenaar"
        minSdk = 26
        targetSdk = 35
        versionCode = 9
        versionName = "1.0.8"
    }

    // Eén codebasis, twee apps:
    //  • aantekenaar = de tafel-app zoals ze is (zelfde applicationId, dus gewoon bij te werken);
    //  • federatie   = het officiële pakket: de volledige wedstrijddag (selectie, controle en vrijgave,
    //                  aantekenen, aftekenen, indienen) met de demoruimte als eerste omgeving.
    flavorDimensions += "product"
    productFlavors {
        create("aantekenaar") {
            dimension = "product"
            buildConfigField("boolean", "FEDERATIE", "false")
            buildConfigField("String", "DEFAULT_SERVER", "\"https://livescore.roodgries.be\"")
            resValue("string", "app_name", "Krachtbal Aantekenaar")
        }
        create("federatie") {
            dimension = "product"
            applicationId = "be.krachtbal.federatie"
            versionCode = 4
            versionName = "0.2.2"
            buildConfigField("boolean", "FEDERATIE", "true")
            // De demoruimte (eigen Railway-project "Krachtbal-demo"); later het officiële adres van het pakket.
            buildConfigField("String", "DEFAULT_SERVER", "\"https://krachtbal-demo-production.up.railway.app\"")
            resValue("string", "app_name", "Krachtbal Federatie")
        }
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Verkleinen + ongebruikte resources weglaten: de APK was 9 MB, grotendeels ongebruikte Compose-/Kotlin-code.
            // De regels in proguard-rules.pro houden de serializers van de serverantwoorden overeind.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystoreProps.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
        resValues = true // de appnaam verschilt per product (zie productFlavors)
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
