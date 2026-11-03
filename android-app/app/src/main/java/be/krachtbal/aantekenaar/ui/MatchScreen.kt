package be.krachtbal.aantekenaar.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import be.krachtbal.aantekenaar.data.Field
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.MatchSession
import be.krachtbal.aantekenaar.data.MatchState
import be.krachtbal.aantekenaar.data.Op
import be.krachtbal.aantekenaar.data.Player
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.data.Sides
import be.krachtbal.aantekenaar.data.TeamInfo
import be.krachtbal.aantekenaar.data.halfDurationSeconds
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.floor

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Het aantekenscherm vult ALTIJD het volledige scherm, zonder scrollen, op elk toestel:
//  • staand (telefoon, tablet): kop · status · klok · twee ploegkaarten · onderbalk;
//  • liggend of breed: thuis | klok + bediening | uit — zoals een echt scorebord.
// De stijl is die van de site (simple-scorekeeper.css): ploegkaarten met clubkleur-gloed, +1 in vol
// accent en +2 gedempt, een neutrale klokkaart met gekleurde rand, rode outline voor "Einde".
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Volledig scherm (systeembalken weg; veeg vanaf de rand om ze even terug te halen). */
@Composable
private fun ImmersiveEffect(on: Boolean) {
    val view = LocalView.current
    DisposableEffect(on) {
        val window = view.context.findActivity()?.window
        val ctrl = window?.let { WindowCompat.getInsetsController(it, view) }
        if (on) {
            ctrl?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            ctrl?.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            ctrl?.show(WindowInsetsCompat.Type.systemBars())
        }
        onDispose { ctrl?.show(WindowInsetsCompat.Type.systemBars()) }
    }
}

data class ClockView(val seconds: Int, val running: Boolean)

/**
 * Tikt op de secondegrens van de lokale klok (niet op een vast interval): zelfcorrigerend, zonder
 * de "seconde slaat over"-hik van de website (zie use-live-clock.ts).
 */
@Composable
private fun rememberClock(session: MatchSession): State<ClockView> =
    produceState(ClockView(session.clockSeconds().toInt(), session.clock.isRunning), session) {
        while (true) {
            val v = session.clockSeconds()
            val running = session.clock.isRunning
            value = ClockView(v.toInt(), running)
            val wait = if (running) ((1.0 - (v - floor(v))) * 1000).toLong().coerceIn(16L, 1000L) else 100L
            delay(wait)
        }
    }

private fun fmtClock(total: Int): String {
    val s = maxOf(0, total)
    return "%02d:%02d".format(s / 60, s % 60)
}

private data class Confirm(
    val title: String,
    val text: String,
    val button: String,
    val danger: Boolean,
    val scoreLine: Triple<String, String, String>? = null,
    val run: () -> Unit,
)

/** Alles wat de onderdelen van het bord nodig hebben, op één plek. */
private class MatchCtl(
    val matchId: Int,
    val session: MatchSession,
    val ui: MatchSession.Ui,
    val state: MatchState,
    val others: Boolean,
    val offline: Boolean,
    val immersive: Boolean,
    val onGoal: (Side, Int) -> Unit,
    val onEndHalf: () -> Unit,
    val onFinish: () -> Unit,
    val onReopen: () -> Unit,
    val onReset: () -> Unit,
    val onField: () -> Unit,
    val onSub: (Side) -> Unit,
    val onWeb: (String) -> Unit,
    val toggleImmersive: () -> Unit,
    val onSettings: () -> Unit,
) {
    val hasAlerts: Boolean
        get() = ui.needLogin || ui.staleQueue || ui.rejected.isNotEmpty() || ui.notice != null || others || ui.notAllowed != null
    val canEdit: Boolean get() = !others && !state.isFinished
}

@Composable
fun MatchScreen(matchId: Int, onBack: () -> Unit, onSettings: () -> Unit) {
    val session = remember(matchId) { Graph.session(matchId) }
    DisposableEffect(session) {
        session.attach()
        onDispose { session.detach() }
    }
    // Scherm aan: geregeld in AppRoot volgens de instelling (Instellingen → Scherm altijd aan).

    val ui by session.ui.collectAsState()
    val netOnline by Graph.network.online.collectAsState()
    val state = ui.state
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var pendingGoal by remember { mutableStateOf<Pair<Side, Int>?>(null) }
    var confirm by remember { mutableStateOf<Confirm?>(null) }
    var fieldDialog by remember { mutableStateOf(false) }
    var subSide by remember { mutableStateOf<Side?>(null) }
    var immersive by remember { mutableStateOf(Graph.settings.immersiveOnOpen.value) }
    ImmersiveEffect(immersive)

    val me = Graph.authRepo.userId
    val others = state != null && state.trust.claimActive && state.trust.scorerId != null && state.trust.scorerId != me && state.isLive
    val offline = !netOnline || !ui.online

    // Korte schermen (liggende telefoon): kop en balken worden lager zodat het bord meer ruimte krijgt.
    val shortScreen = LocalConfiguration.current.screenHeightDp < 420

    // De ambient van de aantekentafel: de clubkleuren van thuis (links) en uit (rechts).
    val homeC = parseHex(state?.teams?.home?.colors?.primary) ?: Pal.DefaultHome
    val awayC = parseHex(state?.teams?.away?.colors?.primary) ?: Pal.DefaultAway

    ScoreboardBackdrop(homeC, awayC) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            TopBar(matchId, state, offline, ui, shortScreen, onBack)

            when {
                state == null && ui.loadError != null -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(ui.loadError ?: "", color = Pal.Bad)
                    TextButton(onClick = { session.reload() }) { Text("Opnieuw proberen", color = Pal.Accent) }
                }
                state == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Pal.Accent) }
                else -> {
                    val ctl = MatchCtl(
                        matchId = matchId,
                        session = session,
                        ui = ui,
                        state = state,
                        others = others,
                        offline = offline,
                        immersive = immersive,
                        onGoal = { side, points ->
                            val team = state.teams[side]
                            if (ui.federation && ui.squad[side].isNotEmpty()) pendingGoal = side to points
                            else session.goal(side, points)
                        },
                        onEndHalf = {
                            confirm = Confirm(
                                "Einde 1e helft — bevestig de stand",
                                "De klok gaat naar de rust: hij springt terug op 0 en blijft stil staan. De score van de 1e helft kan daarna niet meer aangepast worden. " +
                                    "De tweede helft start je zelf door op de klok te tikken.",
                                "✓ Bevestigen & naar 2e helft", false,
                                scoreLine = Triple(state.teams.home.name, "${state.score.home} – ${state.score.away}", state.teams.away.name),
                            ) { session.endHalf() }
                        },
                        onFinish = {
                            confirm = Confirm(
                                "Hele wedstrijd beëindigen?",
                                "De eindstand wordt vastgelegd en het aantekenen stopt. Ging het per ongeluk, dan kan je de wedstrijd daarna nog heropenen — je verliest niets.",
                                "⏹ Ja, de wedstrijd is gedaan", true,
                                scoreLine = Triple(state.teams.home.name, "${state.score.home} – ${state.score.away}", state.teams.away.name),
                            ) { session.finish() }
                        },
                        onReopen = {
                            confirm = Confirm(
                                "Wedstrijd heropenen?",
                                "De wedstrijd gaat terug live en je kan verder aantekenen. De score en de kruisjes blijven staan; de klok blijft stil tot je ze zelf weer start.",
                                "🔓 Ja, heropenen", false,
                            ) { session.reopen() }
                        },
                        onReset = {
                            confirm = Confirm(
                                "Terugzetten naar niet-gestart?",
                                "Gebruik dit als de wedstrijd per ongeluk gestart is. Alles wat al ingevoerd werd — doelpunten, kruisjes en de klok — verdwijnt. Dit kan niet ongedaan gemaakt worden.",
                                "↺ Ja, terugzetten", true,
                            ) { session.reset() }
                        },
                        onField = { fieldDialog = true },
                        onSub = { s -> subSide = s; scope.launch { session.loadSquad() } },
                        onWeb = { path -> ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Graph.authRepo.serverUrl + path))) },
                        toggleImmersive = { immersive = !immersive },
                        onSettings = onSettings,
                    )
                    BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                        val wide = maxWidth > maxHeight && maxWidth >= 520.dp
                        if (wide) WideBoard(ctl, maxHeight) else TallBoard(ctl, maxHeight)
                    }
                }
            }
        }
    }

    confirm?.let { c ->
        ConfirmDialog(c.title, c.text, c.button, c.danger, c.scoreLine, onConfirm = { confirm = null; c.run() }, onDismiss = { confirm = null })
    }

    pendingGoal?.let { (side, points) ->
        val team = state?.teams?.get(side)
        if (state != null && team != null) {
            ScorerPicker(
                team = team,
                points = points,
                players = Field.resolve(ui.squad[side], state.lineup[side]),
                captain = state.captain[side],
                onPick = { p -> pendingGoal = null; session.goal(side, points, p) },
                onNoPlayer = { pendingGoal = null; session.goal(side, points, null) },
                onDismiss = { pendingGoal = null },
            )
        }
    }

    subSide?.let { side ->
        val team = state?.teams?.get(side)
        if (state != null && team != null) {
            val squad = ui.squad[side]
            SubDialog(
                team = team,
                squad = squad,
                field = Field.resolve(squad, state.lineup[side]),
                captain = state.captain[side],
                started = state.isLive,
                onSwap = { out, into -> Field.swap(Field.resolve(squad, state.lineup[side]), out, into)?.let { session.setLineup(side, it) } },
                onDone = { subSide = null },
            )
        }
    }

    if (fieldDialog) {
        FieldPairDialog(
            onDismiss = { fieldDialog = false },
            onPair = { code, done ->
                scope.launch {
                    val (ok, msg) = Graph.api.pairFieldScreen(matchId, code)
                    done(ok, msg)
                    if (ok) fieldDialog = false
                }
            },
        )
    }
}

// ── Indelingen ────────────────────────────────────────────────────────────────────────────────

/** Staand: kop · (meldingen) · status · klok · ploegkaarten · onderbalk — alles in één scherm. */
@Composable
private fun TallBoard(c: MatchCtl, availH: Dp) {
    Column(
        Modifier.fillMaxSize().padding(start = 12.dp, end = 12.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (c.hasAlerts) Alerts(c, maxH = availH * 0.3f)
        StatusRow(c)
        // Op een lage staande telefoon (< 600 dp bord) krijgt de klok meer hoogte: de ploegkaarten hebben ruimte over.
        ClockRow(c, Modifier.fillMaxWidth().weight(if (availH < 600.dp) 1.3f else 0.95f))
        Row(Modifier.fillMaxWidth().weight(2.7f), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TeamCard(c, Side.HOME, Modifier.weight(1f).fillMaxHeight())
            TeamCard(c, Side.AWAY, Modifier.weight(1f).fillMaxHeight())
        }
        BottomBar(c, Modifier.fillMaxWidth())
    }
}

/** Liggend/breed: thuis | klok + bediening | uit. */
@Composable
private fun WideBoard(c: MatchCtl, availH: Dp) {
    Row(
        Modifier.fillMaxSize().padding(start = 10.dp, end = 10.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        TeamCard(c, Side.HOME, Modifier.weight(1f).fillMaxHeight(), badge = true)
        Column(Modifier.weight(1.2f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (c.hasAlerts) Alerts(c, maxH = availH * 0.35f)
            StatusRow(c)
            ClockPanel(c, Modifier.fillMaxWidth().weight(1f))
            BottomBar(c, Modifier.fillMaxWidth())
        }
        TeamCard(c, Side.AWAY, Modifier.weight(1f).fillMaxHeight(), badge = true)
    }
}

/** De klok geflankeerd door de clublogo's (`.ssk-clockrow`): thuis links, uit rechts. */
@Composable
private fun ClockRow(c: MatchCtl, modifier: Modifier) {
    val s = c.state
    val homeC = parseHex(s.teams.home.colors?.primary) ?: Pal.DefaultHome
    val awayC = parseHex(s.teams.away.colors?.primary) ?: Pal.DefaultAway
    BoxWithConstraints(modifier) {
        // clamp(60px, 15vw, 104px) van de site, begrensd door de hoogte van de rij.
        val logo = minOf(maxHeight * 0.7f, maxWidth * 0.15f).coerceIn(40.dp, 100.dp)
        Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            LogoHalo(s.teams.home.name, s.teams.home.logoUrl, s.teams.home.logoFit, homeC, logo)
            ClockPanel(c, Modifier.weight(1f).fillMaxHeight())
            LogoHalo(s.teams.away.name, s.teams.away.logoUrl, s.teams.away.logoFit, awayC, logo)
        }
    }
}

// ── Onderdelen ────────────────────────────────────────────────────────────────────────────────

@Composable
private fun TopBar(matchId: Int, state: MatchState?, offline: Boolean, ui: MatchSession.Ui, compact: Boolean, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(if (compact) 40.dp else 52.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onBack) { Text("←", color = Pal.Text, fontSize = 24.sp) }
        Column(Modifier.weight(1f)) {
            val title = state?.let { "${it.teams.home.name} – ${it.teams.away.name}" } ?: "Wedstrijd #$matchId"
            val reeks = state?.match?.reeks
            Text(
                if (compact && reeks != null) "$title · $reeks" else title,
                color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = if (compact) 1 else 2,
                lineHeight = 16.sp, overflow = TextOverflow.Ellipsis,
            )
            // `.ssk-reeks`: de reeks in het accent.
            if (!compact && reeks != null) Text(reeks, color = Pal.Accent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        Spacer(Modifier.width(6.dp))
        ConnectionPill(offline = offline, pending = ui.pending, link = ui.liveLink)
        Spacer(Modifier.width(8.dp))
    }
}

@Composable
private fun ConnectionPill(offline: Boolean, pending: Int, link: Boolean) {
    when {
        offline -> Pill(if (pending > 0) "📴 Offline · $pending wachten" else "📴 Offline", Pal.Warn)
        pending > 0 -> Pill("⏳ $pending verzenden…", Pal.Warn)
        link -> Pill("● Live", Pal.Home)
        else -> Pill("◌ Verbinden…", Pal.Dim)
    }
}

/** Meldingen (uitgelogd, geweigerd, iemand anders tekent aan…). Krijgen nooit meer dan [maxH] en scrollen dan zelf. */
@Composable
private fun Alerts(c: MatchCtl, maxH: Dp) {
    val session = c.session
    val ui = c.ui
    val state = c.state
    Column(
        Modifier.fillMaxWidth().heightIn(max = maxH).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (ui.needLogin) {
            Banner("Je bent uitgelogd", "Je tikken blijven bewaard en worden verstuurd zodra je opnieuw inlogt.", Pal.Bad) {
                SmallButton("Opnieuw inloggen", { Graph.authRepo.logout() }, Btn.Danger)
            }
        }
        if (ui.staleQueue) {
            Banner("Oude, niet-verstuurde acties", "Er staan ${ui.pending} acties van een eerdere sessie klaar. Zijn ze nog geldig?") {
                SmallButton("Versturen", { session.sendStale() })
                SmallButton("Weggooien", { session.discardStale() }, Btn.Danger)
            }
        }
        for (r in ui.rejected) {
            Banner("Niet verwerkt: ${r.op.label(state.teams)}", r.message, Pal.Bad) {
                SmallButton("Opnieuw", { session.retryRejected(r.op.opId) })
                SmallButton("Weggooien", { session.discardRejected(r.op.opId) }, Btn.Default)
            }
        }
        ui.notice?.let { n -> Banner("Let op", n) { SmallButton("OK", { session.dismissNotice() }, Btn.Default) } }
        if (c.others) {
            Banner(
                "${state.trust.scorerName ?: "Iemand anders"} tekent deze wedstrijd al aan",
                "Er kan maar één persoon tegelijk aantekenen. Valt dat toestel uit, dan kan je overnemen.",
            ) {
                SmallButton(if (ui.takeoverBusy) "Bezig…" else "Overnemen", { session.takeOver() }, enabled = !ui.takeoverBusy)
            }
        } else if (ui.notAllowed != null) {
            Banner("Je mag deze wedstrijd niet aantekenen", ui.notAllowed, Pal.Bad)
        }
    }
}

/** Status links (`.ssk-status`), scheidsrechter-minuut rechts (`.ssk-refmin`). */
@Composable
private fun StatusRow(c: MatchCtl) {
    val s = c.state
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val word = maxWidth >= 330.dp
        Row(Modifier.fillMaxWidth().heightIn(min = 40.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            when {
                s.isFinished -> StatusPill("AFGELOPEN", dimmed = true)
                s.isLive -> StatusPill("LIVE · H${s.match.currentHalf}", live = true)
                else -> StatusPill("NOG NIET GESTART")
            }
            if (c.canEdit) {
                val shape = RoundedCornerShape(12.dp)
                Row(
                    Modifier.clip(shape).background(Pal.Card).border(1.dp, Pal.Line, shape).padding(horizontal = 8.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(if (word) "⏱ SR-min" else "⏱", color = Pal.Text.copy(alpha = 0.85f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    StepBtn("−", { c.session.refStop(-1) }, s.refereeStops > 0, 34.dp)
                    Text("${s.refereeStops}", color = Pal.Text, fontSize = 16.sp, fontWeight = FontWeight.Bold, style = Num, textAlign = TextAlign.Center, modifier = Modifier.width(22.dp))
                    StepBtn("+", { c.session.refStop(1) }, true, 34.dp)
                }
            }
        }
    }
}

@Composable
private fun ClockPanel(c: MatchCtl, modifier: Modifier) {
    val state = c.state
    val session = c.session
    val clock by rememberClock(session)
    val basis = halfDurationSeconds(state.match.category)
    val extra = state.timeouts.home + state.timeouts.away + state.refereeStops
    val target = basis + extra * 60
    val totMin = basis / 60 + extra
    val half = state.match.currentHalf
    val live = state.isLive
    val rest = live && half >= 2 && !clock.running && clock.seconds < 1
    val over = live && clock.seconds >= target
    // Nog niet gestart: de klok "nodigt uit" (accentrand + zachte gloed), zoals `.ssk-clock.tostart`.
    val toStart = !state.isFinished && (!live || (!clock.running && clock.seconds < 1))
    val pulse by rememberInfiniteTransition(label = "tostart").animateFloat(
        initialValue = 0.45f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "pulse",
    )
    // Zelfde voorrang als in simple-scorekeeper.css (.tostart > .running > .over): zolang de klok loopt blijft de rand
    // accentblauw, ook in overtijd; rood verschijnt pas als ze in overtijd stilstaat.
    val border = when {
        toStart && !c.others -> Pal.Accent
        clock.running -> Pal.Accent
        over -> Pal.Bad
        else -> Pal.Line
    }
    val action = when {
        state.isFinished -> null
        rest -> "▶ Tik om de ${half}e helft te starten"
        toStart -> "▶ Tik om te starten"
        clock.running -> "⏸ Tik om te pauzeren"
        else -> "▶ Tik om verder te gaan"
    }
    val tappable = !state.isFinished && !c.others
    val glow = if (toStart && tappable) Modifier.shadow(14.dp, RoundedCornerShape(Radius.card), ambientColor = Pal.Accent.copy(alpha = pulse), spotColor = Pal.Accent.copy(alpha = pulse)) else Modifier
    Card(
        modifier.then(glow),
        border = border,
        background = Pal.Card,
        onClick = if (tappable) ({ session.toggleClock() }) else null,
    ) {
        BoxWithConstraints(Modifier.fillMaxSize().padding(horizontal = 10.dp, vertical = 6.dp)) {
            val h = maxHeight
            val w = maxWidth
            val showSub = h >= 118.dp
            val showAction = action != null && !c.others
            // In smalle ruimte (liggend, middenkolom) staat de tekst op een eigen regel boven de ±1 min-knoppen.
            val narrow = w < 300.dp
            val reserved = (if (showAction) (if (narrow) (if (live) 58.dp else 28.dp) else 40.dp) else 8.dp) + (if (showSub) 18.dp else 0.dp)
            val digitH = (h - reserved).coerceAtLeast(30.dp)
            // Cijfers in Inter 800 zijn ≈ 0,62 em breed: 0,29 × breedte laat "00:00" ruim binnen de kaart.
            val digitSp = with(LocalDensity.current) { minOf(w * 0.29f, digitH * 0.8f).toSp() }
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(
                    fmtClock(clock.seconds),
                    color = Pal.Text,
                    fontSize = digitSp,
                    fontWeight = FontWeight.ExtraBold,
                    style = Num,
                    maxLines = 1,
                )
                if (showSub) {
                    Text(
                        buildString {
                            append("Helft $half · ")
                            if (extra > 0) append("speelt tot $totMin min (${basis / 60} + $extra)") else append("doel $totMin min")
                            if (rest) append(" · rust")
                        },
                        color = Pal.Text.copy(alpha = 0.75f), fontSize = 12.sp, textAlign = TextAlign.Center, maxLines = 1,
                    )
                }
                if (showAction && narrow) {
                    Text(
                        action!!, color = Pal.Accent, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center, maxLines = 1, modifier = Modifier.padding(top = 2.dp),
                    )
                    if (live) {
                        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MiniChip("− 1 min", Modifier.weight(1f)) { session.adjustClock(-1) }
                            MiniChip("+ 1 min", Modifier.weight(1f)) { session.adjustClock(1) }
                        }
                    }
                } else if (showAction) {
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (live) MiniChip("− 1 min") { session.adjustClock(-1) } else Spacer(Modifier.width(MINI_W))
                        Text(
                            action!!,
                            color = Pal.Accent, fontSize = 13.sp, lineHeight = 15.sp, fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center, maxLines = 2, modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
                        )
                        if (live) MiniChip("+ 1 min") { session.adjustClock(1) } else Spacer(Modifier.width(MINI_W))
                    }
                }
            }
        }
    }
}

private val MINI_W = 64.dp

/** `.ssk-clockadj-btn`: paneel, haarlijn, afgerond, vet. */
@Composable
private fun MiniChip(label: String, modifier: Modifier = Modifier.width(MINI_W), onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier.height(34.dp).clip(shape).background(Pal.Card).border(1.dp, Pal.Line, shape).clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = Pal.Text, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, style = Num, maxLines = 1) }
}

/** Een gestippelde rand, zoals `.ssk-btn.zacht` (de noodrem die je niet per ongeluk tikt). */
private fun Modifier.dashedBorder(color: Color, radius: Dp): Modifier = drawBehind {
    drawRoundRect(
        color = color,
        cornerRadius = CornerRadius(radius.toPx()),
        style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))),
    )
}

@Composable
private fun TeamCard(c: MatchCtl, side: Side, modifier: Modifier, badge: Boolean = false) {
    val state = c.state
    val team = state.teams[side]
    val teamColor = parseHex(team.colors?.primary) ?: if (side == Side.HOME) Pal.DefaultHome else Pal.DefaultAway
    // `--team-ink`: de clubkleur, lichter gemaakt als ze te donker is voor het donkere paneel.
    val ink = readableOnDark(teamColor)
    val last = state.lastSimpleGoalBySide[side]
    val canEdit = c.canEdit
    val shape = RoundedCornerShape(Radius.cardLg)
    Box(
        modifier
            .shadow(10.dp, shape, ambientColor = teamColor.copy(alpha = 0.55f), spotColor = teamColor.copy(alpha = 0.55f))
            .clip(shape)
            .background(Pal.Card)
            .drawBehind {
                // radial-gradient(120% 70% at 50% -10%, team 22% → transparent 65%)
                drawRect(
                    Brush.radialGradient(
                        listOf(teamColor.copy(alpha = 0.22f), Color.Transparent),
                        center = Offset(size.width * 0.5f, -size.height * 0.07f),
                        radius = size.width * 0.95f,
                    ),
                )
                // border-top: 4px solid team
                drawRect(teamColor, size = Size(size.width, 4.dp.toPx()))
            }
            .border(1.dp, mix(teamColor, 0.45f, Pal.Line), shape),
    ) {
        BoxWithConstraints(Modifier.fillMaxSize().padding(start = 10.dp, end = 10.dp, top = 14.dp, bottom = 10.dp)) {
            val labeled = maxHeight >= 380.dp
            // Korte kaart (liggende telefoon): kleinere kop.
            val compact = maxHeight < 330.dp
            // Het logo in de kop (liggend/breed) alleen als de kaart breed genoeg is voor naam én logo.
            val showBadge = badge && maxWidth >= 200.dp
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                // Kop: ondoen-pijl links, naam gecentreerd, en (liggend/breed, als er plaats is) het logo rechts.
                // In de staande indeling staan de logo's naast de klok, zoals op de site.
                Row(
                    Modifier.fillMaxWidth().heightIn(min = if (compact) 36.dp else 40.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (canEdit) UndoBtn(teamColor, last?.points, Modifier) { c.session.undo(side) }
                    Text(
                        team.name,
                        color = mix(ink, 0.55f, Color.White),
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = if (compact) 12.sp else 15.sp,
                        lineHeight = if (compact) 14.sp else 17.sp,
                        maxLines = 2,
                        textAlign = TextAlign.Center,
                        overflow = TextOverflow.Ellipsis,
                        style = TextStyle(shadow = Shadow(Color.Black.copy(alpha = 0.55f), Offset(0f, 2f), 3f)),
                        modifier = Modifier.weight(1f),
                    )
                    if (showBadge) TeamBadge(team.name, team.logoUrl, team.logoFit, ring = teamColor.copy(alpha = 0.7f), size = 36.dp)
                }
                // Federatiemodus: de 4 veldspelers en de wisselknop (alleen als er een bank is).
                if (canEdit && c.ui.federation) {
                    val squad = c.ui.squad[side]
                    val field = Field.resolve(squad, state.lineup[side])
                    if (Field.bench(squad, field).isNotEmpty()) SubChip(field, state.captain[side], teamColor) { c.onSub(side) }
                }
                // De score krijgt de ruimte die overblijft en schaalt mee (`.ssk-score`).
                BoxWithConstraints(Modifier.weight(if (!canEdit) 3f else if (compact) 0.8f else 1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    val sp = with(LocalDensity.current) { minOf(maxHeight * 0.8f, maxWidth * 0.62f).toSp() }
                    Text(
                        "${state.score[side]}",
                        color = ink,
                        fontSize = sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        style = Num.merge(TextStyle(shadow = Shadow(teamColor.copy(alpha = 0.45f), Offset.Zero, 26f))),
                    )
                }
                if (canEdit) {
                    // `.ssk-goalbtns`: 1,5fr / 1fr — +1 is veruit het vaakst, dus groter en in vol accent.
                    Row(Modifier.weight(if (compact) 1.5f else 1.8f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        GoalTile("+1", "nekworp", primary = true, Modifier.weight(1.5f).fillMaxHeight()) { c.onGoal(side, 1) }
                        GoalTile("+2", "rugworp", primary = false, Modifier.weight(1f).fillMaxHeight()) { c.onGoal(side, 2) }
                    }
                    Column(Modifier.weight(if (compact) 1.7f else if (labeled) 1.5f else 1.1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        CounterRow(
                            Modifier.weight(1f), "✖", "Kruisjes", state.crosses[side], labeled,
                            minusEnabled = state.crosses[side] > 0, plusEnabled = true,
                            onMinus = { c.session.cross(side, -1) }, onPlus = { c.session.cross(side, 1) },
                        )
                        CounterRow(
                            Modifier.weight(1f), "⏱", "Time-outs", state.timeouts[side], labeled,
                            minusEnabled = state.timeouts[side] > 0, plusEnabled = state.timeouts[side] < 2,
                            onMinus = { c.session.timeout(side, -1) }, onPlus = { c.session.timeout(side, 1) },
                        )
                    }
                } else {
                    Dim("✖ ${state.crosses[side]}   ⏱ ${state.timeouts[side]}")
                }
            }
        }
    }
}

/** `.ssk-undo`: 40 dp, afgerond, rand en tint in de clubkleur; toont wat er verdwijnt. */
@Composable
private fun UndoBtn(team: Color, points: Int?, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    val enabled = points != null
    Row(
        modifier
            .size(width = 44.dp, height = 40.dp)
            .alpha(if (enabled) 1f else 0.28f)
            .clip(shape)
            .background(mix(team, 0.14f, Pal.Card))
            .border(1.dp, mix(team, 0.45f, Pal.Line), shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text("↩", color = Pal.Text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        if (points != null) Text("−$points", color = Pal.Text.copy(alpha = 0.8f), fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 1.dp))
    }
}

/**
 * Doelpunttegel (`.ssk-goal`): +1 (nekworp) in vol accent met donkere tekst; +2 (rugworp) gedempt:
 * accenttekst op een lichte accenttint met haarlijn. De cijfers groeien mee met de tegel.
 */
@Composable
private fun GoalTile(points: String, label: String, primary: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    val bg = if (primary) Pal.Accent else mix(Pal.Accent, 0.16f, Pal.Card)
    val fg = if (primary) Pal.InkDark else Pal.Accent
    BoxWithConstraints(
        modifier
            .clip(shape)
            .background(bg)
            .then(if (primary) Modifier else Modifier.border(1.dp, mix(Pal.Accent, 0.42f, Pal.Line), shape))
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        val showLabel = maxHeight >= 56.dp
        val sp = with(LocalDensity.current) { minOf((maxHeight - if (showLabel) 16.dp else 0.dp) * 0.55f, maxWidth * 0.46f).toSp() }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(points, fontSize = sp, fontWeight = FontWeight.ExtraBold, color = fg, maxLines = 1)
            if (showLabel) Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = fg.copy(alpha = if (primary) 0.8f else 0.75f), maxLines = 1)
        }
    }
}

/** `.ssk-stat`: label (80 %) en een −/n/+-bediening met haarlijn-knoppen; label boven de knoppen op hoge kaarten. */
@Composable
private fun CounterRow(
    modifier: Modifier,
    icon: String,
    word: String,
    value: Int,
    labeled: Boolean,
    minusEnabled: Boolean,
    plusEnabled: Boolean,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
) {
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val labelH = if (labeled) 16.dp else 0.dp
        val iconW = if (labeled) 0.dp else 20.dp
        val btn = minOf(46.dp, (maxHeight - labelH).coerceAtLeast(30.dp), (maxWidth - iconW - 28.dp - 12.dp) / 2)
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            if (labeled) Text("$icon $word", color = Pal.Text.copy(alpha = 0.8f), fontSize = 12.sp, maxLines = 1)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (!labeled) Text(icon, color = Pal.Text.copy(alpha = 0.8f), fontSize = 15.sp, textAlign = TextAlign.Center, modifier = Modifier.width(iconW))
                StepBtn("−", onMinus, minusEnabled, btn)
                Text("$value", color = Pal.Text, fontSize = 17.sp, fontWeight = FontWeight.Bold, style = Num, textAlign = TextAlign.Center, modifier = Modifier.width(28.dp))
                StepBtn("+", onPlus, plusEnabled, btn)
            }
        }
    }
}

/** Onderbalk: de belangrijkste volgende stap (`.ssk-btn primary / danger / zacht`) + een menu met de zeldzame acties. */
@Composable
private fun BottomBar(c: MatchCtl, modifier: Modifier) {
    val s = c.state
    var menu by remember { mutableStateOf(false) }
    val barH = if (LocalConfiguration.current.screenHeightDp < 420) 46.dp else 54.dp
    val shape = RoundedCornerShape(14.dp)
    Row(modifier.height(barH), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        val primary: Triple<String, Btn?, () -> Unit>? = when {
            c.others -> null
            s.isFinished -> Triple("🔓 Heropenen", null, c.onReopen)
            s.isLive && s.match.currentHalf == 1 -> Triple("⏭ Einde 1e helft", Btn.Primary, c.onEndHalf)
            s.isLive -> Triple("⏹ Einde wedstrijd", Btn.Danger, c.onFinish)
            else -> null
        }
        if (primary != null) {
            val (label, kind, action) = primary
            val styled = when (kind) {
                Btn.Primary -> Modifier.background(Pal.Accent)
                Btn.Danger -> Modifier.border(1.dp, Pal.Bad, shape)
                Btn.Default, null -> Modifier.dashedBorder(Pal.Dim, 14.dp) // zacht: gestippeld
            }
            val fg = when (kind) {
                Btn.Primary -> Pal.InkDark
                Btn.Danger -> Pal.Bad
                Btn.Default, null -> Pal.Dim
            }
            Box(
                Modifier.weight(1f).fillMaxHeight().clip(shape).then(styled).clickable(role = Role.Button, onClick = action),
                contentAlignment = Alignment.Center,
            ) { Text(label, color = fg, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1) }
        } else {
            Spacer(Modifier.weight(1f))
        }
        Box {
            Box(
                Modifier.width(54.dp).fillMaxHeight().clip(shape).background(Pal.Card).border(1.dp, Pal.Line, shape)
                    .clickable(role = Role.Button) { menu = true },
                contentAlignment = Alignment.Center,
            ) { Text("⋯", color = Pal.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                MenuItem("⚙ Instellingen") { menu = false; c.onSettings() }
                MenuItem(if (c.immersive) "⛶ Volledig scherm verlaten" else "⛶ Volledig scherm") { menu = false; c.toggleImmersive() }
                if (s.isLive && !c.others) {
                    MenuItem("📡 Veldscherm koppelen") { menu = false; c.onField() }
                    MenuItem("↺ Wedstrijd was nog niet bezig") { menu = false; c.onReset() }
                }
                MenuItem("📺 Wedstrijdpagina (website)") { menu = false; c.onWeb("/match/${c.matchId}") }
                if (c.ui.federation) {
                    MenuItem("🚑 Blessure (website)") { menu = false; c.onWeb("/aftekenen/${c.matchId}#blessure") }
                    MenuItem("✍️ Aftekenen (website)") { menu = false; c.onWeb("/aftekenen/${c.matchId}") }
                }
            }
        }
    }
}

@Composable
private fun MenuItem(text: String, onClick: () -> Unit) {
    DropdownMenuItem(text = { Text(text) }, onClick = onClick)
}

// ── Dialogen ──────────────────────────────────────────────────────────────────────────────────

/**
 * Spelerkeuze (`.ssk-pick-player`): grote groene kaarten met een wit rugnummer-schijfje en vette
 * naam — leesbaar in fel zonlicht. Zo ziet de keuze er ook op de site uit.
 */
@Composable
private fun ScorerPicker(
    team: TeamInfo,
    points: Int,
    players: List<Player>,
    captain: Int?,
    onPick: (Player) -> Unit,
    onNoPlayer: () -> Unit,
    onDismiss: () -> Unit,
) {
    val cardShape = RoundedCornerShape(14.dp)
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Pal.Card,
        shape = RoundedCornerShape(Radius.cardLg),
        titleContentColor = Pal.Text,
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Wie scoorde?", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text("+$points ${if (points == 2) "rugworp" else "nekworp"}", color = Pal.Accent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
                Text(team.name, color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        },
        text = {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.heightIn(max = 380.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(players, key = { it.id }) { p ->
                    Column(
                        Modifier
                            .heightIn(min = 96.dp)
                            .clip(cardShape)
                            .background(Brush.linearGradient(listOf(Color(0xFF2F7A4F), Color(0xFF1E5235))))
                            .border(2.dp, Color(0xFF56A577), cardShape)
                            .clickable(role = Role.Button) { onPick(p) }
                            .padding(horizontal = 8.dp, vertical = 12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterVertically),
                    ) {
                        Box(Modifier.size(50.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                            Text("${p.shirtNumber}", color = Color(0xFF14161A), fontSize = 25.sp, fontWeight = FontWeight.Black, style = Num)
                        }
                        Text(
                            (if (p.id == captain) "👑 " else "") + p.name.trim(),
                            color = Color.White, fontSize = 14.sp, lineHeight = 17.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2,
                            overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        },
        confirmButton = { ModalBtn("Zonder speler", Btn.Default, onNoPlayer) },
        dismissButton = { ModalBtn("Annuleren", Btn.Default, onDismiss) },
    )
}

/** Koppelcode van het veldscherm (`.ssk-veldkoppel`). */
@Composable
private fun FieldPairDialog(onDismiss: () -> Unit, onPair: (String, (Boolean, String) -> Unit) -> Unit) {
    var code by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Pal.Card,
        shape = RoundedCornerShape(Radius.cardLg),
        titleContentColor = Pal.Text,
        title = { Text("Veldscherm koppelen", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Dim("Voer de 6-cijferige code in die op het veldscherm (tv) staat.")
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.filter(Char::isDigit).take(6) },
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    textStyle = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = 3.sp, textAlign = TextAlign.Center),
                    placeholder = { Text("123456", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) },
                    colors = fieldColors(),
                )
                msg?.let { Text(it, color = Pal.Bad, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
            }
        },
        confirmButton = {
            ModalBtn(if (busy) "Bezig…" else "Koppel", Btn.Primary) {
                if (code.length == 6 && !busy) {
                    busy = true
                    msg = null
                    onPair(code) { ok, m -> busy = false; if (!ok) msg = m }
                }
            }
        },
        dismissButton = { ModalBtn("Annuleren", Btn.Default, onDismiss) },
    )
}

/** Leesbare naam van een actie, voor de lijst "niet verwerkt". */
fun Op.label(teams: Sides<TeamInfo>): String {
    val team = Side.fromWire(side)?.let { teams[it].name } ?: ""
    return when (action) {
        "simplestart" -> "Wedstrijd starten"
        "simplegoal" -> "Doelpunt +${points ?: 1} $team" + (playerName?.let { " ($it)" } ?: "")
        "simpleundo" -> "Doelpunt terugnemen $team"
        "simplecross" -> "Kruisje ${if ((delta ?: 1) < 0) "−" else "+"}1 $team"
        "simpletimeout" -> "Time-out ${if ((delta ?: 1) < 0) "−" else "+"}1 $team"
        "simplerefstop" -> "Scheidsrechter-minuut ${if ((delta ?: 1) < 0) "−" else "+"}1"
        "simplehalf" -> "Einde 1e helft"
        "finish" -> "Einde wedstrijd"
        "reopen" -> "Heropenen"
        "reset" -> "Terugzetten"
        "clock" -> "Klok"
        "setlineup" -> "Wissel $team"
        else -> action
    }.trim()
}

// ── Wissels ───────────────────────────────────────────────────────────────────────────────────

/** Onder de ploegnaam: wie op het veld staat (kapitein 👑) en een tik om te wisselen — zoals `⇄ Wissel · veld …` op de site. */
@Composable
private fun SubChip(field: List<Player>, captain: Int?, team: Color, onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 34.dp)
            .clip(shape)
            .background(mix(team, 0.16f, Pal.Card))
            .border(1.dp, mix(team, 0.5f, Pal.Line), shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            "⇄ Wissel · veld " + field.joinToString(" ") { (if (it.id == captain) "👑" else "") + it.shirtNumber },
            color = Pal.Text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, style = Num,
        )
    }
}

/**
 * Wissel (`.ssk-modal` met veld en bank): tik een veldspeler én een bankspeler, in willekeurige volgorde — ze wisselen meteen
 * en het scherm blijft open voor de volgende wissel. Vóór de aftrap kies je zo wie op het veld start. De server logt elke
 * wissel op het wedstrijdblad; daaruit weet de scheidsrechter na afloop wie er speelde.
 */
@Composable
private fun SubDialog(
    team: TeamInfo,
    squad: List<Player>,
    field: List<Player>,
    captain: Int?,
    started: Boolean,
    onSwap: (outId: Int, inId: Int) -> Unit,
    onDone: () -> Unit,
) {
    var out by remember { mutableStateOf<Int?>(null) }
    var into by remember { mutableStateOf<Int?>(null) }
    var last by remember { mutableStateOf<String?>(null) }
    val bench = Field.bench(squad, field)
    val nameOf = { id: Int -> squad.firstOrNull { it.id == id }?.name ?: "?" }

    // Zodra beide gekozen zijn, wisselen we meteen.
    LaunchedEffect(out, into) {
        val o = out
        val i = into
        if (o != null && i != null) {
            onSwap(o, i)
            last = "✓ ${nameOf(i)} voor ${nameOf(o)}"
            out = null
            into = null
        }
    }

    AlertDialog(
        onDismissRequest = onDone,
        containerColor = Pal.Card,
        shape = RoundedCornerShape(Radius.cardLg),
        titleContentColor = Pal.Text,
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(if (started) "Wissel" else "Veldspelers", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text(team.name, color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        },
        text = {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    if (started) "Tik een veldspeler én een bankspeler: ze wisselen meteen."
                    else "Kies wie op het veld start: tik een veldspeler én een bankspeler.",
                    color = Pal.Dim, fontSize = 13.sp, lineHeight = 17.sp,
                )
                last?.let { Text(it, color = Pal.Ok, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
                SectionTitle("Op het veld")
                PlayerGrid(field, captain, selected = out, tint = Pal.Bad) { out = if (out == it.id) null else it.id }
                SectionTitle("Bank")
                if (bench.isEmpty()) Dim("Geen wisselspelers.")
                PlayerGrid(bench, captain, selected = into, tint = Pal.Home) { into = if (into == it.id) null else it.id }
            }
        },
        confirmButton = { ModalBtn("Klaar", Btn.Primary, onDone) },
    )
}

@Composable
private fun PlayerGrid(players: List<Player>, captain: Int?, selected: Int?, tint: Color, onTap: (Player) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        players.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { p -> PlayerChip(p, p.id == captain, p.id == selected, tint, Modifier.weight(1f)) { onTap(p) } }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun PlayerChip(p: Player, captain: Boolean, selected: Boolean, tint: Color, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .heightIn(min = 60.dp)
            .clip(shape)
            .background(if (selected) tint.copy(alpha = 0.22f) else Pal.CardHi)
            .border(2.dp, if (selected) tint else Pal.Line, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
            Text("${p.shirtNumber}", color = Color(0xFF14161A), fontSize = 17.sp, fontWeight = FontWeight.Black, style = Num)
        }
        Text(
            (if (captain) "👑 " else "") + p.name.trim(),
            color = Pal.Text, fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
    }
}
