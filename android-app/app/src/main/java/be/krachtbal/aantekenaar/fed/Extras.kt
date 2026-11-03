package be.krachtbal.aantekenaar.fed

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import be.krachtbal.aantekenaar.ui.Btn
import be.krachtbal.aantekenaar.ui.ConfirmDialog
import be.krachtbal.aantekenaar.ui.Dim
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.PillChip
import be.krachtbal.aantekenaar.ui.SmallButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// De drie dingen die op een wedstrijddag tussendoor kunnen gebeuren: de aftrap schuift op, iemand raakt gewond, of
// het terrein is onbespeelbaar. Elk is een klein formulier dat naar de bestaande route gaat (lib/aftrap.ts,
// lib/blessure.ts, lib/afgelasting.ts); de server bepaalt wie dat mag en wie er een melding van krijgt.

private val timeFmt = DateTimeFormatter.ofPattern("HH:mm", Locale.forLanguageTag("nl-BE"))

private fun hhmm(iso: String?): String? = try {
    Instant.parse(iso).atZone(ZoneId.systemDefault()).format(timeFmt)
} catch (_: Exception) {
    null
}

@Composable
fun Extras(matchId: Int, ui: HubModel.UI, reload: suspend () -> Unit) {
    val st = ui.state ?: return
    val scheduled = st.match.status == "scheduled" && !ui.cancelled
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (scheduled) {
            AftrapForm(matchId, st.match.date, reload)
            AfgelastenForm(matchId, reload)
        }
        BlessureForm(matchId, ui, reload)
    }
}

// ── Aftrap verschuiven ───────────────────────────────────────────────────────────────────────────────

private val AFTRAP_REDENEN = listOf(
    "file" to "File / onderweg",
    "ziekte" to "Ziekte",
    "uitloop" to "Vorige wedstrijd loopt uit",
    "vervroegen" to "Wedstrijd ervoor valt weg",
    "terrein" to "Terrein of materiaal niet klaar",
    "scheidsrechter" to "Scheidsrechter later",
    "ander" to "Andere reden",
)
private val AFTRAP_VERSCHUIVING = listOf(-30, -15, 15, 30, 45, 60)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AftrapForm(matchId: Int, aftrap: String?, reload: suspend () -> Unit) {
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    var reden by remember { mutableStateOf("file") }
    var minuten by remember { mutableStateOf(15) }
    var toelichting by remember { mutableStateOf("") }
    var volgende by remember { mutableStateOf(false) }
    val nu = hhmm(aftrap)
    val nieuw = runCatching { Instant.parse(aftrap).plusSeconds(minuten * 60L) }.getOrNull()

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("🕐 Aftrap verschuiven", color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Dim("Zelfde dag, hoogstens 4 uur. Beide clubs, de scheidsrechter en de spelers krijgen een melding.")
        if (nu != null) Dim("Nu: $nu${nieuw?.let { " → ${hhmm(it.toString())}" }.orEmpty()}")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AFTRAP_VERSCHUIVING.forEach { m -> PillChip(if (m > 0) "+$m min" else "$m min", minuten == m, { minuten = m }) }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AFTRAP_REDENEN.forEach { (k, l) -> PillChip(l, reden == k, { reden = k }) }
        }
        FedField(toelichting, { toelichting = it }, "Toelichting (optioneel)")
        Row(Modifier.fillMaxWidth().clickable { volgende = !volgende }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tick(volgende, size = 22)
            Text("De volgende wedstrijden op dit terrein schuiven mee", color = Pal.Dim, fontSize = 13.sp)
        }
        Feedback(act)
        SmallButton(
            "Aftrap verschuiven",
            enabled = !act.busy && nieuw != null,
            onClick = {
                act.run(scope, { Graph.api.aftrapVerschuiven(matchId, nieuw.toString(), reden, toelichting, volgende) }) {
                    act.info = "Aftrap verschoven naar ${hhmm(nieuw.toString())} ✓"
                    reload()
                }
            },
        )
    }
}

// ── Blessure ─────────────────────────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BlessureForm(matchId: Int, ui: HubModel.UI, reload: suspend () -> Unit) {
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    var side by remember { mutableStateOf(Side.HOME) }
    var player by remember { mutableStateOf<Int?>(null) }
    var tekst by remember { mutableStateOf("") }

    // De spelers die op het blad staan: uit het blad zelf, of voor een coach uit zijn eigen selectie.
    fun spelers(s: Side): List<Pair<Int, String>> {
        val ids = ui.sheet?.lineup(s)?.map { it.player } ?: ui.lineups[s]?.current?.map { it.first }.orEmpty()
        return ids.map { id -> id to (ui.nameOf(s, id) ?: "speler $id") }
    }
    val lijst = spelers(side)
    val teamNaam = { s: Side -> ui.state?.teams?.get(s)?.name ?: if (s == Side.HOME) "Thuis" else "Uit" }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("🚑 Blessure doorgeven", color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Dim("Wordt een ongevalsaangifte en een regel op het blad. De club, de speler (en zijn ouders) en de federatie krijgen een melding.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(Side.HOME, Side.AWAY).forEach { s -> PillChip(teamNaam(s), side == s, { side = s; player = null }) }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            lijst.forEach { (id, naam) -> PillChip(naam, player == id, { player = id }) }
        }
        if (lijst.isEmpty()) Dim("Nog geen selectie voor deze ploeg.")
        FedField(tekst, { tekst = it }, "Wat gebeurde er?", singleLine = false)
        Feedback(act)
        SmallButton(
            "Blessure doorgeven",
            enabled = !act.busy && player != null && tekst.isNotBlank(),
            onClick = {
                act.run(scope, { Graph.api.blessure(matchId, side, player, tekst) }) {
                    act.info = "Blessure doorgegeven ✓"
                    tekst = ""
                    player = null
                    reload()
                }
            },
        )
    }
}

// ── Afgelasten ───────────────────────────────────────────────────────────────────────────────────────

private val AFGELAST_REDENEN = listOf("terrein" to "Terrein onbespeelbaar", "weer" to "Weersomstandigheden", "ander" to "Andere reden")
private const val FOTO_MAX = 6

/** Leest een gekozen foto en verkleint ze (lange zijde ≤ 1600 px, JPEG): een telefoonfoto van 8 MB hoeft niet mee. */
private suspend fun leesFoto(ctx: Context, uri: Uri, nr: Int): Foto? = withContext(Dispatchers.IO) {
    try {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        var sample = 1
        while (maxOf(opts.outWidth, opts.outHeight) / sample > 3200) sample *= 2
        val bmp = ctx.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return@withContext null
        val scale = 1600f / maxOf(bmp.width, bmp.height)
        val out = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
        val bytes = ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
        Foto("afgelasting-$nr.jpg", "image/jpeg", bytes)
    } catch (_: Exception) {
        null
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AfgelastenForm(matchId: Int, reload: suspend () -> Unit) {
    val ctx = LocalContext.current
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var reden by remember { mutableStateOf("terrein") }
    var toelichting by remember { mutableStateOf("") }
    var fotos by remember { mutableStateOf<List<Foto>>(emptyList()) }
    var confirm by remember { mutableStateOf(false) }
    var reading by remember { mutableStateOf(false) }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        val gekozen = uris.take(FOTO_MAX - fotos.size)
        if (gekozen.isEmpty()) return@rememberLauncherForActivityResult
        reading = true
        scope.launch {
            val gelezen = gekozen.mapIndexedNotNull { i, u -> leesFoto(ctx, u, fotos.size + i + 1) }
            fotos = (fotos + gelezen).take(FOTO_MAX)
            if (gelezen.size < gekozen.size) act.error = "Een foto kon niet gelezen worden."
            reading = false
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("⛈️ Wedstrijd afgelasten", color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        if (!open) {
            Dim("Terrein of weer niet in orde? Gelast af met foto’s van de omstandigheden. De federatie plant een nieuwe datum.")
            SmallButton("Afgelasten…", kind = Btn.Danger, onClick = { open = true })
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AFGELAST_REDENEN.forEach { (k, l) -> PillChip(l, reden == k, { reden = k }) }
            }
            FedField(toelichting, { toelichting = it }, "Toelichting", singleLine = false)
            Dim(if (fotos.isEmpty()) "Voeg minstens één foto toe (max. $FOTO_MAX)." else "${fotos.size} foto${if (fotos.size == 1) "" else "’s"} gekozen.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallButton(if (reading) "Foto’s lezen…" else "Foto’s kiezen", kind = Btn.Default, enabled = !reading && fotos.size < FOTO_MAX, onClick = { pick.launch("image/*") })
                if (fotos.isNotEmpty()) SmallButton("Wissen", kind = Btn.Default, onClick = { fotos = emptyList() })
            }
            Feedback(act)
            SmallButton("Wedstrijd afgelasten", kind = Btn.Danger, enabled = !act.busy && !reading && fotos.isNotEmpty(), onClick = { confirm = true })
        }
    }
    if (confirm) {
        ConfirmDialog(
            title = "Wedstrijd afgelasten?",
            text = "De clubs en de federatie krijgen meteen bericht. De wedstrijd kan niet meer starten tot de federatie een nieuwe datum plant.",
            confirmLabel = "Ja, afgelasten",
            danger = true,
            onConfirm = {
                confirm = false
                act.run(scope, { Graph.api.afgelasten(matchId, reden, toelichting, fotos) }) {
                    act.info = "Afgelast. De federatie plant een nieuwe datum."
                    open = false
                    reload()
                }
            },
            onDismiss = { confirm = false },
        )
    }
}
