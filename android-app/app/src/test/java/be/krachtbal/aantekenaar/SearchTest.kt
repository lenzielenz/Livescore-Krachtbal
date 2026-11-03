package be.krachtbal.aantekenaar

import be.krachtbal.aantekenaar.data.ClubLook
import be.krachtbal.aantekenaar.data.ListFilters
import be.krachtbal.aantekenaar.data.ListLogic
import be.krachtbal.aantekenaar.data.ListSort
import be.krachtbal.aantekenaar.data.MatchRow
import be.krachtbal.aantekenaar.data.Reeksen
import be.krachtbal.aantekenaar.data.SeasonSearch
import be.krachtbal.aantekenaar.data.parseLiveScores
import be.krachtbal.aantekenaar.data.parseMatchesBody
import be.krachtbal.aantekenaar.data.pastBijZoekterm
import be.krachtbal.aantekenaar.data.zoekWoorden
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

/** Dezelfde voorbeelden als src/lib/team-search.ts van de site. */
class TeamSearchTest {
    @Test
    fun `afkortingen en woordvolgorde`() {
        assertTrue(pastBijZoekterm("sint michiels", "KBC St. Michiels B"))
        assertTrue(pastBijZoekterm("michiels sint", "KBC St. Michiels B"))
        assertTrue(pastBijZoekterm("st michiels", "KBC Sint-Michiels"))
    }

    @Test
    fun `een woordbegin volstaat`() {
        assertTrue(pastBijZoekterm("baasro", "'T Botterken Baasrode"))
        assertFalse(pastBijZoekterm("rode", "'T Botterken Baasrode")) // enkel het BEGIN van een woord
    }

    @Test
    fun `elk getypt woord moet ergens passen`() {
        assertFalse(pastBijZoekterm("sint", "Michiels"))
        assertFalse(pastBijZoekterm("michiels baasro", "KBC St. Michiels B"))
        assertTrue(pastBijZoekterm("michiels heren", "KBC St. Michiels B", "1ste Nationale Heren")) // verspreid over velden
    }

    @Test
    fun `accenten hoofdletters en leestekens tellen niet`() {
        assertTrue(pastBijZoekterm("hélios", "Helios Zele"))
        assertTrue(pastBijZoekterm("HELIOS", "Hélios Zele"))
        assertEquals(listOf("sint", "michiels"), zoekWoorden("  St.-Michiels "))
    }

    @Test
    fun `lege zoekterm past altijd, geen velden nooit`() {
        assertTrue(pastBijZoekterm("", "wat dan ook"))
        assertTrue(pastBijZoekterm("  ", null))
        assertFalse(pastBijZoekterm("a", null, null))
    }
}

class ReeksenTest {
    @Test
    fun `leesbare namen`() {
        assertEquals("1ste Nationale Heren", Reeksen.name("1NAH"))
        assertEquals("Eindronde", Reeksen.name("EINDR"))
        assertEquals("Overig", Reeksen.name(null))
        assertEquals("Overig", Reeksen.name(" "))
        assertEquals("ONBEKEND", Reeksen.name("ONBEKEND"))
    }

    @Test
    fun `reeksen zoeken op code of naam`() {
        val nationale = Reeksen.codesMatching("nationale")
        assertTrue("1NAH" in nationale && "1NAD" in nationale && "2NAH" in nationale)
        assertFalse("U16J" in nationale)
        val u16 = Reeksen.codesMatching("u16")
        assertTrue("U16J" in u16 && "U16M" in u16)
        assertFalse("U14J" in u16)
        assertTrue(Reeksen.codesMatching("1nah").contains("1NAH"))
        assertTrue(Reeksen.codesMatching("   ").isEmpty())
    }
}

class ListLogicTest {
    private val zone = ZoneId.of("Europe/Brussels")
    private val today = LocalDate.of(2026, 10, 31) // zaterdag

    private val clubNames = mapOf(1 to "KBC St. Michiels", 2 to "Eendracht Aalst", 3 to "'T Botterken Baasrode", 4 to "Helios", 5 to "Zele")
    private val name: (Int?) -> String? = { clubNames[it] }

    private fun row(id: Int, iso: String, reeks: String?, home: String, homeClub: Int?, away: String, awayClub: Int?, status: String = "scheduled") =
        MatchRow(id, iso, status, reeks, home, away, false, homeClub, awayClub)

    // zaterdag 31/10 (winteruur: UTC+1) en zondag 1/11
    private val r1 = row(1, "2026-10-31T13:00:00.000Z", "1NAH", "KBC St. Michiels A", 1, "Eendracht Aalst", 2)
    private val r2 = row(2, "2026-10-31T15:00:00.000Z", "1NAD", "Baasrode D", 3, "Michiels Dames", 1)
    private val r3 = row(3, "2026-11-01T09:00:00.000Z", "U16J", "Aalst U16", 2, "Baasrode U16", 3)
    private val r4 = row(4, "2026-10-31T10:00:00.000Z", "1NAH", "Helios", 4, "Zele", 5, status = "live")
    private val all = listOf(r1, r2, r3, r4)

    private fun ids(rows: List<MatchRow>) = rows.map { it.id }

    @Test
    fun `zoeken op club, ploeg en reeks`() {
        fun q(s: String) = ids(ListLogic.base(all, ListFilters(query = s), null, name))
        assertEquals(listOf(1, 2), q("sint michiels")) // via de clubnaam "KBC St. Michiels"
        assertEquals(listOf(2, 3), q("baasro"))
        assertEquals(listOf(1, 4), q("nationale heren")) // via de reeksnaam
        assertEquals(listOf(3), q("u16 aalst")) // reeks + ploegnaam samen
        assertEquals(emptyList<Int>(), q("zzz"))
    }

    @Test
    fun `live en mijn club`() {
        assertEquals(listOf(4), ids(ListLogic.base(all, ListFilters(onlyLive = true), null, name)))
        assertEquals(listOf(1, 2), ids(ListLogic.base(all, ListFilters(onlyMyClub = true), 1, name)))
        assertEquals(emptyList<Int>(), ids(ListLogic.base(all, ListFilters(onlyMyClub = true), null, name)))
    }

    @Test
    fun `reeks-tellingen op naam en het reeksfilter komt erna`() {
        val base = ListLogic.base(all, ListFilters(), null, name)
        assertEquals(listOf("1NAD" to 1, "1NAH" to 2, "U16J" to 1), ListLogic.reeksCounts(base))
        assertEquals(listOf(1, 4), ids(ListLogic.visible(base, ListFilters(reeks = "1NAH"))))
    }

    @Test
    fun `filtertelling`() {
        assertEquals(0, ListFilters().activeCount)
        assertEquals(3, ListFilters(query = "x", reeks = "1NAH", onlyLive = true).activeCount)
        assertFalse(ListFilters(query = "a").seasonSearch) // 1 teken: nog niet over het seizoen
        assertTrue(ListFilters(query = " ba ").seasonSearch)
    }

    @Test
    fun `sectie per reeks, op naam`() {
        val s = ListLogic.sections(all, ListSort.REEKS, null, zone, today, dayTags = false)
        assertEquals(listOf("1ste Nationale Dames", "1ste Nationale Heren", "U16 Jongens"), s.map { it.title })
        assertEquals(listOf(4, 1), ids(s[1].rows.map { it.row })) // chronologisch binnen de reeks
        // De groepen bevatten meerdere dagen? Dan staat de dag op de kaart, anders niet.
        assertEquals(listOf("Vandaag", "Vandaag"), s[1].rows.map { it.tag })
        assertEquals("zo", s[2].rows[0].tag!!.substring(0, 2))
    }

    @Test
    fun `sectie per dag op tijdstip met de reeks als tag`() {
        val s = ListLogic.sections(all, ListSort.TIJD, null, zone, today, dayTags = false)
        assertEquals(2, s.size)
        assertEquals("Zaterdag 31 oktober", s[0].title)
        assertEquals(listOf(4, 1, 2), ids(s[0].rows.map { it.row }))
        assertEquals("1ste Nationale Heren", s[0].rows[0].tag)
    }

    @Test
    fun `nieuwste eerst voor afgelopen wedstrijden`() {
        val s = ListLogic.sections(all, ListSort.TIJD, null, zone, today, dayTags = false, newestFirst = true)
        assertEquals("Zondag 1 november", s[0].title)
        assertEquals(listOf(2, 1, 4), ids(s[1].rows.map { it.row }))
    }

    @Test
    fun `thuis eerst, dan uit, dan de rest - per dag`() {
        val s = ListLogic.sections(all, ListSort.THUISUIT, 1, zone, today, dayTags = false)
        val zaterdag = s[0].rows
        assertEquals(listOf(1, 2, 4), ids(zaterdag.map { it.row }))
        assertEquals("🏠 Thuis · 1ste Nationale Heren", zaterdag[0].tag)
        assertEquals("✈ Uit · 1ste Nationale Dames", zaterdag[1].tag)
        assertEquals("1ste Nationale Heren", zaterdag[2].tag) // de rest: enkel de reeks
    }

    @Test
    fun `thuis-uit zonder club valt terug op reeksen`() {
        val s = ListLogic.sections(all, ListSort.THUISUIT, null, zone, today, dayTags = false)
        assertEquals(listOf("1ste Nationale Dames", "1ste Nationale Heren", "U16 Jongens"), s.map { it.title })
    }

    @Test
    fun `dagen`() {
        assertEquals("Vandaag", ListLogic.dagLabel(today, today))
        assertTrue(ListLogic.dagLabel(today.plusDays(1), today).let { it.startsWith("zo") && it.contains("nov") && !it.contains(".") })
        assertTrue(ListLogic.localDate(r1, zone) == today)
        assertNull(ListLogic.localDate(row(9, "kapot", null, "a", null, "b", null), zone))
    }

    @Test
    fun `view - live-filter telt niet mee zonder live wedstrijden`() {
        val noLive = all.filter { it.status != "live" }
        val v = ListLogic.view(noLive, emptyList(), ListFilters(onlyLive = true), null, null, name, zone, today, false)
        assertFalse(v.filters.onlyLive)
        assertEquals(3, v.visible.size)
        assertEquals(0, v.filters.activeCount)
    }

    @Test
    fun `view - standaardsortering volgt de club en een zoekopdracht voegt het seizoen toe`() {
        val a = ListLogic.view(listOf(r1), listOf(r2, r3), ListFilters(query = "baasro"), null, 1, name, zone, today, false)
        assertEquals(ListSort.THUISUIT, a.sort)
        assertEquals(listOf(2, 3), ids(a.visible)) // seizoen + lijst samen, daarna gefilterd
        val b = ListLogic.view(listOf(r1), listOf(r2, r3), ListFilters(query = "b"), null, null, name, zone, today, false)
        assertEquals(ListSort.REEKS, b.sort) // 1 teken zoekt niet over het seizoen
        assertEquals(emptyList<Int>(), ids(b.visible)) // "b" past enkel bij "Botterken", niet bij r1
    }

    @Test
    fun `view - mijn club zonder club op het account doet niets`() {
        val v = ListLogic.view(all, emptyList(), ListFilters(onlyMyClub = true), null, null, name, zone, today, false)
        assertEquals(4, v.visible.size)
        assertEquals(ListSort.REEKS, v.sort)
    }

    @Test
    fun `samenvoegen houdt elke wedstrijd één keer`() {
        assertEquals(listOf(1, 2, 3), ids(ListLogic.merge(listOf(r1, r2), listOf(r2, r3))))
    }
}

class SeasonSearchTest {
    private val clubs = mapOf(
        1 to ClubLook(1, "KBC St. Michiels"),
        2 to ClubLook(2, "Eendracht Aalst"),
        3 to ClubLook(3, "'T Botterken Baasrode"),
    )

    @Test
    fun `een clubnaam wordt een club-id`() {
        val p = SeasonSearch.plan("baasro", clubs)!!
        assertEquals(listOf(3), p.clubIds)
        assertEquals("baasro", p.titleWord)
    }

    @Test
    fun `afkorting en volgorde vinden dezelfde club`() {
        assertEquals(listOf(1), SeasonSearch.plan("st michiels", clubs)!!.clubIds)
        assertEquals(listOf(1), SeasonSearch.plan("michiels sint", clubs)!!.clubIds)
    }

    @Test
    fun `een reeks wordt een reekscode`() {
        val p = SeasonSearch.plan("nationale", clubs)!!
        assertTrue(p.clubIds.isEmpty())
        assertTrue("1NAH" in p.reeksCodes && "1NAD" in p.reeksCodes)
    }

    @Test
    fun `het meest onderscheidende woord bepaalt de kandidaten`() {
        // "heren" past bij tien reeksen, "michiels" bij één club: de club wint, "heren" zeven we nadien op het toestel.
        val p = SeasonSearch.plan("heren michiels", clubs)!!
        assertEquals(listOf(1), p.clubIds)
        assertTrue(p.reeksCodes.isEmpty())
    }

    @Test
    fun `een onbekend woord zoekt in de titel`() {
        val p = SeasonSearch.plan("zwevegem", clubs)!!
        assertTrue(p.clubIds.isEmpty() && p.reeksCodes.isEmpty())
        assertEquals("zwevegem", p.titleWord)
    }

    @Test
    fun `te veel clubs wordt een titelzoektocht`() {
        val veel = (1..SeasonSearch.MAX_CLUBS + 1).associateWith { ClubLook(it, "KBC Club $it") }
        val p = SeasonSearch.plan("kbc", veel)!!
        assertTrue(p.clubIds.isEmpty())
        assertEquals("kbc", p.titleWord)
    }

    @Test
    fun `lege zoekopdracht geeft geen plan`() {
        assertNull(SeasonSearch.plan("  ", clubs))
        assertNull(SeasonSearch.plan("...", clubs))
    }
}

class LiveScoresTest {
    @Test
    fun `enkel lopende wedstrijden krijgen een stand`() {
        // Zoals het `scores`-bericht van /api/live/stream (src/lib/day-channel.ts): meer velden dan wij nodig hebben.
        val data = """[
          {"id":7,"status":"live","awaitingResult":false,"score":{"home":12,"away":9},"viewers":3,"scorerId":null},
          {"id":8,"status":"scheduled","awaitingResult":false,"score":{"home":0,"away":0},"viewers":0,"scorerId":null},
          {"id":9,"status":"finished","awaitingResult":false,"score":{"home":20,"away":18},"scorerId":4}
        ]"""
        assertEquals(mapOf(7 to (12 to 9)), parseLiveScores(data))
    }

    @Test
    fun `een kapot of leeg bericht geeft geen standen en geen crash`() {
        assertEquals(emptyMap<Int, Pair<Int, Int>>(), parseLiveScores("[]"))
        assertEquals(emptyMap<Int, Pair<Int, Int>>(), parseLiveScores("geen json"))
        assertEquals(emptyMap<Int, Pair<Int, Int>>(), parseLiveScores("""{"id":1}"""))
    }
}

class SlankeLijstTest {
    @Test
    fun `de lijst leest het verkleinde ploegformaat van populate`() {
        // `populate[teams][name]` + `[club]`: de ploeg is enkel nog { id, club, name } i.p.v. het hele document.
        val body = """{"docs":[{"id":1,"title":"A — B","reeks":"1NAH",
            "homeTeam":{"id":10,"club":3,"name":"KBC St. Michiels A"},
            "awayTeam":{"id":11,"club":4,"name":"'T Botterken Baasrode"},
            "date":"2026-10-31T13:00:00.000Z","status":"scheduled","afgelast":false,"isDemo":false,"analyseOnly":false}],
            "hasNextPage":false}"""
        val rows = parseMatchesBody(body).rows
        assertEquals(1, rows.size)
        assertEquals("KBC St. Michiels A", rows[0].home)
        assertEquals(3, rows[0].homeClub)
        assertEquals(4, rows[0].awayClub)
    }
}
