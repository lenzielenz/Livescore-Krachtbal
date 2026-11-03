package be.krachtbal.aantekenaar

import be.krachtbal.aantekenaar.data.DemoAccess
import be.krachtbal.aantekenaar.data.Me
import be.krachtbal.aantekenaar.data.Sides
import be.krachtbal.aantekenaar.fed.LineupInfo
import be.krachtbal.aantekenaar.fed.LineupRow
import be.krachtbal.aantekenaar.fed.MatchFacts
import be.krachtbal.aantekenaar.fed.Owner
import be.krachtbal.aantekenaar.fed.SheetView
import be.krachtbal.aantekenaar.fed.Signature
import be.krachtbal.aantekenaar.fed.Step
import be.krachtbal.aantekenaar.fed.StepId
import be.krachtbal.aantekenaar.fed.StepState
import be.krachtbal.aantekenaar.fed.Steps
import be.krachtbal.aantekenaar.fed.parseLineupInfo
import be.krachtbal.aantekenaar.fed.parseSheet
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun rows(n: Int, gecontroleerd: Boolean = false, deelgenomen: Boolean = false) =
    (1..n).map { LineupRow(player = it, rugnummer = it, deelgenomen = deelgenomen, gecontroleerd = gecontroleerd) }

private fun sheet(
    status: String = "concept",
    home: List<LineupRow> = emptyList(),
    away: List<LineupRow> = emptyList(),
    keuringBevestigd: Boolean = false,
    startAkkoord: Boolean = false,
    forfait: String = "geen",
    thuis: Boolean = false,
    uit: Boolean = false,
    sr: Boolean = false,
) = SheetView(
    id = 1, status = status, home = home, away = away, homeConfirmed = false, awayConfirmed = false,
    keuring = emptyMap(), keuringBevestigd = keuringBevestigd, officials = emptyMap(),
    startAkkoord = startAkkoord, startNaam = null, eindeAkkoord = false, forfait = forfait,
    kapiteinThuis = Signature(thuis, null), kapiteinUit = Signature(uit, null), scheidsrechter = Signature(sr, null),
    assignedReferee = 1, backupReferee = null,
)

private fun List<Step>.state(id: StepId) = first { it.id == id }.state

private val scheduled = MatchFacts("scheduled", home = "Sint-Michiels", away = "Baasrode")

class StepsTest {
    @Test
    fun `een lege wedstrijd begint bij de selectie van de coach`() {
        val steps = Steps.plan(scheduled, sheet())
        assertEquals(9, steps.size)
        assertEquals(StepState.TODO, steps.state(StepId.SELECTIE_THUIS))
        assertEquals(StepState.TODO, steps.state(StepId.SELECTIE_UIT))
        assertEquals(StepState.WAIT, steps.state(StepId.CONTROLE))
        assertEquals(StepState.WAIT, steps.state(StepId.VRIJGAVE))
        assertEquals(StepState.WAIT, steps.state(StepId.AANTEKENEN))
        assertEquals(StepId.SELECTIE_THUIS, steps.first { it.next }.id)
        assertEquals(1, steps.count { it.next })
    }

    @Test
    fun `minstens drie spelers per ploeg, anders is de selectie niet klaar`() {
        assertEquals(StepState.TODO, Steps.plan(scheduled, sheet(home = rows(2))).state(StepId.SELECTIE_THUIS))
        assertEquals(StepState.DONE, Steps.plan(scheduled, sheet(home = rows(3))).state(StepId.SELECTIE_THUIS))
    }

    @Test
    fun `vrijgeven kan pas met selecties, controle en keuring`() {
        val klaar = sheet(home = rows(7, gecontroleerd = true), away = rows(7, gecontroleerd = true), keuringBevestigd = true)
        assertEquals(StepState.TODO, Steps.plan(scheduled, klaar).state(StepId.VRIJGAVE))
        // één speler niet gecontroleerd → wachten, en het zegt waarop
        val een = klaar.copy(away = rows(7, gecontroleerd = true).dropLast(1) + LineupRow(99, 9, deelgenomen = false, gecontroleerd = false))
        val wacht = Steps.plan(scheduled, een)
        assertEquals(StepState.WAIT, wacht.state(StepId.VRIJGAVE))
        assertTrue(wacht.first { it.id == StepId.VRIJGAVE }.detail!!.contains("controle"))
        assertEquals("13 van 14 gecontroleerd", wacht.first { it.id == StepId.CONTROLE }.detail)
        // zonder keuring ook
        assertEquals(StepState.WAIT, Steps.plan(scheduled, klaar.copy(keuringBevestigd = false)).state(StepId.VRIJGAVE))
    }

    @Test
    fun `na de vrijgave mag de tafel starten en loopt de wedstrijd`() {
        val vrij = sheet(status = "wedstrijdklaar", home = rows(7, true), away = rows(7, true), keuringBevestigd = true, startAkkoord = true)
        val voor = Steps.plan(scheduled, vrij)
        assertEquals(StepState.DONE, voor.state(StepId.VRIJGAVE))
        assertEquals(StepState.TODO, voor.state(StepId.AANTEKENEN))
        assertEquals(StepId.AANTEKENEN, voor.first { it.next }.id)

        val live = Steps.plan(scheduled.copy(status = "live"), vrij.copy(status = "bezig"))
        assertEquals(StepState.BUSY, live.state(StepId.AANTEKENEN))
        assertEquals(StepState.WAIT, live.state(StepId.AFTEKENEN))
    }

    @Test
    fun `na het eindsignaal komen wie speelde en aftekenen aan de beurt`() {
        val fin = scheduled.copy(status = "finished")
        val s = sheet(status = "af_te_tekenen", home = rows(7, true), away = rows(7, true), keuringBevestigd = true, startAkkoord = true)
        val steps = Steps.plan(fin, s)
        assertEquals(StepState.DONE, steps.state(StepId.AANTEKENEN))
        assertEquals(StepState.TODO, steps.state(StepId.WIE_SPEELDE))
        assertEquals(StepState.TODO, steps.state(StepId.AFTEKENEN))
        assertEquals("0 van 3 getekend", steps.first { it.id == StepId.AFTEKENEN }.detail)
        assertEquals(StepState.WAIT, steps.state(StepId.INDIENEN))

        val bijna = Steps.plan(fin, s.copy(home = rows(7, true, true), away = rows(7, true, true), kapiteinThuis = Signature(true, "A"), kapiteinUit = Signature(true, "B"), scheidsrechter = Signature(true, "C")))
        assertEquals(StepState.DONE, bijna.state(StepId.WIE_SPEELDE))
        assertEquals(StepState.DONE, bijna.state(StepId.AFTEKENEN))
        assertEquals(StepState.TODO, bijna.state(StepId.INDIENEN))
    }

    @Test
    fun `een ingediend blad is helemaal klaar`() {
        val steps = Steps.plan(scheduled.copy(status = "finished"), sheet(status = "ingediend", home = rows(7, true, true), away = rows(7, true, true), thuis = true, uit = true, sr = true, keuringBevestigd = true, startAkkoord = true))
        assertTrue(steps.all { it.state == StepState.DONE })
        assertTrue(steps.none { it.next })
    }

    @Test
    fun `bij een forfait vervalt de rest en tekent enkel wie nog moet`() {
        val steps = Steps.plan(scheduled.copy(status = "finished"), sheet(status = "af_te_tekenen", forfait = "uit", sr = false))
        assertEquals(StepState.NA, steps.state(StepId.SELECTIE_UIT))
        assertEquals(StepState.NA, steps.state(StepId.AANTEKENEN))
        assertEquals(StepState.NA, steps.state(StepId.WIE_SPEELDE))
        // kapitein uit hoeft niet te tekenen: nog 2 handtekeningen nodig (thuis + scheidsrechter)
        assertEquals("0 van 2 getekend", steps.first { it.id == StepId.AFTEKENEN }.detail)
    }

    @Test
    fun `een afgelaste wedstrijd heeft niets meer te doen`() {
        val steps = Steps.plan(scheduled.copy(cancelled = true), sheet())
        assertEquals(StepState.NA, steps.state(StepId.VRIJGAVE))
        assertEquals(StepState.NA, steps.state(StepId.AANTEKENEN))
        assertEquals(StepState.NA, steps.state(StepId.INDIENEN))
    }

    @Test
    fun `een coach leest de stand zonder het blad, uit zijn selectie`() {
        val info = LineupInfo(
            teamId = 1, teamName = "Sint-Michiels", category = "senioren", players = emptyList(), favorites = emptySet(),
            status = "wedstrijdklaar", current = (1..7).map { it to it }, confirmed = true, kapitein = 1, vergrendeld = "vrijgegeven",
        )
        val steps = Steps.plan(scheduled, null, Sides(info, null))
        assertEquals(StepState.DONE, steps.state(StepId.SELECTIE_THUIS))
        // uit is niet de ploeg van de coach (403) maar de wedstrijd is vrijgegeven: dus ook klaar
        assertEquals(StepState.DONE, steps.state(StepId.SELECTIE_UIT))
        assertEquals(StepState.DONE, steps.state(StepId.VRIJGAVE))
        assertEquals(StepState.TODO, steps.state(StepId.AANTEKENEN))
    }

    @Test
    fun `de selectie van de tegenstander is voor een coach niet zichtbaar en dus niet aan hem`() {
        val eigen = LineupInfo(
            teamId = 1, teamName = "Sint-Michiels", category = "senioren", players = emptyList(), favorites = emptySet(),
            status = "concept", current = (1..7).map { it to it }, confirmed = false, kapitein = null, vergrendeld = null,
        )
        val steps = Steps.plan(scheduled, null, Sides(eigen, null))
        assertEquals(StepState.DONE, steps.state(StepId.SELECTIE_THUIS))
        val uit = steps.first { it.id == StepId.SELECTIE_UIT }
        assertEquals(StepState.WAIT, uit.state)
        assertTrue(uit.detail!!.contains("niet zichtbaar"))
        assertFalse(uit.next)
        assertEquals(StepState.WAIT, steps.state(StepId.VRIJGAVE))
        // nog geen blad en geen enkele kant zichtbaar (bv. niet jouw wedstrijd): niets valt de coach toe
        val geen = Steps.plan(scheduled, null, Sides(null, null))
        assertEquals(StepState.WAIT, geen.state(StepId.SELECTIE_THUIS))
        assertEquals(StepState.WAIT, geen.state(StepId.SELECTIE_UIT))
    }

    @Test
    fun `wie een stap mag doen hangt af van de rol`() {
        val coach = Me(roles = setOf("club-lid"), clubFuncties = setOf("coach"))
        val sr = Me(roles = setOf("scheidsrechter"))
        val tafel = Me(roles = setOf("club-medewerker"))
        val fed = Me(roles = setOf("federatie"))
        val steps = Steps.plan(scheduled, sheet())
        fun mine(id: StepId, me: Me) = Steps.isMine(steps.first { it.id == id }, me)
        assertTrue(mine(StepId.SELECTIE_THUIS, coach))
        assertFalse(mine(StepId.VRIJGAVE, coach))
        assertTrue(mine(StepId.VRIJGAVE, sr))
        assertFalse(mine(StepId.AANTEKENEN, sr.copy(roles = setOf("speler"))))
        assertTrue(mine(StepId.AANTEKENEN, tafel))
        assertFalse(mine(StepId.CONTROLE, tafel))
        StepId.entries.forEach { assertTrue(mine(it, fed)) }
        assertEquals(Owner.SCHEIDSRECHTER, steps.first { it.id == StepId.KEURING }.owner)
    }
}

class SheetParseTest {
    private val sheetJson = """
        {"docs":[{"id":43,"status":"wedstrijdklaar","assignedReferee":1,"backupReferee":null,
          "officials":{"aantekenaar":"Tina Tafel","tijdopnemer":"Marc"},
          "homeLineup":[{"id":"x","player":1,"rugnummer":1,"deelgenomen":false,"ibGecontroleerd":true},
                        {"id":"y","player":{"id":2},"rugnummer":2,"deelgenomen":true,"ibGecontroleerd":false}],
          "awayLineup":[],"homeLineupConfirmed":true,"awayLineupConfirmed":false,
          "keuring":{"terrein":"ok","bal":"niet_ok"},"keuringBevestigd":true,
          "wedstrijdstart":{"akkoord":true,"naam":"Karel Fluit","tijdstip":"2026-11-03T08:00:00Z"},
          "wedstrijdeinde":{"akkoord":false},"forfait":{"uitslag":"geen"},
          "kapiteinThuis":{"akkoord":true,"naam":"Lars"},"kapiteinUit":{"akkoord":false,"naam":null},
          "scheidsrechter":{"akkoord":false,"naam":null}}]}
    """.trimIndent()

    @Test
    fun `het blad wordt ingelezen`() {
        val s = parseSheet(sheetJson)!!
        assertEquals(43, s.id)
        assertEquals("wedstrijdklaar", s.status)
        assertEquals(listOf(1, 2), s.home.map { it.player })
        assertTrue(s.home[0].gecontroleerd)
        assertTrue(s.home[1].deelgenomen)
        assertTrue(s.homeConfirmed)
        assertEquals("niet_ok", s.keuring["bal"])
        assertTrue(s.keuringBevestigd)
        assertTrue(s.startAkkoord)
        assertEquals("Karel Fluit", s.startNaam)
        assertEquals("geen", s.forfait)
        assertTrue(s.kapiteinThuis.akkoord)
        assertEquals("Lars", s.kapiteinThuis.naam)
        assertFalse(s.scheidsrechter.akkoord)
        assertEquals(1, s.assignedReferee)
        assertNull(s.backupReferee)
    }

    @Test
    fun `geen blad of onzin geeft null, geen crash`() {
        assertNull(parseSheet("""{"docs":[]}"""))
        assertNull(parseSheet("geen json"))
        assertNull(parseSheet("""{"docs":[{"status":"concept"}]}""")) // zonder id
    }

    @Test
    fun `de selectie met blokkades wordt ingelezen`() {
        val body = """
            {"teamId":1,"teamName":"Sint-Michiels Heren","category":"senioren",
             "players":[{"id":1,"name":"Lars","shirtNumber":1,"vergunningsstatus":"geldig","selectability":{"level":"ok","reasons":["Selecteerbaar."]},"suggested":true},
                        {"id":83,"name":"Seppe","shirtNumber":21,"vergunningsstatus":"geen","selectability":{"level":"block","reasons":["Nog niet gekeurd."]},"suggested":false,
                         "geleendVan":"Sint-Michiels B","knipjes":{"keer":2,"max":3,"vastIn":null}}],
             "favorites":[1],"status":"concept","current":[{"player":1,"rugnummer":5}],
             "confirmed":false,"kapitein":1,"vergrendeld":null}
        """.trimIndent()
        val l = parseLineupInfo(body)!!
        assertEquals("Sint-Michiels Heren", l.teamName)
        assertEquals(2, l.players.size)
        assertFalse(l.players[0].blocked)
        assertTrue(l.players[1].blocked)
        assertEquals("Nog niet gekeurd.", l.players[1].reasons.single())
        assertEquals("2/3", l.players[1].knipjes)
        assertEquals("Sint-Michiels B", l.players[1].geleendVan)
        assertEquals(setOf(1), l.favorites)
        assertEquals(listOf(1 to 5), l.current)
        assertEquals(1, l.kapitein)
        assertNull(l.vergrendeld)
        assertNull(parseLineupInfo("""{"error":"Niet ingelogd."}"""))
    }
}

class DemoAccessTest {
    @Test
    fun `de toegangscode geeft dezelfde hash als de server`() {
        // De server: sha256("krachtbal-demo:" + code.trim()) → eerste 32 hex-tekens (src/lib/demoruimte/toegang.ts).
        // De verwachte waarde is met dezelfde formule in Node berekend (createHash('sha256'), slice(0, 32)).
        assertEquals("65cd474f2f8dac18e89b1c187ade731b", DemoAccess.hash("geheim"))
        assertEquals(DemoAccess.hash("geheim"), DemoAccess.hash("  geheim "))
        assertFalse(DemoAccess.hash("geheim") == DemoAccess.hash("andere"))
    }

    @Test
    fun `het sessietoken komt uit de Set-Cookie-regels`() {
        val cookies = listOf(
            "demo-toegang=abc; Path=/; Max-Age=100",
            "payload-token=eyJhbGci.eyJpZCI.sig%2Bx; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800",
        )
        assertEquals("eyJhbGci.eyJpZCI.sig+x", DemoAccess.tokenFromCookies(cookies))
        // een leeg token (uitgelogd) of geen cookie = geen sessie
        assertNull(DemoAccess.tokenFromCookies(listOf("payload-token=; Path=/; Max-Age=0")))
        assertNull(DemoAccess.tokenFromCookies(emptyList()))
        assertNotNull(DemoAccess.tokenFromCookies(listOf("payload-token=abc")))
    }
}
