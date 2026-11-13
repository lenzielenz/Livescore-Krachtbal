package be.krachtbal.aantekenaar.fed

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.ui.Banner
import be.krachtbal.aantekenaar.ui.Btn
import be.krachtbal.aantekenaar.ui.Card
import be.krachtbal.aantekenaar.ui.ConfirmDialog
import be.krachtbal.aantekenaar.ui.Dim
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.PillChip
import be.krachtbal.aantekenaar.ui.SmallButton
import kotlinx.coroutines.launch

// Wat er op het blad mis kan lopen (RCVK items 25, 27, 34): voorbehoud en uitsluiting noteren, "zie
// scheidsrechtersrapport", forfait ter plaatse, en het rapport zelf met foto's. Elk gaat naar de route die de website
// ook gebruikt (/api/matchsheet/{id}/referee, /api/sr-rapport); de server bewaakt het moment (vóór de handtekening van
// de scheidsrechter) en wie het mag.

/** Kan de scheidsrechter het blad nog aanvullen? Na zijn handtekening of het indienen niet meer (item 37). */
internal fun SheetView.nogAanvulbaar(): Boolean = !ingediend && !scheidsrechter.akkoord

/** De stand zoals de app ze voorstelt bij een voorbehoud of uitsluiting ("12-9"); de scheidsrechter past aan. */
internal fun standVoorstel(ui: HubModel.UI): String = ui.state?.let { "${it.score.home}-${it.score.away}" }.orEmpty()

/** Eén regel tekst voor een voorbehoud of uitsluiting in de lijst. */
internal fun BladRij.samenvatting(onderwerpen: List<Pair<String, String>> = VOORBEHOUD_ONDERWERPEN): String =
    listOfNotNull(
        onderwerp?.let { o -> onderwerpen.firstOrNull { it.first == o }?.second ?: o },
        reden.takeIf { it.isNotBlank() },
        score?.let { "stand $it" },
        speeltijd?.let { "speeltijd $it" },
        naam?.let { "· $it" },
    ).joinToString(" — ")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VoorbehoudBody(matchId: Int, ui: HubModel.UI, reload: suspend () -> Unit) {
    val sheet = ui.sheet ?: return
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    val open = sheet.nogAanvulbaar()
    var soort by remember { mutableStateOf("voorbehoud") }
    var side by remember { mutableStateOf(Side.HOME) }
    var naam by remember { mutableStateOf("") }
    var playerId by remember { mutableStateOf<Int?>(null) }
    var onderwerp by remember { mutableStateOf<String?>(null) }
    var reden by remember { mutableStateOf("") }
    var score by remember { mutableStateOf(standVoorstel(ui)) }
    var speeltijd by remember { mutableStateOf("") }
    var schrap by remember { mutableStateOf<Pair<Boolean, Int>?>(null) }
    val teamNaam = { s: Side -> ui.state?.teams?.get(s)?.name ?: if (s == Side.HOME) "Thuis" else "Uit" }

    Feedback(act)
    Dim("Een voorbehoud vraagt de kapitein (U12–U16 de coach) vóór, tijdens of na de wedstrijd; een uitsluiting beslis jij. Noteer kort de feiten, de stand en de speeltijd. Na je handtekening kan het niet meer.")

    // Wat er al op het blad staat, met schrappen voor een verkeerd genoteerde regel.
    listOf(true to sheet.voorbehoud, false to sheet.uitsluitingen).forEach { (isVoorbehoud, rijen) ->
        rijen.forEachIndexed { i, r ->
            Card(Modifier.fillMaxWidth(), border = if (isVoorbehoud) Pal.Warn.copy(alpha = 0.6f) else Pal.Bad.copy(alpha = 0.6f), radius = 10.dp) {
                Row(Modifier.padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        val wie = r.player?.let { id -> ui.lineups.home?.players?.firstOrNull { it.id == id }?.name ?: ui.lineups.away?.players?.firstOrNull { it.id == id }?.name }
                        Text(
                            "${if (isVoorbehoud) "Voorbehoud" else "Uitsluiting"} · ${if (r.side == "uit") teamNaam(Side.AWAY) else teamNaam(Side.HOME)}${wie?.let { " · $it" } ?: ""}",
                            color = Pal.Text,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                        )
                        Text(r.samenvatting(), color = Pal.Dim, fontSize = 12.sp, lineHeight = 16.sp)
                    }
                    if (open) SmallButton("Schrappen", kind = Btn.Default, enabled = !act.busy, onClick = { schrap = isVoorbehoud to i })
                }
            }
        }
    }
    if (sheet.voorbehoud.isEmpty() && sheet.uitsluitingen.isEmpty()) Dim("Nog niets genoteerd.")

    if (!open) {
        Banner("Afgesloten", "Je tekende af (of het blad is ingediend): daarna verandert er niets meer.", tint = Pal.Accent)
        return
    }

    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PillChip("Voorbehoud", soort == "voorbehoud", { soort = "voorbehoud" })
        PillChip("Uitsluiting", soort == "uitsluiting", { soort = "uitsluiting"; playerId = null })
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(Side.HOME, Side.AWAY).forEach { s -> PillChip(teamNaam(s), side == s, { side = s; playerId = null }) }
    }
    if (soort == "voorbehoud") {
        FedField(naam, { naam = it }, "Gevraagd door (kapitein; U12–U16 de coach)")
        Text("Waarover? (bepaalt het comité)", color = Pal.Dim, fontSize = 12.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            VOORBEHOUD_ONDERWERPEN.forEach { (k, l) -> PillChip(l, onderwerp == k, { onderwerp = k }) }
        }
    } else {
        val spelers = (if (side == Side.HOME) ui.lineups.home else ui.lineups.away)?.players.orEmpty()
            .filter { p -> sheet.lineup(side).any { it.player == p.id } }
        if (spelers.isNotEmpty()) {
            Text("Welke speler?", color = Pal.Dim, fontSize = 12.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                spelers.forEach { p -> PillChip(p.name, playerId == p.id, { playerId = if (playerId == p.id) null else p.id }) }
            }
        }
        FedField(naam, { naam = it }, if (spelers.isEmpty()) "Naam van de speler" else "Of een naam (niet op de lijst)")
    }
    FedField(reden, { reden = it }, if (soort == "voorbehoud") "De feiten, kort" else "Reden van de uitsluiting", singleLine = false)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FedField(score, { score = it }, "Stand", Modifier.weight(1f))
        FedField(speeltijd, { speeltijd = it }, "Speeltijd (bv. 2e helft 12')", Modifier.weight(1f))
    }
    val klaar = reden.trim().length >= 5 &&
        (if (soort == "voorbehoud") naam.trim().length >= 2 && onderwerp != null else playerId != null || naam.trim().length >= 2)
    // Zeg wat er nog ontbreekt: een grijze knop zonder uitleg laat de scheidsrechter raden.
    val ontbreekt = buildList {
        if (soort == "voorbehoud") {
            if (naam.trim().length < 2) add("wie het vraagt")
            if (onderwerp == null) add("waarover")
        } else if (playerId == null && naam.trim().length < 2) add("welke speler")
        if (reden.trim().length < 5) add(if (soort == "voorbehoud") "de feiten" else "de reden")
    }
    if (ontbreekt.isNotEmpty()) Dim("Nog in te vullen: ${ontbreekt.joinToString(", ")}.")
    SmallButton(
        if (soort == "voorbehoud") "Voorbehoud noteren" else "Uitsluiting noteren",
        kind = if (soort == "voorbehoud") Btn.Default else Btn.Danger,
        enabled = klaar && !act.busy,
        onClick = {
            act.run(scope, {
                if (soort == "voorbehoud") Graph.api.voorbehoud(matchId, side, naam, onderwerp!!, reden, score, speeltijd)
                else Graph.api.uitsluiting(matchId, side, playerId, naam, reden, score, speeltijd)
            }) {
                act.info = if (soort == "voorbehoud") "Voorbehoud genoteerd. Vergeet het scheidsrechtersrapport niet." else "Uitsluiting genoteerd. Vergeet het scheidsrechtersrapport niet."
                naam = ""; reden = ""; playerId = null; onderwerp = null; speeltijd = ""
                reload()
            }
        },
    )

    schrap?.let { (isVoorbehoud, i) ->
        ConfirmDialog(
            title = "Regel schrappen?",
            text = "Enkel een verkeerd genoteerde regel schrap je. Een voorbehoud dat de kapitein echt vroeg, blijft staan.",
            confirmLabel = "Schrappen",
            danger = true,
            onConfirm = {
                schrap = null
                act.run(scope, { Graph.api.blokSchrappen(matchId, isVoorbehoud, i) }) { act.info = "Geschrapt."; reload() }
            },
            onDismiss = { schrap = null },
        )
    }
}

/** "Zie scheidsrechtersrapport" (item 27): een schakelaar, zolang de scheidsrechter niet aftekende. */
@Composable
fun RapportVolgtRow(matchId: Int, sheet: SheetView, reload: suspend () -> Unit) {
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    val open = sheet.nogAanvulbaar()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text("Zie scheidsrechtersrapport", color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text("Er volgt een rapport over een andere onregelmatigheid; dit komt op het blad.", color = Pal.Dim, fontSize = 12.sp)
        }
        PillChip(
            if (sheet.rapportVolgt) "Aan" else "Uit",
            selected = sheet.rapportVolgt,
            onClick = { if (open) act.run(scope, { Graph.api.rapportVolgt(matchId, !sheet.rapportVolgt) }) { reload() } },
        )
    }
    Feedback(act)
}

private val FORFAIT_OPTIES = listOf("geen" to "Geen forfait", "thuis" to "Thuis geeft forfait", "uit" to "Uit geeft forfait", "dubbel" to "Dubbel forfait")

/** Wat er gebeurt als dit forfait bevestigd wordt (de server zet 30–0 of 0–0). */
internal fun forfaitUitleg(uitslag: String, thuis: String, uit: String): String = when (uitslag) {
    "thuis" -> "$thuis geeft forfait: $uit wint met 30–0."
    "uit" -> "$uit geeft forfait: $thuis wint met 30–0."
    "dubbel" -> "Beide ploegen geven forfait: 0–0, niemand krijgt punten."
    else -> "Het forfait wordt teruggedraaid."
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ForfaitBody(matchId: Int, ui: HubModel.UI, reload: suspend () -> Unit) {
    val sheet = ui.sheet ?: return
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    var keuze by remember(sheet.forfait) { mutableStateOf(sheet.forfait) }
    var bevestig by remember { mutableStateOf(false) }
    val thuis = ui.state?.teams?.home?.name ?: "Thuis"
    val uit = ui.state?.teams?.away?.name ?: "Uit"
    Feedback(act)
    Dim("Daagt een ploeg niet (volledig) op? Stel het forfait ter plaatse vast. De score wordt meteen gezet, de boete volgt het reglement (item 34). Vergeet het scheidsrechtersrapport niet.")
    if (sheet.ingediend) {
        Banner("Ingediend", "Het blad is ingediend: een forfait wijzigt nu enkel de federatie.", tint = Pal.Accent)
        return
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FORFAIT_OPTIES.forEach { (k, l) ->
            PillChip(
                when (k) {
                    "thuis" -> "$thuis geeft forfait"
                    "uit" -> "$uit geeft forfait"
                    else -> l
                },
                keuze == k,
                { keuze = k },
            )
        }
    }
    SmallButton(
        if (keuze == "geen") "Forfait terugdraaien" else "Forfait vaststellen",
        kind = if (keuze == "geen") Btn.Default else Btn.Danger,
        enabled = keuze != sheet.forfait && !act.busy,
        onClick = { bevestig = true },
    )
    if (bevestig) {
        ConfirmDialog(
            title = if (keuze == "geen") "Forfait terugdraaien?" else "Forfait vaststellen?",
            text = forfaitUitleg(keuze, thuis, uit) + " Beide clubs en de federatie krijgen bericht.",
            confirmLabel = if (keuze == "geen") "Terugdraaien" else "Ja, forfait",
            danger = keuze != "geen",
            onConfirm = {
                bevestig = false
                act.run(scope, { Graph.api.forfait(matchId, keuze) }) { act.info = if (keuze == "geen") "Forfait teruggedraaid." else "Forfait vastgesteld."; reload() }
            },
            onDismiss = { bevestig = false },
        )
    }
}

/** Welke aanleidingen het blad al aangeeft (voorbehoud, uitsluiting, forfait): die staan bij het rapport al aangevinkt. */
internal fun voorgesteldeAanleidingen(sheet: SheetView): Set<String> = buildSet {
    if (sheet.voorbehoud.isNotEmpty()) add("voorbehoud")
    if (sheet.uitsluitingen.isNotEmpty()) add("uitsluiting")
    if (sheet.isForfait) add("niet_gespeeld")
}

private val RAPPORT_STATUS = mapOf("ingediend" to "ingediend", "behandeld" to "behandeld", "in_behandeling" to "in behandeling")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RapportBody(matchId: Int, ui: HubModel.UI) {
    val sheet = ui.sheet ?: return
    val ctx = LocalContext.current
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    var aanleidingen by remember(sheet.id) { mutableStateOf(voorgesteldeAanleidingen(sheet)) }
    var relaas by remember { mutableStateOf("") }
    var naam by remember { mutableStateOf(Graph.authRepo.userName.orEmpty()) }
    var fotos by remember { mutableStateOf<List<Foto>>(emptyList()) }
    var lezen by remember { mutableStateOf(false) }
    var bevestig by remember { mutableStateOf(false) }
    var eerder by remember { mutableStateOf<List<RapportKort>>(emptyList()) }
    LaunchedEffect(matchId) { eerder = Graph.api.fetchRapporten(matchId) }

    val voegToe: (List<Uri>) -> Unit = { uris ->
        val gekozen = uris.take(RAPPORT_MAX_BIJLAGEN - fotos.size)
        if (gekozen.isNotEmpty()) {
            lezen = true
            scope.launch {
                val gelezen = gekozen.mapIndexedNotNull { i, u -> leesFoto(ctx, u, fotos.size + i + 1, prefix = "rapport") }
                fotos = (fotos + gelezen).take(RAPPORT_MAX_BIJLAGEN)
                if (gelezen.size < gekozen.size) act.error = "Een foto kon niet gelezen worden."
                lezen = false
            }
        }
    }
    val kies = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { voegToe(it) }
    val camera = rememberCamera { uri -> voegToe(listOf(uri)) }

    eerder.forEach { r ->
        Card(Modifier.fillMaxWidth(), border = Pal.Ok.copy(alpha = 0.5f), radius = 10.dp) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 9.dp)) {
                Text("Rapport ${RAPPORT_STATUS[r.status] ?: r.status}", color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Text(
                    r.aanleidingen.joinToString(", ") { a -> RAPPORT_AANLEIDINGEN.firstOrNull { it.first == a }?.second ?: a },
                    color = Pal.Dim,
                    fontSize = 12.sp,
                )
            }
        }
    }
    Feedback(act)
    Dim("Verplicht bij een voorbehoud, een uitsluiting of een forfait ter plaatse (item 27). Het rapport gaat naar het bevoegde comité; de clubs zien het niet.")
    Text("Waarover?", color = Pal.Dim, fontSize = 12.sp)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        RAPPORT_AANLEIDINGEN.forEach { (k, l) ->
            PillChip(l, k in aanleidingen, { aanleidingen = if (k in aanleidingen) aanleidingen - k else aanleidingen + k })
        }
    }
    FedField(relaas, { relaas = it }, "Relaas: wat gebeurde er, wanneer, wie", singleLine = false)
    val tekort = RAPPORT_MIN_TEKENS - relaas.trim().length
    if (tekort > 0) Dim("Nog minstens $tekort teken${if (tekort == 1) "" else "s"}.")
    Dim(if (fotos.isEmpty()) "Foto's als bijlage (optioneel, max. $RAPPORT_MAX_BIJLAGEN)." else "${fotos.size} foto${if (fotos.size == 1) "" else "'s"} als bijlage.")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SmallButton("📷 Foto nemen", kind = Btn.Default, enabled = !lezen && fotos.size < RAPPORT_MAX_BIJLAGEN, onClick = { camera() })
        SmallButton(if (lezen) "Lezen…" else "Kiezen", kind = Btn.Default, enabled = !lezen && fotos.size < RAPPORT_MAX_BIJLAGEN, onClick = { kies.launch("image/*") })
        if (fotos.isNotEmpty()) SmallButton("Wissen", kind = Btn.Default, onClick = { fotos = emptyList() })
    }
    FedField(naam, { naam = it }, "Ondertekend door (naam en voornaam)")
    SmallButton(
        "Rapport indienen",
        enabled = aanleidingen.isNotEmpty() && tekort <= 0 && naam.trim().length >= 3 && !lezen && !act.busy,
        onClick = { bevestig = true },
    )
    if (bevestig) {
        ConfirmDialog(
            title = "Rapport indienen?",
            text = "Je ondertekent als ${naam.trim()}. Daarna wijzig je het niet meer; een aanvulling is een nieuw rapport.",
            confirmLabel = "Ondertekenen en indienen",
            onConfirm = {
                bevestig = false
                act.run(scope, { Graph.api.srRapport(matchId, aanleidingen, relaas, naam, fotos) }) {
                    act.info = "Rapport ingediend ✓"
                    relaas = ""
                    fotos = emptyList()
                    eerder = Graph.api.fetchRapporten(matchId)
                }
            },
            onDismiss = { bevestig = false },
        )
    }
}
