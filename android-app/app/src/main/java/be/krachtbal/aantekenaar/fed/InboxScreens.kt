package be.krachtbal.aantekenaar.fed

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.ui.Banner
import be.krachtbal.aantekenaar.ui.Btn
import be.krachtbal.aantekenaar.ui.Card
import be.krachtbal.aantekenaar.ui.CenterText
import be.krachtbal.aantekenaar.ui.Dim
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.SmallButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val opFmt = DateTimeFormatter.ofPattern("d MMM · HH:mm", Locale.forLanguageTag("nl-BE"))

private fun wanneer(iso: String?): String? = try {
    Instant.parse(iso).atZone(ZoneId.systemDefault()).format(opFmt)
} catch (_: Exception) {
    null
}

/** Een pagina van de website openen in de browser (een melding, het camerakader voor het attest). */
internal fun openWeb(ctx: Context, pad: String) {
    val url = if (pad.startsWith("http")) pad else Graph.api.auth.serverUrl.trimEnd('/') + "/" + pad.trimStart('/')
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        // geen browser: niets te doen
    }
}

// ── Meldingen ──────────────────────────────────────────────────────────────────────────────────────

/** Je meldingen, nieuwste eerst (zoals 🔔 op de website). Openen markeert ze als gelezen. */
@Composable
fun MeldingenScreen(onBack: () -> Unit, onGelezen: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var lijst by remember { mutableStateOf<List<Melding>?>(null) }
    var fout by remember { mutableStateOf<String?>(null) }
    val laad: suspend () -> Unit = {
        when (val r = Graph.api.meldingen()) {
            is Fetch.Ok -> { lijst = r.value; fout = null }
            is Fetch.Err -> fout = r.message
            Fetch.Forbidden -> fout = "Geen toegang."
        }
    }
    LaunchedEffect(Unit) { laad() }

    FedScaffold(title = "Meldingen", onBack = onBack, onRefresh = { scope.launch { laad() } }) {
        fout?.let { Banner("Laden mislukt", it, tint = Pal.Bad) }
        val l = lijst
        when {
            l == null && fout == null -> CenterText("Laden…")
            l != null && l.isEmpty() -> Dim("Geen meldingen. Hier komt wat de federatie, je club of het systeem je laat weten.")
            l != null -> {
                if (l.any { !it.gelezen }) {
                    SmallButton("Alles gelezen", kind = Btn.Default, onClick = {
                        scope.launch {
                            if (Graph.api.meldingenGelezen(null)) {
                                lijst = l.map { it.copy(gelezen = true) }
                                onGelezen()
                            }
                        }
                    })
                }
                l.forEach { m ->
                    Card(
                        Modifier.fillMaxWidth(),
                        border = if (m.gelezen) Pal.Line else Pal.Accent.copy(alpha = 0.6f),
                        radius = 12.dp,
                        onClick = {
                            scope.launch {
                                if (!m.gelezen && Graph.api.meldingenGelezen(listOf(m.id))) {
                                    lijst = lijst?.map { if (it.id == m.id) it.copy(gelezen = true) else it }
                                    onGelezen()
                                }
                            }
                            m.url?.let { openWeb(ctx, it) }
                        },
                    ) {
                        Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.padding(top = 6.dp).size(8.dp).clip(CircleShape).background(if (m.gelezen) Color.Transparent else Pal.Accent))
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(m.titel, color = Pal.Text, fontWeight = if (m.gelezen) FontWeight.Medium else FontWeight.Bold, fontSize = 15.sp)
                                m.tekst?.let { Text(it, color = Pal.Dim, fontSize = 13.sp, lineHeight = 17.sp) }
                                Text(listOfNotNull(wanneer(m.op), m.url?.let { "openen ›" }).joinToString(" · "), color = Pal.Dim, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── Medisch attest bezorgen ─────────────────────────────────────────────────────────────────────────

/** Leest een gekozen bestand: een foto wordt verkleind (QR en hoeken blijven scherp), een PDF gaat zoals ze is. */
private suspend fun leesAttest(ctx: Context, uri: Uri): Foto? {
    val mime = ctx.contentResolver.getType(uri).orEmpty()
    if (mime == "application/pdf") {
        return withContext(Dispatchers.IO) {
            try {
                val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@withContext null
                if (bytes.size > 8 * 1024 * 1024) null else Foto("attest.pdf", "application/pdf", bytes)
            } catch (_: Exception) {
                null
            }
        }
    }
    return leesFoto(ctx, uri, 1, prefix = "attest", maxZijde = 2400)
}

/**
 * Het medisch attest bezorgen: een foto nemen of een foto/scan kiezen, en meteen zien hoe het zit — goedgekeurd,
 * ontvangen (de federatie kijkt het na) of niet gelukt, met wat je kan doen. Zelfde regels als de website
 * (src/lib/attest.ts); de server leest de QR en de vakjes.
 */
@Composable
fun AttestScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var foto by remember { mutableStateOf<Foto?>(null) }
    var bezig by remember { mutableStateOf(false) }
    var uitkomst by remember { mutableStateOf<AttestUitkomst?>(null) }
    var naam by remember { mutableStateOf("") }
    var geboren by remember { mutableStateOf("") }
    var club by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }

    val stuur: (Foto, AttestGegevens?) -> Unit = { f, g ->
        bezig = true
        uitkomst = null
        scope.launch {
            uitkomst = Graph.api.attestBezorgen(f, kaartCodeUit(code) ?: code.trim().takeIf { it.isNotEmpty() }, g)
            bezig = false
        }
    }
    val gekozen: (Uri?) -> Unit = { uri ->
        if (uri != null) {
            bezig = true
            scope.launch {
                val f = leesAttest(ctx, uri)
                if (f == null) {
                    bezig = false
                    uitkomst = AttestUitkomst.Fout("Dat bestand kon niet gelezen worden (of is groter dan 8 MB). Kies een foto (JPG, PNG) of een PDF.")
                } else {
                    foto = f
                    stuur(f, null)
                }
            }
        }
    }
    val camera = rememberCamera { gekozen(it) }
    val kies = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { gekozen(it) }
    val opnieuw = { uitkomst = null; foto = null }

    FedScaffold(title = "Medisch attest", subtitle = "Bezorgen — de QR-code op het attest zegt van wie het is.", onBack = onBack) {
        val u = uitkomst
        when {
            bezig -> Card(Modifier.fillMaxWidth(), radius = 16.dp) {
                Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Het attest wordt gelezen…", color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Dim("QR-code zoeken, het blad rechtzetten, de vakjes van de arts lezen.")
                }
            }
            u is AttestUitkomst.Ontvangen && u.goedgekeurd -> Uitkomst(
                kleur = Pal.Ok,
                teken = "✓",
                titel = "Goedgekeurd",
                tekst = "Het medisch attest van ${u.naam} is in orde${u.seizoen?.let { " voor het seizoen $it" } ?: ""}. Alles stond juist: de QR-code, de hoeken en het vakje \"geschikt\".",
                extra = u.meldingen + "De club en het lid (of de ouders) zien het meteen. Bewaar het papieren attest.",
                knop = "Nog een attest bezorgen",
                onKnop = opnieuw,
            )
            u is AttestUitkomst.Ontvangen -> Uitkomst(
                kleur = Pal.Warn,
                teken = "✉",
                titel = "Goed ontvangen",
                tekst = "Het attest${if (u.naam.isNotBlank()) " van ${u.naam}" else ""} is bij de federatie. Het kon niet vanzelf goedgekeurd worden, dus een mens kijkt het na.",
                extra = listOfNotNull(u.reden) + u.meldingen + "Je hoeft niets meer te doen.",
                knop = "Nog een attest bezorgen",
                onKnop = opnieuw,
            )
            u is AttestUitkomst.Fout -> Uitkomst(
                kleur = Pal.Bad,
                teken = "✕",
                titel = "Niet gelukt",
                tekst = u.tekst,
                extra = listOf(
                    "Het héle blad in beeld: de vier zwarte hoeken en de QR-code.",
                    "Leg het blad plat en houd de gsm er recht boven, met genoeg licht.",
                    "Lukt het niet met een foto? Een scan (PDF) leest het best.",
                ),
                knop = "Opnieuw proberen",
                onKnop = opnieuw,
            )
            u is AttestUitkomst.Gegevens && foto != null -> {
                Banner(
                    if (u.blanco) "Dit is een blanco attest" else "Geen QR-code van een lid gevonden",
                    "Van wie is dit attest? De federatie zoekt het lid op en kijkt het attest na.",
                    tint = Pal.Accent,
                )
                FedField(naam, { naam = it }, "Naam en voornaam van het lid *")
                FedField(geboren, { geboren = it }, "Geboortedatum * (dd/mm/jjjj)")
                FedField(club, { club = it }, "Club")
                FedField(email, { email = it }, "Je e-mailadres (optioneel: dan hoor je de beslissing)")
                val iso = geboortedatumIso(geboren)
                if (geboren.isNotBlank() && iso == null) Text("Schrijf de datum als dd/mm/jjjj, bv. 12/03/2011.", color = Pal.Warn, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallButton(
                        "Attest versturen",
                        enabled = naam.trim().length >= 3 && iso != null,
                        onClick = { stuur(foto!!, AttestGegevens(naam, iso!!, club, email)) },
                    )
                    SmallButton("Andere foto", kind = Btn.Default, onClick = opnieuw)
                }
            }
            else -> {
                Keuze("📷", "Foto nemen", "Leg het attest plat op een donkere ondergrond, met genoeg licht, en neem het héle blad: de vier zwarte hoeken en de QR-code.", hoofd = true) { camera() }
                Keuze("📁", "Foto of scan kiezen", "Een scan (PDF), een foto, of een beeld dat je via WhatsApp kreeg.") { kies.launch(arrayOf("image/*", "application/pdf")) }
                Keuze("🌐", "Camera met kader (website)", "Opent de pagina op de website: de camera toont een kader in de vorm van het attest en neemt zelf de foto.") { openWeb(ctx, "/attest") }
                FedField(code, { code = it }, "Code van het lid (optioneel, onder de QR)")
                Dim("Zonder code leest het systeem de QR op de foto. Alles juist (QR, vier hoeken, \"geschikt\" aangekruist) → meteen goedgekeurd; anders kijkt de federatie het na.")
            }
        }
    }
}

/** "12/03/2011", "12-3-2011" of "2011-03-12" → "2011-03-12"; anders null. */
fun geboortedatumIso(t: String): String? {
    val s = t.trim()
    Regex("""^(\d{4})-(\d{2})-(\d{2})$""").matchEntire(s)?.let { return runCatching { java.time.LocalDate.parse(s).toString() }.getOrNull() }
    val m = Regex("""^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$""").matchEntire(s) ?: return null
    val (d, mnd, j) = m.destructured
    return runCatching { java.time.LocalDate.of(j.toInt(), mnd.toInt(), d.toInt()).toString() }.getOrNull()
}

@Composable
private fun Keuze(icoon: String, titel: String, uitleg: String, hoofd: Boolean = false, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth(), border = if (hoofd) Pal.Accent.copy(alpha = 0.7f) else Pal.Line, radius = 16.dp, onClick = onClick) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(icoon, fontSize = 30.sp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(titel, color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(uitleg, color = Pal.Dim, fontSize = 13.sp, lineHeight = 17.sp)
            }
        }
    }
}

@Composable
private fun Uitkomst(kleur: Color, teken: String, titel: String, tekst: String, extra: List<String>, knop: String, onKnop: () -> Unit) {
    Card(Modifier.fillMaxWidth(), border = kleur, radius = 18.dp) {
        Column(
            Modifier.fillMaxWidth().background(kleur.copy(alpha = 0.10f)).padding(horizontal = 18.dp, vertical = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.size(72.dp).clip(CircleShape).background(kleur), contentAlignment = Alignment.Center) {
                Text(teken, color = Color.White, fontSize = 36.sp, fontWeight = FontWeight.ExtraBold)
            }
            Text(titel, color = Pal.Text, fontSize = 24.sp, fontWeight = FontWeight.Black)
            Text(tekst, color = Pal.Text, fontSize = 15.sp, lineHeight = 21.sp, textAlign = TextAlign.Center)
            extra.forEach { Text(it, color = Pal.Dim, fontSize = 13.sp, lineHeight = 18.sp, textAlign = TextAlign.Center) }
            SmallButton(knop, kind = Btn.Default, onClick = onKnop)
        }
    }
}

// ── Het wedstrijdblad als PDF ───────────────────────────────────────────────────────────────────────

/** Een knop die het blad (PDF) downloadt en opent in de PDF-lezer van het toestel. */
@Composable
fun BladPdfKnop(matchId: Int) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var bezig by remember { mutableStateOf(false) }
    var fout by remember { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("📄 Wedstrijdblad", color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        SmallButton(if (bezig) "Laden…" else "Blad openen (PDF)", kind = Btn.Default, enabled = !bezig, onClick = {
            bezig = true
            fout = null
            scope.launch {
                fout = when (val r = Graph.api.bladPdf(matchId)) {
                    is Download.Ok -> openPdf(ctx, r.bytes, "wedstrijdblad-$matchId.pdf")
                    is Download.Fail -> r.message
                }
                bezig = false
            }
        })
        fout?.let { Text(it, color = Pal.Bad, fontSize = 12.sp) }
    }
}
