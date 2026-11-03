package be.krachtbal.aantekenaar.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// De zoek-, filter- en indelingslogica van de wedstrijdenlijst: dezelfde regels als de startpagina van de site
// (src/app/(frontend)/live/LiveBoard.tsx). Puur en zonder Android, zodat ze getest kan worden.

/** Hoe de lijst geordend wordt: per reeks gegroepeerd, op tijdstip, of "Thuis/Uit" van je eigen club. */
enum class ListSort(val label: String) {
    REEKS("🏷 Reeks"),
    TIJD("⏱ Tijdstip"),
    THUISUIT("🏠 Thuis/Uit"),
}

/** De filters die de gebruiker aan zet. */
data class ListFilters(
    val query: String = "",
    /** Reeks-code (zoals "1NAH"), of null voor alle reeksen. */
    val reeks: String? = null,
    val onlyLive: Boolean = false,
    /** Enkel wedstrijden van de club van het ingelogde account. */
    val onlyMyClub: Boolean = false,
) {
    /** Een zoekopdracht van minstens 2 tekens zoekt ook over het hele seizoen (zoals op de site). */
    val seasonSearch: Boolean get() = query.trim().length >= 2

    /** Aantal actieve filters: de teller op de Filters-knop (`activeCount` op de site). */
    val activeCount: Int
        get() = (if (query.isNotBlank()) 1 else 0) + (if (reeks != null) 1 else 0) + (if (onlyLive) 1 else 0) + (if (onlyMyClub) 1 else 0)
}

/** Een kaart in de lijst, met het tagje erboven ("🏠 Thuis · 1ste Nationale Heren"). */
data class RowView(val row: MatchRow, val tag: String?)

/** Een groep kaarten onder een kop (een reeks of een dag). */
data class Section(val key: String, val title: String?, val rows: List<RowView>)

object ListLogic {
    private val dayTitleFmt = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.forLanguageTag("nl-BE"))
    private val dayShortFmt = DateTimeFormatter.ofPattern("EEE dd MMM", Locale.forLanguageTag("nl-BE"))

    fun localDate(r: MatchRow, zone: ZoneId): LocalDate? =
        runCatching { Instant.parse(r.dateIso).atZone(zone).toLocalDate() }.getOrNull()

    /** "Vandaag", anders "za 12 sep" (`dagLabel` op de site). */
    fun dagLabel(d: LocalDate, today: LocalDate): String =
        if (d == today) "Vandaag" else d.format(dayShortFmt).replace(".", "")

    fun dayTitle(d: LocalDate): String = d.format(dayTitleFmt).replaceFirstChar { it.uppercase() }

    fun isMine(r: MatchRow, myClub: Int?): Boolean = myClub != null && (r.homeClub == myClub || r.awayClub == myClub)

    /** Zoek op ploegnaam, clubnaam of reeks — zoals mensen ze typen. */
    fun matchesQuery(r: MatchRow, query: String, clubName: (Int?) -> String?): Boolean =
        pastBijZoekterm(query, r.home, r.away, clubName(r.homeClub), clubName(r.awayClub), Reeksen.name(r.reeks), r.reeks)

    /** Alles behalve het reeks-filter, zodat de reeks-tellingen tonen wat er ná zoeken/live/club overblijft. */
    fun base(rows: List<MatchRow>, f: ListFilters, myClub: Int?, clubName: (Int?) -> String?): List<MatchRow> =
        rows.filter { r ->
            (!f.onlyLive || r.status == "live") &&
                (f.query.isBlank() || matchesQuery(r, f.query, clubName)) &&
                (!f.onlyMyClub || isMine(r, myClub))
        }

    /** Reeks-codes met aantallen, op alfabet van hun leesbare naam (`reeksen` op de site). */
    fun reeksCounts(base: List<MatchRow>): List<Pair<String, Int>> =
        base.groupingBy { it.reeks.orEmpty() }.eachCount().toList()
            .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { Reeksen.name(it.first) })

    fun visible(base: List<MatchRow>, f: ListFilters): List<MatchRow> =
        if (f.reeks == null) base else base.filter { it.reeks.orEmpty() == f.reeks }

    private fun byKickoff(a: MatchRow, b: MatchRow) = (a.dateIso ?: "").compareTo(b.dateIso ?: "")

    /** Zoals op de site: wie een club heeft, begint op "Thuis/Uit"; anders gegroepeerd per reeks. */
    fun defaultSort(myClub: Int?): ListSort = if (myClub != null) ListSort.THUISUIT else ListSort.REEKS

    /**
     * De lijst in groepen, volgens de gekozen sortering:
     *  • REEKS: gegroepeerd per reeks (op naam), elke groep chronologisch;
     *  • TIJD: per dag, op tijdstip, met de reeks als tagje;
     *  • THUISUIT: per dag eerst de thuiswedstrijden van je club, dan de uitwedstrijden, dan de rest.
     * Zonder gekende club valt "Thuis/Uit" terug op reeksen (zoals op de site).
     * [newestFirst]: de nieuwste bovenaan (de lijst "Afgelopen"); anders de eerstvolgende bovenaan.
     * [dayTags]: toon bij elke kaart ook op welke dag ze valt (zoekopdracht over meerdere dagen).
     */
    fun sections(
        visible: List<MatchRow>,
        sort: ListSort,
        myClub: Int?,
        zone: ZoneId,
        today: LocalDate,
        dayTags: Boolean,
        newestFirst: Boolean = false,
    ): List<Section> {
        if (visible.isEmpty()) return emptyList()
        val sorted = visible.sortedWith(
            Comparator<MatchRow> { a, b -> if (newestFirst) byKickoff(b, a) else byKickoff(a, b) },
        )
        val multiDay = sorted.mapNotNull { localDate(it, zone) }.distinct().size > 1
        fun day(r: MatchRow) = localDate(r, zone)
        fun dayTag(r: MatchRow) = if (dayTags || multiDay) day(r)?.let { dagLabel(it, today) } else null
        fun tagOf(vararg parts: String?) = parts.filterNotNull().filter { it.isNotEmpty() }.joinToString(" · ").ifEmpty { null }

        val effective = if (sort == ListSort.THUISUIT && myClub == null) ListSort.REEKS else sort
        return when (effective) {
            ListSort.REEKS ->
                sorted.groupBy { it.reeks.orEmpty() }.toList()
                    .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { Reeksen.name(it.first) })
                    .map { (code, rows) -> Section(code, Reeksen.name(code), rows.map { RowView(it, dayTag(it)) }) }
            ListSort.TIJD ->
                sorted.groupBy { day(it) }.map { (d, rows) ->
                    Section(d?.toString() ?: "?", d?.let(::dayTitle), rows.map { RowView(it, tagOf(Reeksen.name(it.reeks))) })
                }
            ListSort.THUISUIT ->
                sorted.groupBy { day(it) }.map { (d, rows) ->
                    val thuis = rows.filter { it.homeClub == myClub }
                    val uit = rows.filter { it.awayClub == myClub && it.homeClub != myClub }
                    val rest = rows.filter { it.homeClub != myClub && it.awayClub != myClub }
                    val ordered = thuis.map { it to "🏠 Thuis" } + uit.map { it to "✈ Uit" } + rest.map { it to null }
                    Section(d?.toString() ?: "?", d?.let(::dayTitle), ordered.map { (r, kind) -> RowView(r, tagOf(kind, Reeksen.name(r.reeks))) })
                }
        }
    }

    /** Alles wat het scherm nodig heeft, afgeleid uit de geladen rijen en de filters. */
    data class View(
        /** De filters die écht gelden: "Nu live" telt niet mee zolang er niets live is (`showLiveOnly` op de site). */
        val filters: ListFilters,
        val source: List<MatchRow>,
        val base: List<MatchRow>,
        val reeksen: List<Pair<String, Int>>,
        val visible: List<MatchRow>,
        val sections: List<Section>,
        val sort: ListSort,
        val liveCount: Int,
        val myCount: Int,
    )

    /**
     * [rows] = de lijst van het gekozen tabblad (Live/Vandaag/…), [seasonRows] = de zoekresultaten over het seizoen.
     * Zoekt de gebruiker (≥ 2 tekens), dan vervangt het seizoen de dag — de rijen van het tabblad blijven er al
     * bij, zodat de eerste toetsen meteen resultaat geven terwijl de server nog antwoordt.
     */
    fun view(
        rows: List<MatchRow>,
        seasonRows: List<MatchRow>,
        f: ListFilters,
        sortChoice: ListSort?,
        myClub: Int?,
        clubName: (Int?) -> String?,
        zone: ZoneId,
        today: LocalDate,
        newestFirst: Boolean,
    ): View {
        val source = if (f.seasonSearch) merge(seasonRows, rows) else rows
        val liveCount = source.count { it.status == "live" }
        val eff = f.copy(onlyLive = f.onlyLive && liveCount > 0, onlyMyClub = f.onlyMyClub && myClub != null)
        val base = base(source, eff, myClub, clubName)
        val visible = visible(base, eff)
        val sort = (sortChoice ?: defaultSort(myClub)).let { if (it == ListSort.THUISUIT && myClub == null) ListSort.REEKS else it }
        return View(
            filters = eff,
            source = source,
            base = base,
            reeksen = reeksCounts(base),
            visible = visible,
            sections = sections(visible, sort, myClub, zone, today, dayTags = eff.seasonSearch, newestFirst = newestFirst && !eff.seasonSearch),
            sort = sort,
            liveCount = liveCount,
            myCount = source.count { isMine(it, myClub) },
        )
    }

    /** Dubbele wedstrijden (zelfde id) samenvoegen: lijst + zoekresultaten van het hele seizoen. */
    fun merge(vararg lists: List<MatchRow>): List<MatchRow> {
        val seen = HashSet<Int>()
        val out = ArrayList<MatchRow>()
        for (l in lists) for (r in l) if (seen.add(r.id)) out.add(r)
        return out
    }
}
