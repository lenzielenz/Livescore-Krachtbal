package be.krachtbal.aantekenaar.fed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.data.Sides
import be.krachtbal.aantekenaar.ui.Banner
import be.krachtbal.aantekenaar.ui.Btn
import be.krachtbal.aantekenaar.ui.Card
import be.krachtbal.aantekenaar.ui.CenterText
import be.krachtbal.aantekenaar.ui.Dim
import be.krachtbal.aantekenaar.ui.Num
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.SectionTitle
import be.krachtbal.aantekenaar.ui.SmallButton
import kotlinx.coroutines.launch

// ── Wie speelde ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Na de wedstrijd bevestigt de scheidsrechter wie effectief speelde (de O-markering op het blad). Dat komt bij elke
 * speler terecht en telt mee voor het vastspelen en het referendum. Voorgevuld met de selectie van de coach; wie al
 * bevestigd werd, blijft aangevinkt.
 */
@Composable
fun DeelnameScreen(matchId: Int, onBack: () -> Unit) {
    val model = remember(matchId) { HubModel(matchId, withRosters = true) }
    val ui by model.ui.collectAsState()
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(model) { model.reload() }

    val sheet = ui.sheet
    val alBevestigd = sheet != null && (sheet.home + sheet.away).any { it.deelgenomen }
    val finished = ui.state?.isFinished == true || sheet?.isForfait == true

    // De tafel hield bij wie er op het veld stond en welke wissels er waren: daaruit volgt wie speelde. Is het al bevestigd,
    // dan blijft die bevestiging staan; anders vullen we de berekening in en bevestigt de scheidsrechter met één tik.
    var berekend by remember { mutableStateOf<Sides<Set<Int>>?>(null) }
    LaunchedEffect(ui.sheet?.id, ui.state?.match?.status, alBevestigd) {
        if (finished && !alBevestigd && ui.sheet != null) berekend = Played.compute(ui)
    }
    fun begin(side: Side): Set<Int> {
        val rows = sheet?.lineup(side).orEmpty()
        return when {
            alBevestigd -> rows.filter { it.deelgenomen }.map { it.player }.toSet()
            berekend != null -> berekend!![side]
            else -> rows.map { it.player }.toSet()
        }
    }
    var home by remember(sheet?.home, berekend) { mutableStateOf(begin(Side.HOME)) }
    var away by remember(sheet?.away, berekend) { mutableStateOf(begin(Side.AWAY)) }

    FedScaffold(
        title = "Wie speelde?",
        subtitle = ui.state?.let { "${it.teams.home.name} – ${it.teams.away.name}" },
        onBack = onBack,
        onRefresh = { scope.launch { model.reload() } },
        bottom = if (sheet == null || sheet.ingediend) null else ({
            SmallButton(
                "Deelname bevestigen",
                enabled = !act.busy && finished,
                modifier = Modifier.fillMaxWidth(),
                onClick = { act.run(scope, { Graph.api.saveDeelname(matchId, home, away) }) { act.info = "Deelname bevestigd ✓"; model.reload() } },
            )
        }),
    ) {
        val st = ui.state
        when {
            st == null && ui.loading -> CenterText("Laden…")
            st == null || sheet == null -> Banner("Niet beschikbaar", ui.error ?: "Dit scherm is voor de scheidsrechter van deze wedstrijd of de federatie.", tint = Pal.Warn)
            else -> {
                if (!finished) Banner("Nog niet afgelopen", "Dit kan pas na het eindsignaal.", tint = Pal.Warn)
                if (sheet.ingediend) Banner("Ingediend", "Het blad is ingediend en onwijzigbaar.", tint = Pal.Ok)
                Feedback(act)
                Dim("Vink aan wie effectief deelnam. Dit komt bij elke speler te staan en telt mee voor het referendum.")
                if (!alBevestigd && berekend != null) {
                    Banner(
                        "Berekend uit de wissels",
                        "Wie op het einde op het veld stond of eruit gewisseld werd, speelde. Wie de hele wedstrijd op de bank zat, is niet aangevinkt. Klopt het? Dan volstaat één tik.",
                        tint = Pal.Accent,
                    )
                }
                for (side in listOf(Side.HOME, Side.AWAY)) {
                    val rows = sheet.lineup(side)
                    val chosen = if (side == Side.HOME) home else away
                    SectionTitle(st.teams[side].name)
                    if (rows.isEmpty()) Dim("Geen selectie.")
                    rows.forEach { r ->
                        val on = r.player in chosen
                        Card(
                            Modifier.fillMaxWidth(),
                            border = if (on) Pal.Ok.copy(alpha = 0.6f) else Pal.Line,
                            radius = 10.dp,
                            onClick = if (sheet.ingediend) null else ({
                                val next = if (on) chosen - r.player else chosen + r.player
                                if (side == Side.HOME) home = next else away = next
                                act.clear()
                            }),
                        ) {
                            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Tick(on)
                                Text(
                                    "${r.rugnummer?.let { "#$it  " } ?: ""}${ui.nameOf(side, r.player) ?: "speler ${r.player}"}",
                                    color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, style = Num,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── Aftekenen en indienen ────────────────────────────────────────────────────────────────────────────

/**
 * Na het eindsignaal tekenen beide kapiteins en de scheidsrechter af (docs/FEDERATIEFLOW.md §5, stap 5–7), met de
 * vinger op het scherm. Een handtekening is definitief. Staat de laatste nodige handtekening, dan dient het systeem
 * het blad zelf in; lukt dat nog niet, dan zegt de server wat er ontbreekt.
 */
@Composable
fun AftekenenScreen(matchId: Int, onBack: () -> Unit) {
    val model = remember(matchId) { HubModel(matchId, withRosters = true) }
    val ui by model.ui.collectAsState()
    val me by Graph.authRepo.me.collectAsState()
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    var signing by remember { mutableStateOf<Signer?>(null) }
    var showInjury by remember { mutableStateOf(false) }
    LaunchedEffect(model) { model.reload() }

    FedScaffold(
        title = "Aftekenen",
        subtitle = ui.state?.let { "${it.teams.home.name} – ${it.teams.away.name}" },
        onBack = onBack,
        onRefresh = { scope.launch { model.reload() } },
    ) {
        val st = ui.state
        val sheet = ui.sheet
        when {
            st == null && ui.loading -> CenterText("Laden…")
            st == null -> Banner("Laden mislukt", ui.error, tint = Pal.Bad)
            else -> {
                val forfait = sheet?.forfait ?: "geen"
                val afgelopen = st.isFinished || forfait != "geen"
                val nodig = buildList {
                    if (forfait != "thuis" && forfait != "dubbel") add(Signer.KAPITEIN_THUIS)
                    if (forfait != "uit" && forfait != "dubbel") add(Signer.KAPITEIN_UIT)
                    add(Signer.SCHEIDSRECHTER)
                }
                fun getekend(s: Signer): Signature? = when (s) {
                    Signer.KAPITEIN_THUIS -> sheet?.kapiteinThuis
                    Signer.KAPITEIN_UIT -> sheet?.kapiteinUit
                    Signer.SCHEIDSRECHTER -> sheet?.scheidsrechter
                }
                val alles = sheet != null && nodig.all { getekend(it)?.akkoord == true }

                Card(Modifier.fillMaxWidth(), radius = 14.dp) {
                    Column(Modifier.padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Eindstand", color = Pal.Dim, fontSize = 12.sp)
                        Text("${st.score.home} – ${st.score.away}", color = Pal.Text, fontWeight = FontWeight.Black, fontSize = 32.sp, style = Num)
                        Text("${st.teams.home.name} – ${st.teams.away.name}", color = Pal.Dim, fontSize = 13.sp)
                        if (forfait != "geen") Text("Forfait: ${when (forfait) { "thuis" -> st.teams.home.name; "uit" -> st.teams.away.name; else -> "beide ploegen" }}", color = Pal.Warn, fontSize = 13.sp)
                    }
                }
                ui.error?.let { Banner("Niet alles kon geladen worden", it, tint = Pal.Warn) }
                if (!afgelopen) Banner("Nog niet afgelopen", "Aftekenen kan na het eindsignaal.", tint = Pal.Warn)
                if (sheet?.ingediend == true) Banner("Blad ingediend ✓", "Het blad is naar de federatie en beide clubs gegaan en is onwijzigbaar.", tint = Pal.Ok)
                Feedback(act)

                // Wat vóór het indienen nog moet gebeuren (dezelfde controles als de server).
                if (sheet != null && !sheet.ingediend && afgelopen) {
                    val gespeeld = forfait != "geen" || listOf(sheet.home, sheet.away).all { l -> l.any { it.deelgenomen } }
                    val officials = Officials.validate(st.match.reeks, sheet.officials)
                    if (!gespeeld) {
                        Banner(
                            "Wie speelde is nog niet bevestigd",
                            "De scheidsrechter doet dat met één tik: het wordt berekend uit de veldspelers en wissels van de tafel. Zonder die bevestiging kan het blad niet ingediend worden.",
                            tint = Pal.Warn,
                        ) {
                            if (me.isReferee) {
                                SmallButton(
                                    "Bevestig wie speelde",
                                    enabled = !act.busy,
                                    onClick = {
                                        act.run(scope, {
                                            val p = Played.compute(ui)
                                            if (p == null) Act.Fail("Kon niet berekenen wie er speelde. Open “Wie speelde” en duid het aan.")
                                            else Graph.api.saveDeelname(matchId, p.home, p.away)
                                        }) { act.info = "Deelname bevestigd ✓"; model.reload() }
                                    },
                                )
                            }
                        }
                    }
                    if (officials.isNotEmpty()) Banner("Officials aanvullen", officials.first(), tint = Pal.Warn)
                }

                SectionTitle("Handtekeningen")
                nodig.forEach { who ->
                    SignCard(
                        who = who,
                        done = getekend(who),
                        open = signing == who,
                        enabled = afgelopen && sheet != null && sheet.ingediend.not() && !act.busy,
                        hint = hintFor(who, ui),
                        onOpen = { signing = if (signing == who) null else who; act.clear() },
                        onSign = { naam, dataUrl ->
                            act.run(scope, { Graph.api.sign(matchId, who, naam, dataUrl) }) { ok ->
                                signing = null
                                val ingediend = ok.bool("ingediend") == true
                                act.info = when {
                                    ingediend -> "Getekend — het blad is ingediend bij de federatie ✓"
                                    ok.text("nogTeDoen") != null -> "Getekend ✓ — nog te doen: ${ok.text("nogTeDoen")}"
                                    else -> "Getekend ✓"
                                }
                                model.reload()
                            }
                        },
                    )
                }

                if (sheet != null && !sheet.ingediend && alles && (me.isReferee)) {
                    SmallButton(
                        "Blad indienen",
                        enabled = !act.busy,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { act.run(scope, { Graph.api.submitSheet(matchId) }) { act.info = "Blad ingediend ✓"; model.reload() } },
                    )
                }

                if (sheet != null && !sheet.ingediend && afgelopen) {
                    SmallButton(
                        if (showInjury) "Blessure verbergen" else "🚑 Blessure doorgeven (vóór het aftekenen)",
                        kind = Btn.Default,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { showInjury = !showInjury },
                    )
                    if (showInjury) BlessureForm(matchId, ui) { model.reload() }
                }
            }
        }
    }
}

/** Welke naam de server invult als we niets typen: de kapitein uit de selectie, of de scheidsrechter van het blad. */
private fun hintFor(who: Signer, ui: HubModel.UI): String? {
    val st = ui.state ?: return null
    return when (who) {
        Signer.KAPITEIN_THUIS -> st.captain.home?.let { ui.nameOf(Side.HOME, it) }
        Signer.KAPITEIN_UIT -> st.captain.away?.let { ui.nameOf(Side.AWAY, it) }
        // De server zet de naam van de toegewezen scheidsrechter: voor de scheidsrechter zelf is dat zijn eigen naam; tekent
        // de federatie, dan weten we hier niet wie dat is en beloven we niets.
        Signer.SCHEIDSRECHTER -> Graph.authRepo.me.value.let { if (it.isReferee && !it.isFederatie) Graph.authRepo.userName else null }
    }
}

@Composable
private fun SignCard(
    who: Signer,
    done: Signature?,
    open: Boolean,
    enabled: Boolean,
    hint: String?,
    onOpen: () -> Unit,
    onSign: (naam: String?, dataUrl: String) -> Unit,
) {
    val signed = done?.akkoord == true
    val pad = remember(who) { SignaturePadState() }
    var naam by remember(who) { mutableStateOf("") }
    Card(Modifier.fillMaxWidth(), border = if (signed) Pal.Ok.copy(alpha = 0.6f) else if (open) Pal.Accent else Pal.Line, radius = 14.dp) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                Modifier.fillMaxWidth().then(if (!signed && enabled) Modifier.clickable(onClick = onOpen) else Modifier),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Tick(signed)
                Column(Modifier.weight(1f)) {
                    Text(who.label, color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text(
                        when {
                            signed -> "Getekend${done?.naam?.let { " door $it" }.orEmpty()}"
                            hint != null -> "Naam op het blad: $hint"
                            else -> "Nog niet getekend"
                        },
                        color = Pal.Dim, fontSize = 13.sp,
                    )
                }
                if (!signed && enabled) Text(if (open) "▾" else "Tekenen ›", color = Pal.Accent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            if (open && !signed) {
                FedField(naam, { naam = it }, "Naam (laat leeg om ${hint ?: "de naam van het blad"} te gebruiken)")
                SignaturePad(pad)
                Dim("Met je handtekening ga je akkoord met de eindstand en wat op het blad staat. Een handtekening is definitief.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallButton("Wissen", kind = Btn.Default, onClick = { pad.clear() })
                    SmallButton(
                        "Akkoord en tekenen",
                        enabled = pad.hasInk,
                        modifier = Modifier.weight(1f),
                        onClick = { pad.toDataUrl()?.let { onSign(naam.ifBlank { null }, it) } },
                    )
                }
            }
        }
    }
}
