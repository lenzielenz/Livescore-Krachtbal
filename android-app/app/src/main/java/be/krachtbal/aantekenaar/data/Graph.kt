package be.krachtbal.aantekenaar.data

import android.app.Application
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.content.ContextCompat
import be.krachtbal.aantekenaar.service.MatchService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File

/** Wat de voorgrondmelding toont: de wedstrijd die nu aangetekend wordt. */
data class ForegroundInfo(
    val matchId: Int,
    val title: String,
    val text: String,
    val running: Boolean,
    /** Muurklok-moment waarop de klok op 0 zou hebben gestaan — voor de melding-chronometer. */
    val chronoBaseWall: Long,
)

/** Eenvoudige service-locator: één proces, één set singletons. */
object Graph {
    lateinit var app: Application
        private set
    lateinit var auth: AuthStore
        private set
    lateinit var serverClock: ServerClock
        private set
    lateinit var api: Api
        private set
    lateinit var authRepo: AuthRepo
        private set
    lateinit var store: SessionStore
        private set
    lateinit var network: NetworkMonitor
        private set
    lateinit var settings: AppSettings
        private set

    private var vibrator: Vibrator? = null

    /** Alles draait op de hoofdthread; het netwerk springt zelf naar IO. */
    val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val sessions = HashMap<Int, MatchSession>()

    private val _foreground = MutableStateFlow<ForegroundInfo?>(null)
    val foreground: StateFlow<ForegroundInfo?> = _foreground.asStateFlow()
    private var serviceUp = false

    /** Wedstrijden waar nog tikken op verzending (of een beslissing) wachten — getoond op de lijst. */
    private val _attention = MutableStateFlow<Set<Int>>(emptySet())
    val attention: StateFlow<Set<Int>> = _attention.asStateFlow()

    fun init(application: Application) {
        app = application
        // De wedstrijdklok moet ook doortikken terwijl het toestel slaapt: elapsedRealtime telt dat mee.
        Time.elapsed = { SystemClock.elapsedRealtime() }
        auth = AuthStore(application)
        serverClock = ServerClock()
        api = Api(auth, serverClock)
        authRepo = AuthRepo(auth, api)
        store = SessionStore(File(application.filesDir, "sessions"))
        network = NetworkMonitor(application)
        settings = AppSettings(application)
        vibrator = if (Build.VERSION.SDK_INT >= 31) {
            application.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            application.getSystemService(Vibrator::class.java)
        }
        // De voorgrondmelding gaat aan of uit zodra de gebruiker dat instelt.
        scope.launch { settings.keepAlive.collect { onSessionChanged() } }
        // Tikken die vorige keer niet meer weggeraakt zijn: meteen weer proberen te versturen.
        scope.launch {
            for (id in store.idsWithPending()) session(id).ensureFlusher()
        }
    }

    fun session(matchId: Int): MatchSession {
        sessions[matchId]?.let { return it }
        // Pas ná het registreren melden: de sessie roept tijdens haar eigen opbouw al onSessionChanged
        // aan, en dan stond ze nog niet in `sessions` (waardoor de lijst haar wachtrij niet kende).
        val s = MatchSession(matchId)
        sessions[matchId] = s
        onSessionChanged()
        return s
    }

    fun dropSession(matchId: Int) {
        sessions.remove(matchId)
        store.delete(matchId)
        onSessionChanged()
    }

    /** Korte trilling: "deze tik is geregistreerd" (en dus al op schijf bewaard). Uit te zetten in de instellingen. */
    fun haptic() {
        if (!settings.haptics.value) return
        try {
            vibrator?.vibrate(
                if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
                else VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE),
            )
        } catch (_: Exception) {
            // geen trilmotor of geweigerd: dan geen trilling, geen probleem
        }
    }

    /** Na een geslaagde login: alle wachtrijen mogen weer proberen. */
    fun onLoggedIn() {
        sessions.values.toList().forEach { it.kick() }
    }

    /** Houdt de voorgrondmelding bij (en start/stopt de service) naargelang er iets actiefs is. */
    fun onSessionChanged() {
        val att = sessions.values.filter { it.needsAttention }.map { it.matchId }.toSet()
        if (att != _attention.value) _attention.value = att
        val active = sessions.values.filter { it.isActive }
        val pick = active.firstOrNull { it.ui.value.state?.isLive == true } ?: active.firstOrNull()
        val st = pick?.ui?.value?.state
        if (pick == null || st == null || !settings.keepAlive.value) {
            // De service ziet dit en stopt zichzelf (MatchService): nooit van hieruit stopService() roepen, dat kan
            // vóór zijn startForeground() komen en dan crasht Android 8.1–11 het proces.
            _foreground.value = null
            return
        }
        val u = pick.ui.value
        val wasIdle = _foreground.value == null
        val score = "${st.score.home} – ${st.score.away}"
        val extra = when {
            u.pending > 0 -> " · ${u.pending} wacht${if (u.pending == 1) "" else "en"} op verzenden"
            !u.online -> " · offline"
            else -> ""
        }
        _foreground.value = ForegroundInfo(
            matchId = pick.matchId,
            title = "${st.teams.home.name} – ${st.teams.away.name}",
            text = "$score · helft ${st.match.currentHalf}$extra",
            running = pick.clock.isRunning,
            chronoBaseWall = Time.wall() - (pick.clock.value() * 1000).toLong(),
        )
        // Van "niets" naar "iets actiefs": (opnieuw) starten, ook als we dachten dat hij nog liep — de service kan net
        // aan het stoppen zijn omdat de vorige stand leeg was.
        if (wasIdle || !serviceUp) startService()
    }

    /** Android 15 vroeg de dataSync-service te stoppen (6 u per etmaal op): niet opnieuw starten tot het etmaal om is. */
    private var serviceBlockedUntil = 0L

    private fun startService() {
        if (Time.wall() < serviceBlockedUntil) return
        try {
            ContextCompat.startForegroundService(app, MatchService.intent(app))
            serviceUp = true
        } catch (e: Exception) {
            // Op de achtergrond mag Android dit weigeren; de app werkt dan gewoon zonder.
            Log.w("Graph", "Voorgrondservice niet gestart", e)
        }
    }

    /** Door MatchService.onDestroy: vanaf nu mag een volgende wedstrijd hem opnieuw starten. */
    fun onServiceStopped() {
        serviceUp = false
    }

    fun onServiceTimedOut() {
        serviceBlockedUntil = Time.wall() + 24 * 3_600_000L
    }
}
