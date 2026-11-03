package be.krachtbal.aantekenaar

import android.Manifest
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.content.ContextCompat
import be.krachtbal.aantekenaar.data.BuildInfo
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.OrientationMode
import be.krachtbal.aantekenaar.data.ScreenOnMode
import be.krachtbal.aantekenaar.fed.FedFlow
import be.krachtbal.aantekenaar.ui.AantekenaarTheme
import be.krachtbal.aantekenaar.ui.LoginScreen
import be.krachtbal.aantekenaar.ui.MatchListScreen
import be.krachtbal.aantekenaar.ui.MatchScreen
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.SettingsScreen
import be.krachtbal.aantekenaar.ui.findActivity

class MainActivity : ComponentActivity() {
    private val askNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* geweigerd is ook goed: de service werkt dan stil */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // De app is altijd donker: lichte systeemiconen, ook als het toestel op "licht" staat.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        // Android 13+: zonder toestemming blijft de voorgrondmelding onzichtbaar (maar de service loopt wel).
        // Wijzigen kan altijd later in Instellingen → Rechten van Android.
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !Graph.settings.askedNotifications
        ) {
            Graph.settings.askedNotifications = true
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            AantekenaarTheme {
                Box(Modifier.fillMaxSize().background(Pal.Bg)) { AppRoot() }
            }
        }
    }
}

@Composable
private fun AppRoot() {
    val signedIn by Graph.authRepo.signedIn.collectAsState()
    var matchId by rememberSaveable { mutableStateOf<Int?>(null) }
    // Federatie-app: een wedstrijd opent eerst de wedstrijddag-hub; van daaruit ga je naar het scherm van een stap
    // (selectie, scheidsrechter, tafel, wie speelde, aftekenen). null = de hub, "table" = het aantekenscherm.
    var route by rememberSaveable { mutableStateOf<String?>(null) }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }

    // ── Instellingen die voor de hele app gelden ──
    val screenOn by Graph.settings.screenOn.collectAsState()
    val orientation by Graph.settings.orientation.collectAsState()

    val activity = LocalContext.current.findActivity()
    LaunchedEffect(orientation) {
        activity?.requestedOrientation = when (orientation) {
            OrientationMode.AUTO -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            OrientationMode.PORTRAIT -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            OrientationMode.LANDSCAPE -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
    }

    val keepOn = when (screenOn) {
        ScreenOnMode.ALWAYS -> true
        ScreenOnMode.MATCH -> signedIn && matchId != null
        ScreenOnMode.NEVER -> false
    }
    val view = LocalView.current
    DisposableEffect(view, keepOn) {
        view.keepScreenOn = keepOn
        onDispose { view.keepScreenOn = false }
    }

    BackHandler(enabled = signedIn && matchId != null) {
        if (BuildInfo.FEDERATIE && route != null) route = null else { matchId = null; route = null }
    }
    BackHandler(enabled = settingsOpen) { settingsOpen = false }

    // De wedstrijd blijft onder de instellingen gewoon bestaan (livestream, klok, wachtrij): terug = meteen verder.
    Box(Modifier.fillMaxSize()) {
        when {
            !signedIn -> LoginScreen()
            matchId == null -> MatchListScreen(onOpen = { matchId = it; route = null }, onSettings = { settingsOpen = true })
            BuildInfo.FEDERATIE && route != "table" -> FedFlow(
                matchId = matchId!!,
                route = route,
                setRoute = { route = it },
                onBackToList = { matchId = null; route = null },
                onSettings = { settingsOpen = true },
            )
            else -> MatchScreen(
                matchId = matchId!!,
                onBack = { if (BuildInfo.FEDERATIE) route = null else matchId = null },
                onSettings = { settingsOpen = true },
            )
        }
        if (settingsOpen && signedIn) SettingsScreen(onClose = { settingsOpen = false })
    }
}
