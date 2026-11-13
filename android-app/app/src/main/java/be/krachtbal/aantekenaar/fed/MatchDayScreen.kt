package be.krachtbal.aantekenaar.fed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.MatchState
import be.krachtbal.aantekenaar.data.TeamInfo
import be.krachtbal.aantekenaar.ui.AuroraBackdrop
import be.krachtbal.aantekenaar.ui.Banner
import be.krachtbal.aantekenaar.ui.Card
import be.krachtbal.aantekenaar.ui.CenterText
import be.krachtbal.aantekenaar.ui.Dim
import be.krachtbal.aantekenaar.ui.Num
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.Pill
import be.krachtbal.aantekenaar.ui.SectionTitle
import be.krachtbal.aantekenaar.ui.SmallButton
import be.krachtbal.aantekenaar.ui.TeamBadge
import be.krachtbal.aantekenaar.ui.VSpace
import be.krachtbal.aantekenaar.ui.findActivity
import be.krachtbal.aantekenaar.ui.parseHex
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val dayFmt = DateTimeFormatter.ofPattern("EEEE d MMMM · HH:mm", Locale.forLanguageTag("nl-BE"))

/** Hoe vaak de hub zich vernieuwt zolang hij zichtbaar is: een scheidsrechter kan op een ander toestel vrijgeven. */
private const val REFRESH_MS = 15_000L

/**
 * De wedstrijddag van één wedstrijd: alle stappen op een rij, met wat er klaar is en wie aan zet is. Van hieruit ga je
 * naar het scherm van de stap. Dit is de rode draad van de federatie-app (docs/FEDERATIEFLOW.md §5).
 */
@Composable
fun MatchDayScreen(
    matchId: Int,
    onBack: () -> Unit,
    /** Opent het scherm van een stap (de tafel is het bestaande aantekenscherm). */
    onOpenStep: (StepId) -> Unit,
    onSettings: () -> Unit,
    onMeldingen: () -> Unit = {},
    ongelezen: Int = 0,
) {
    val model = remember(matchId) { HubModel(matchId) }
    val ui by model.ui.collectAsState()
    val me by Graph.authRepo.me.collectAsState()
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current

    // Vernieuwen zolang de hub zichtbaar is; op de achtergrond (scherm uit, andere app) stopt het.
    var started by remember { mutableStateOf(true) }
    val owner = ctx.findActivity() as? LifecycleOwner
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> started = true
                Lifecycle.Event.ON_STOP -> started = false
                else -> Unit
            }
        }
        owner?.lifecycle?.addObserver(observer)
        onDispose { owner?.lifecycle?.removeObserver(observer) }
    }
    LaunchedEffect(model, started) {
        if (!started) return@LaunchedEffect
        while (true) {
            model.reload()
            delay(REFRESH_MS)
        }
    }

    AuroraBackdrop {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("← Wedstrijden", color = Pal.Accent, fontWeight = FontWeight.Bold) }
                Box(Modifier.weight(1f))
                TextButton(onClick = onMeldingen) {
                    Text(if (ongelezen > 0) "🔔 $ongelezen" else "🔔", color = if (ongelezen > 0) Pal.Accent else Pal.Dim, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                }
                TextButton(onClick = { scope.launch { model.reload() } }) { Text("↻", color = Pal.Accent, fontSize = 20.sp) }
                TextButton(onClick = onSettings) { Text("⚙", color = Pal.Dim, fontSize = 20.sp) }
            }
            val st = ui.state
            when {
                st == null && ui.loading -> CenterText("Wedstrijd laden…")
                st == null -> Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(ui.error ?: "Laden mislukt.", color = Pal.Bad, textAlign = TextAlign.Center)
                    SmallButton("Opnieuw proberen", onClick = { scope.launch { model.reload() } })
                }
                else -> Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Header(st, ui.cancelled, me.label)
                    ui.error?.let { Banner("Niet alles kon geladen worden", it, tint = Pal.Warn) }
                    NextBanner(ui.steps, me)
                    SectionTitle("Stappen van deze wedstrijd")
                    ui.steps.forEachIndexed { i, step ->
                        StepRow(
                            number = i + 1,
                            step = step,
                            mine = Steps.isMine(step, me),
                            onOpen = if (step.state != StepState.NA) ({ onOpenStep(step.id) }) else null,
                        )
                    }
                    // Het blad als PDF: voor iedereen die bij de wedstrijd betrokken is (de server beslist).
                    Card(Modifier.fillMaxWidth(), radius = 12.dp) { Column(Modifier.padding(12.dp)) { BladPdfKnop(matchId) } }
                    VSpace(24)
                }
            }
        }
    }
}

@Composable
private fun Header(st: MatchState, cancelled: Boolean, role: String) {
    Card(Modifier.fillMaxWidth(), radius = 16.dp) {
        Column(Modifier.padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TeamColumn(st.teams.home, Pal.Home, Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    when {
                        cancelled -> Pill("AFGELAST", Pal.Bad)
                        st.isLive || st.isFinished -> {
                            Text("${st.score.home} – ${st.score.away}", color = Pal.Text, fontWeight = FontWeight.Black, fontSize = 28.sp, style = Num)
                            if (st.isLive) Pill("LIVE", Pal.Pop) else Text("afgelopen", color = Pal.Dim, fontSize = 12.sp)
                        }
                        else -> Text("–", color = Pal.Dim, fontSize = 24.sp)
                    }
                }
                TeamColumn(st.teams.away, Pal.Away, Modifier.weight(1f))
            }
            Dim(
                listOfNotNull(
                    st.match.date?.let { runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).format(dayFmt).replaceFirstChar { c -> c.uppercase() } }.getOrNull() },
                    st.match.reeks,
                ).joinToString(" · "),
            )
            Text("Ingelogd als ${Graph.authRepo.userName ?: "—"} · $role", color = Pal.Dim, fontSize = 12.sp)
        }
    }
}

@Composable
private fun TeamColumn(t: TeamInfo, side: Color, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        TeamBadge(t.name, t.logoUrl, t.logoFit, parseHex(t.colors?.primary)?.copy(alpha = 0.7f) ?: side.copy(alpha = 0.65f), 48.dp)
        Text(t.name, color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 17.sp, textAlign = TextAlign.Center, maxLines = 2)
    }
}

/** "Aan jou" als de volgende stap voor deze gebruiker is, anders wie er aan zet is. */
@Composable
private fun NextBanner(steps: List<Step>, me: be.krachtbal.aantekenaar.data.Me) {
    val next = steps.firstOrNull { it.next }
    when {
        next == null && steps.isNotEmpty() && steps.all { it.state == StepState.DONE || it.state == StepState.NA } ->
            Banner("Alles in orde ✓", "Alle stappen van deze wedstrijd zijn gedaan.", tint = Pal.Ok)
        // Niets is nu aan de beurt maar er wacht nog iets: wie het blad niet mag lezen, ziet niet alles.
        next == null && steps.isNotEmpty() ->
            Banner("Even wachten", "Er is nu niets dat jij kan doen. ${steps.firstOrNull { it.state == StepState.WAIT }?.let { "Eerstvolgende stap: ${it.title}." }.orEmpty()}".trim(), tint = Pal.Accent)
        next != null && Steps.isMine(next, me) ->
            Banner("Aan jou: ${next.title}", next.detail, tint = Pal.Ok)
        next != null ->
            Banner("Nu aan de beurt: ${next.title}", "${next.owner.label}${next.detail?.let { " — $it" } ?: ""}", tint = Pal.Accent)
    }
}

@Composable
private fun StepRow(number: Int, step: Step, mine: Boolean, onOpen: (() -> Unit)?) {
    val muted = step.state == StepState.WAIT || step.state == StepState.NA
    Card(
        Modifier.fillMaxWidth().alpha(if (step.state == StepState.NA) 0.55f else 1f),
        border = if (step.next) Pal.Accent else Pal.Line,
        radius = 12.dp,
        onClick = onOpen,
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StepMark(number, step.state)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(step.title, color = if (muted) Pal.Dim else Pal.Text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                step.detail?.let { Text(it, color = Pal.Dim, fontSize = 13.sp, lineHeight = 17.sp) }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Pill(step.owner.label.uppercase(), if (mine) Pal.Accent else Pal.Dim)
                    if (mine && (step.state == StepState.TODO || step.state == StepState.BUSY)) Pill("VOOR JOU", Pal.Ok)
                }
            }
            if (onOpen != null) Text("›", color = Pal.Accent, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/** De bol voor een stap: ✓ klaar, nummer in ijsblauw aan de beurt, rood bezig, gedempt wachtend. */
private data class Mark(val bg: Color, val fg: Color, val ring: Color, val label: String)

@Composable
private fun StepMark(number: Int, state: StepState) {
    val m = when (state) {
        StepState.DONE -> Mark(Pal.Ok, Pal.Ink, Pal.Ok, "✓")
        StepState.TODO -> Mark(Color.Transparent, Pal.Accent, Pal.Accent, number.toString())
        StepState.BUSY -> Mark(Pal.Pop, Color.White, Pal.Pop, "●")
        StepState.WAIT -> Mark(Color.Transparent, Pal.Dim, Pal.Line, number.toString())
        StepState.NA -> Mark(Color.Transparent, Pal.Dim, Pal.Line, "–")
    }
    Box(
        Modifier.size(32.dp).clip(CircleShape).background(m.bg).border(2.dp, m.ring, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(m.label, color = m.fg, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, style = Num)
    }
}
