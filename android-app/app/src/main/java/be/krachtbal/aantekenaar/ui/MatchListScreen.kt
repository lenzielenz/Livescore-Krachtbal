package be.krachtbal.aantekenaar.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import be.krachtbal.aantekenaar.data.ClubDirectory
import be.krachtbal.aantekenaar.data.ClubLook
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.ListLogic
import be.krachtbal.aantekenaar.data.ListMode
import be.krachtbal.aantekenaar.data.ListSort
import be.krachtbal.aantekenaar.data.MatchListModel
import be.krachtbal.aantekenaar.data.MatchRow
import be.krachtbal.aantekenaar.data.Reeksen
import be.krachtbal.aantekenaar.data.RowView
import be.krachtbal.aantekenaar.data.Time
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val timeFmt = DateTimeFormatter.ofPattern("HH:mm", Locale.forLanguageTag("nl-BE"))

/** Amber van de "Mijn club"-snelfilter (`.lb-reeks.fav.on`). */
private val Amber = Color(0xFFFFD873)

private fun rowTime(r: MatchRow): String = try {
    Instant.parse(r.dateIso).atZone(ZoneId.systemDefault()).format(timeFmt)
} catch (_: Exception) {
    "--:--"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MatchListScreen(
    onOpen: (Int) -> Unit,
    onSettings: () -> Unit,
    /** Federatie-app: de meldingen (🔔 met het aantal ongelezen) en het medisch attest bezorgen. */
    onMeldingen: (() -> Unit)? = null,
    onAttest: (() -> Unit)? = null,
    ongelezen: Int = 0,
) {
    val model = remember { MatchListModel() }
    val st by model.state.collectAsState()
    val attention by Graph.attention.collectAsState()
    val clubs by ClubDirectory.clubs.collectAsState()
    val myClub by Graph.authRepo.clubId.collectAsState()
    var menu by remember { mutableStateOf(false) }
    var sheet by remember { mutableStateOf(false) }
    val ctx = LocalContext.current

    LaunchedEffect(Unit) {
        model.reload()
        ClubDirectory.ensureLoaded()
        Graph.authRepo.refreshProfile() // de club van het account: nodig voor Thuis/Uit en Mijn club
    }

    // De live-standen volgen enkel zolang de lijst zichtbaar is: op de achtergrond (scherm uit, andere app) sluit de
    // verbinding. Bij terugkomst (ON_START) opent ze weer en komt de huidige stand meteen mee.
    val owner = ctx.findActivity() as? LifecycleOwner
    DisposableEffect(owner, model) {
        val observer = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> model.startLive()
                Lifecycle.Event.ON_STOP -> model.stopLive()
                else -> Unit
            }
        }
        owner?.lifecycle?.addObserver(observer)
        onDispose {
            owner?.lifecycle?.removeObserver(observer)
            model.stopLive()
        }
    }

    val zone = remember { ZoneId.systemDefault() }
    val view = remember(st.rows, st.seasonRows, st.filters, st.sort, st.mode, myClub, clubs) {
        ListLogic.view(
            rows = st.rows,
            seasonRows = st.seasonRows,
            f = st.filters,
            sortChoice = st.sort,
            myClub = myClub,
            clubName = { id -> id?.let { clubs[it]?.name } },
            zone = zone,
            today = LocalDate.now(zone),
            newestFirst = st.mode == ListMode.FINISHED,
        )
    }
    val f = view.filters

    AuroraBackdrop {
        Column(Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Title("Kies een wedstrijd")
                    Dim(Graph.authRepo.userName?.let { "Ingelogd als $it" } ?: (Graph.authRepo.email ?: ""))
                }
                if (onMeldingen != null) {
                    TextButton(onClick = onMeldingen) {
                        Text(if (ongelezen > 0) "🔔 $ongelezen" else "🔔", color = if (ongelezen > 0) Pal.Accent else Pal.Dim, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                }
                TextButton(onClick = { model.reload() }) { Text("↻", color = Pal.Accent, fontSize = 22.sp) }
                Column {
                    TextButton(onClick = { menu = true }) { Text("⋮", color = Pal.Text, fontSize = 22.sp) }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (onAttest != null) DropdownMenuItem(text = { Text("🩺 Medisch attest bezorgen") }, onClick = { menu = false; onAttest() })
                        if (onMeldingen != null) DropdownMenuItem(text = { Text("🔔 Meldingen") }, onClick = { menu = false; onMeldingen() })
                        DropdownMenuItem(text = { Text("⚙ Instellingen") }, onClick = { menu = false; onSettings() })
                        DropdownMenuItem(text = { Text("Uitloggen") }, onClick = { menu = false; Graph.authRepo.logout() })
                    }
                }
            }

            // Alles onder de titel scrolt mee met de lijst: op een liggend toestel blijft er zo ruimte voor de wedstrijden.
            LazyColumn(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(top = 4.dp, bottom = 16.dp),
            ) {
                if (attention.isNotEmpty()) {
                    item(key = "attention") {
                        Banner(
                            title = "Niet-verzonden acties",
                            text = "Voor ${attention.size} wedstrijd${if (attention.size == 1) "" else "en"} wachten er nog tikken op verzending. Open de wedstrijd om ze te controleren.",
                        ) {
                            for (id in attention.take(3)) TextButton(onClick = { onOpen(id) }) { Text("Open #$id", color = Pal.Warn) }
                        }
                    }
                }

                // Selectie zoals op de site: pillen, geselecteerd = vol ijsblauw.
                item(key = "tabs") {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        val chips = listOf(
                            ListMode.LIVE to "● Live",
                            ListMode.TODAY to "Vandaag",
                            ListMode.UPCOMING to "Komend",
                            ListMode.FINISHED to "Afgelopen",
                        )
                        for ((mode, label) in chips) PillChip(label, selected = st.mode == mode, onClick = { model.setMode(mode) })
                    }
                }

                // Zoekveld + Filters-knop (`.lb-search` + `.lb-filterbtn`).
                item(key = "search") {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = st.filters.query,
                            onValueChange = { model.setQuery(it) },
                            placeholder = { Text("Zoek een ploeg of reeks…") },
                            singleLine = true,
                            shape = RoundedCornerShape(Radius.control),
                            colors = fieldColors(),
                            trailingIcon = if (st.filters.query.isNotEmpty()) {
                                {
                                    Text(
                                        "✕", color = Pal.Dim, fontSize = 16.sp,
                                        modifier = Modifier.clip(CircleShape).clickable(role = Role.Button) { model.setQuery("") }.padding(10.dp),
                                    )
                                }
                            } else {
                                null
                            },
                            modifier = Modifier.weight(1f),
                        )
                        FilterButton(f.activeCount) { sheet = true }
                    }
                }

                // "Zoeken in het hele seizoen" + de link naar de volledige agenda op de site.
                if (f.seasonSearch) {
                    item(key = "scope") {
                        SeasonHint(
                            query = f.query.trim(),
                            loading = st.seasonLoading,
                            failed = st.seasonFailed,
                            onAgenda = {
                                ctx.startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse(Graph.authRepo.serverUrl + "/zoeken?ploeg=" + Uri.encode(f.query.trim()))),
                                )
                            },
                        )
                    }
                }

                // Sorteren (`.lb-sort`): reeks / tijdstip / thuis-uit. Thuis/Uit kan enkel mét een club op het account.
                item(key = "sort") {
                    Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("SORTEER", color = Pal.Dim, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.7.sp)
                        for (s in ListSort.entries) {
                            if (s == ListSort.THUISUIT && myClub == null) continue
                            SortBtn(s.label, on = view.sort == s) { model.setSort(s) }
                        }
                    }
                }

                when {
                    st.error != null && view.source.isEmpty() -> item(key = "error") {
                        Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(st.error!!, color = Pal.Bad, textAlign = TextAlign.Center)
                            TextButton(onClick = { model.reload() }) { Text("Opnieuw proberen", color = Pal.Accent) }
                        }
                    }
                    (st.loading || !st.loadedOnce) && view.source.isEmpty() -> item(key = "loading") {
                        Row(Modifier.fillMaxWidth().padding(32.dp), horizontalArrangement = Arrangement.Center) {
                            CircularProgressIndicator(color = Pal.Accent)
                        }
                    }
                    view.sections.isEmpty() -> item(key = "empty") {
                        if (f.activeCount > 0) {
                            NothingFound(
                                reason = when {
                                    f.query.isNotBlank() -> " voor “${f.query.trim()}”"
                                    f.onlyLive -> " live"
                                    f.onlyMyClub -> " voor je club"
                                    else -> ""
                                },
                                searching = st.seasonLoading,
                                onClear = { model.clearFilters() },
                            )
                        } else {
                            CenterText(
                                when (st.mode) {
                                    ListMode.LIVE -> "Er wordt nu geen wedstrijd aangetekend."
                                    ListMode.TODAY -> "Vandaag staan er geen wedstrijden gepland."
                                    ListMode.UPCOMING -> "Geen komende wedstrijden gevonden."
                                    ListMode.FINISHED -> "Geen afgelopen wedstrijden in de laatste 14 dagen."
                                },
                            )
                        }
                    }
                    else -> {
                        val byReeks = view.sort == ListSort.REEKS
                        for (sec in view.sections) {
                            val collapsed = byReeks && sec.key in st.collapsed
                            if (sec.title != null) {
                                item(key = "h-${sec.key}") {
                                    if (byReeks) {
                                        GroupHeader(
                                            title = sec.title,
                                            count = sec.rows.size,
                                            live = sec.rows.count { it.row.status == "live" },
                                            collapsed = collapsed,
                                            onToggle = { model.toggleCollapsed(sec.key) },
                                        )
                                    } else {
                                        SectionTitle(sec.title, Modifier.padding(top = 10.dp))
                                    }
                                }
                            }
                            if (!collapsed) {
                                items(sec.rows, key = { it.row.id }) { rv -> TaggedRow(rv, st.scores[rv.row.id], clubs, onOpen) }
                            }
                        }
                        if (st.hasNext && !f.seasonSearch) {
                            item(key = "more") {
                                TextButton(onClick = { model.loadMore() }, modifier = Modifier.fillMaxWidth()) {
                                    Text(if (st.loading) "Laden…" else "Meer laden", color = Pal.Accent)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (sheet) {
        FilterSheet(view, myClub, model) { sheet = false }
    }
}

// ── Zoek- en filteronderdelen ────────────────────────────────────────────────────────────────

/** `.lb-filterbtn`: opent de filterlade; het bolletje toont hoeveel filters aan staan. */
@Composable
private fun FilterButton(count: Int, onClick: () -> Unit) {
    val shape = RoundedCornerShape(Radius.control)
    val active = count > 0
    Row(
        Modifier
            .heightIn(min = 56.dp)
            .clip(shape)
            .background(if (active) mix(Pal.Accent, 0.14f, Pal.Card) else Pal.Card)
            .border(1.dp, if (active) mix(Pal.Accent, 0.6f, Pal.Line) else Pal.Line, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("🔎 Filters", color = if (active) Pal.Accent else Pal.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
        if (active) {
            Box(Modifier.size(20.dp).clip(CircleShape).background(Pal.Accent), contentAlignment = Alignment.Center) {
                Text("$count", color = Pal.Ink, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, style = Num)
            }
        }
    }
}

/** `.lb-sort-btn`: uit = paneel met haarlijn; aan = 14 % accent-tint, accentrand en vette accenttekst. */
@Composable
private fun SortBtn(label: String, on: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .heightIn(min = 36.dp)
            .clip(CircleShape)
            .background(if (on) mix(Pal.Accent, 0.14f, Pal.Card) else Pal.Card)
            .border(1.dp, if (on) mix(Pal.Accent, 0.6f, Pal.Line) else Pal.Line, CircleShape)
            .clickable(role = Role.Tab, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (on) Pal.Accent else Pal.Dim,
            fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold,
            fontSize = 13.sp,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

/** Onder het zoekveld: dat er over het hele seizoen gezocht wordt, en de weg naar de volledige agenda (`.lb-wanneer`). */
@Composable
private fun SeasonHint(query: String, loading: Boolean, failed: Boolean, onAgenda: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Zoeken in het hele seizoen", color = Pal.Dim, fontSize = 12.sp)
            if (loading) CircularProgressIndicator(color = Pal.Accent, strokeWidth = 2.dp, modifier = Modifier.size(12.dp))
        }
        if (failed) {
            Text("Het seizoen kon niet doorzocht worden — enkel de geladen lijst is doorzocht.", color = Pal.Warn, fontSize = 12.sp, lineHeight = 16.sp)
        }
        Text(
            buildAnnotatedString {
                append("📅 Wanneer speelt ")
                withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(query) }
                append(" nog? Bekijk de hele agenda →")
            },
            color = Pal.Accent,
            fontSize = 13.sp,
            lineHeight = 17.sp,
            modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button, onClick = onAgenda).padding(vertical = 4.dp),
        )
    }
}

@Composable
private fun NothingFound(reason: String, searching: Boolean, onClear: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp, horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (searching) {
            CircularProgressIndicator(color = Pal.Accent, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            Dim("Het seizoen wordt doorzocht…")
        } else {
            Text("Niets gevonden$reason.", color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 16.sp, textAlign = TextAlign.Center)
            Dim("Pas je filters aan of toon weer alle wedstrijden.")
            VSpace(4)
            SmallButton("↺ Wis filters", onClear)
        }
    }
}

/** Kop van een reeksgroep (`.lb-group-head`): pijltje, naam, live-telling en aantal; tikken klapt de groep in of uit. */
@Composable
private fun GroupHeader(title: String, count: Int, live: Int, collapsed: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 10.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(role = Role.Button, onClick = onToggle)
            .padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(if (collapsed) "▸" else "▾", color = Pal.Dim, fontSize = 15.sp)
        Text(
            title.uppercase(), color = Pal.Dim, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.7.sp,
            style = DisplayStyle, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        if (live > 0) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(Pal.Pop))
                Text("$live", color = Pal.Pop, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, style = Num)
            }
        }
        Text("$count", color = Pal.Dim, fontSize = 12.sp, fontWeight = FontWeight.Bold, style = Num)
    }
}

/** Een kaart met het tagje erboven (`.lb-row-reeks`): "🏠 Thuis · 1ste Nationale Heren", "za 12 sep"… */
@Composable
private fun TaggedRow(rv: RowView, score: Pair<Int, Int>?, clubs: Map<Int, ClubLook>, onOpen: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        rv.tag?.let {
            Text(it, color = Pal.Dim, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 4.dp))
        }
        MatchRowCard(rv.row, score, clubs, onClick = { onOpen(rv.row.id) })
    }
}

// ── De filterlade ────────────────────────────────────────────────────────────────────────────

private enum class RowKind { Normal, Live, Fav }

/** Een rij van de filterlade (`.lb-reeks`): label links, aantal in een pilletje rechts; aan = accent (live: rood, favoriet: amber). */
@Composable
private fun FilterRow(label: String, count: Int, on: Boolean, kind: RowKind = RowKind.Normal, enabled: Boolean = true, onClick: () -> Unit) {
    val shape = RoundedCornerShape(8.dp)
    val tint = when (kind) {
        RowKind.Normal -> Pal.Accent
        RowKind.Live -> Pal.Pop
        RowKind.Fav -> Amber
    }
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .alpha(if (enabled) 1f else 0.45f)
            .clip(shape)
            .background(if (on) mix(tint, 0.16f, Pal.Card) else Color.Transparent)
            .border(1.dp, if (on) mix(tint, 0.7f, Pal.Line) else Color.Transparent, shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            label, color = if (on) tint else Pal.Text, fontSize = 14.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        // Het aantal: grijs; bij een aan-rij vol accent (`.lb-reeks.on .lb-reeks-n`).
        Box(
            Modifier
                .widthIn(min = 20.dp)
                .clip(CircleShape)
                .background(if (on && kind != RowKind.Live) tint else mix(Color.White, 0.08f, Pal.Bg))
                .padding(horizontal = 7.dp, vertical = 1.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text("$count", color = if (on && kind != RowKind.Live) Pal.Ink else Pal.Dim, fontSize = 11.5.sp, fontWeight = FontWeight.ExtraBold, style = Num)
        }
    }
}

/** De filterlade van de site: snelfilters, de reeksen met aantallen, en onderaan wissen / tonen. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterSheet(view: ListLogic.View, myClub: Int?, model: MatchListModel, onClose: () -> Unit) {
    val f = view.filters
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Pal.Bg,
        contentColor = Pal.Text,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Filters", color = Pal.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold, style = DisplayStyle, modifier = Modifier.weight(1f))
                Text(
                    "✕", color = Pal.Dim, fontSize = 18.sp,
                    modifier = Modifier.clip(CircleShape).clickable(role = Role.Button, onClick = onClose).padding(10.dp),
                )
            }
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                SectionTitle("Snelfilters", Modifier.padding(vertical = 6.dp))
                FilterRow("● Nu live", view.liveCount, on = f.onlyLive, kind = RowKind.Live, enabled = view.liveCount > 0) { model.setOnlyLive(!f.onlyLive) }
                if (myClub != null) {
                    FilterRow("🏠 Mijn club", view.myCount, on = f.onlyMyClub, kind = RowKind.Fav) { model.setOnlyMyClub(!f.onlyMyClub) }
                }
                SectionTitle("Reeks", Modifier.padding(top = 14.dp, bottom = 6.dp))
                FilterRow("Alle reeksen", view.base.size, on = f.reeks == null) { model.setReeks(null) }
                for ((code, n) in view.reeksen) {
                    FilterRow(Reeksen.name(code), n, on = f.reeks == code) { model.setReeks(if (f.reeks == code) null else code) }
                }
            }
            Spacer(Modifier.size(12.dp))
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SmallButton("↺ Wis filters", onClick = { model.clearFilters() }, kind = Btn.Default, enabled = f.activeCount > 0)
                SmallButton("Toon ${view.visible.size} wedstrijd${if (view.visible.size == 1) "" else "en"}", onClick = onClose, modifier = Modifier.weight(1f))
            }
        }
    }
}

// ── De wedstrijdkaart ────────────────────────────────────────────────────────────────────────

/** De wedstrijdkaart van de site (`.match-card`): thuis rechts uitgelijnd | midden | uit links uitgelijnd. */
@Composable
private fun MatchRowCard(r: MatchRow, score: Pair<Int, Int>?, clubs: Map<Int, ClubLook>, onClick: () -> Unit) {
    val live = r.status == "live"
    val home = r.homeClub?.let { clubs[it] }
    val away = r.awayClub?.let { clubs[it] }
    val hint = startHint(r)
    Card(
        Modifier.fillMaxWidth(),
        border = if (live) mix(Pal.Accent, 0.6f, Pal.Line) else Pal.Line,
        radius = 12.dp,
        onClick = onClick,
    ) {
        Column(
            Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Thuis: naam, dan het logo naast het midden (`.match-card .home`).
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.End) {
                    Text(
                        r.home, color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 18.sp,
                        maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End, modifier = Modifier.weight(1f, fill = false),
                    )
                    Spacer(Modifier.width(8.dp))
                    TeamBadge(r.home, home?.logoUrl, home?.fit, clubRing(home, Pal.Home), 32.dp)
                }
                Column(Modifier.widthIn(min = 64.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    when {
                        r.cancelled -> Pill("AFGELAST", Pal.Bad)
                        live -> {
                            if (score != null) Text("${score.first} – ${score.second}", color = Pal.Text, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, style = Num)
                            LivePill()
                        }
                        r.status == "finished" -> {
                            Text(rowTime(r), color = Pal.Dim, fontSize = 13.sp, fontWeight = FontWeight.Bold, style = Num)
                            Text("afgelopen", color = Pal.Dim, fontSize = 11.sp)
                        }
                        else -> Text(rowTime(r), color = Pal.Text, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, style = Num)
                    }
                }
                // Uit: het logo naast het midden, dan de naam (`.match-card .away`).
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Start) {
                    TeamBadge(r.away, away?.logoUrl, away?.fit, clubRing(away, Pal.Away), 32.dp)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        r.away, color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 18.sp,
                        maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Start, modifier = Modifier.weight(1f, fill = false),
                    )
                }
            }
            // `.mc-ready` (groen) / `.mc-locked` (gedempt) — wat er met deze wedstrijd kan.
            hint?.let { (text, ready) ->
                Text(
                    text,
                    color = if (ready) Pal.Home else Pal.Dim,
                    fontSize = 12.sp,
                    fontWeight = if (ready) FontWeight.ExtraBold else FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

/** De ring van een badge: clubkleur (70 %), anders het zijde-accent van de site (thuis groen, uit blauw; 65 %). */
internal fun clubRing(club: ClubLook?, side: Color): Color =
    parseHex(club?.color)?.copy(alpha = 0.7f) ?: side.copy(alpha = 0.65f)

/**
 * "Klaar" of "nog niet" voor een geplande wedstrijd. Aantekenen kan vanaf 30 minuten vóór de aftrap (de regel van de
 * server, match-start-window.ts). Enkel in supporters-modus: in de federatieflow hangt "klaar" ook af van opstellingen
 * en het akkoord van de scheidsrechter, en dat weet de lijst niet.
 */
private fun startHint(r: MatchRow): Pair<String, Boolean>? {
    if (r.status != "scheduled" || r.cancelled) return null
    if (Graph.auth.scoreMode != "supporters") return null
    val start = runCatching { Instant.parse(r.dateIso).toEpochMilli() }.getOrNull() ?: return null
    val opens = start - 30 * 60_000L
    return if (Time.wall() >= opens) {
        "✓ klaar — tik om te starten ▶" to true
    } else {
        "🔒 starten kan vanaf ${Instant.ofEpochMilli(opens).atZone(ZoneId.systemDefault()).format(timeFmt)}" to false
    }
}

/** `.badge-live`: groen met een lichtend bolletje. */
@Composable
fun LivePill(modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(CircleShape)
            .background(mix(Pal.Home, 0.20f, Color10141A))
            .padding(horizontal = 9.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(Pal.Home))
        Text("LIVE", color = Pal.Home, fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.6.sp)
    }
}

private val Color10141A = androidx.compose.ui.graphics.Color(0xFF10141A)
