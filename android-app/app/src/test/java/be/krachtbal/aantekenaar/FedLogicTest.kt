package be.krachtbal.aantekenaar

import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.fed.LineupInfo
import be.krachtbal.aantekenaar.fed.LineupModel
import be.krachtbal.aantekenaar.fed.LineupRow
import be.krachtbal.aantekenaar.fed.MatchFacts
import be.krachtbal.aantekenaar.fed.Officials
import be.krachtbal.aantekenaar.fed.RosterPlayer
import be.krachtbal.aantekenaar.fed.SheetView
import be.krachtbal.aantekenaar.fed.Signature
import be.krachtbal.aantekenaar.fed.StepId
import be.krachtbal.aantekenaar.fed.StepState
import be.krachtbal.aantekenaar.fed.Steps
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OfficialsTest {
    private val ok = mapOf(
        "aantekenaar" to "Tina Tafel", "tijdopnemer" to "Marc Peeters", "grensrechterThuis" to "Jan Claes",
        "grensrechterUit" to "Piet Maes", "terreinafgevaardigde" to "Luc Wouters", "coachThuis" to "Chris Coeck", "coachUit" to "Bart Aerts",
    )

    @Test
    fun `wat verplicht is hangt af van het reekstype`() {
        assertEquals(Officials.Type.NATIONAAL, Officials.type("1NAH"))
        assertEquals(Officials.Type.JEUGD, Officials.type("U14J"))
        assertEquals(Officials.Type.LANDELIJK, Officials.type("RHA"))
        assertEquals(listOf("aantekenaar", "tijdopnemer", "grensrechterThuis"), Officials.required("RHA"))
        assertEquals(7, Officials.required("2NAH").size)
        assertTrue(Officials.required(null).isEmpty())
    }

    @Test
    fun `naam en voornaam zijn allebei nodig`() {
        assertFalse(Officials.isVolledigeNaam("Janssens"))
        assertFalse(Officials.isVolledigeNaam("J. J."))
        assertFalse(Officials.isVolledigeNaam("   "))
        assertFalse(Officials.isVolledigeNaam(null))
        assertTrue(Officials.isVolledigeNaam("Jan Janssens"))
        assertTrue(Officials.isVolledigeNaam("  Marie-Claire  De Smet "))
    }

    @Test
    fun `een compleet blad is in orde en een leeg blad niet`() {
        assertTrue(Officials.validate("RHA", ok).isEmpty())
        assertTrue(Officials.validate("1NAH", ok).isEmpty())
        val leeg = Officials.validate("RHA", emptyMap())
        assertEquals(3, leeg.size) // aantekenaar, tijdopnemer, grensrechter thuis
        assertTrue(leeg.first().contains("Aantekenaar"))
        // een nationale reeks mist coaches en een tweede grensrechter
        assertEquals(7, Officials.validate("1NAH", emptyMap()).size)
        // een ingevulde maar onvolledige naam telt als fout, ook als hij niet verplicht is
        assertTrue(Officials.validate("RHA", ok + ("coachThuis" to "Coeck")).any { it.contains("Coach (thuis)") })
    }

    @Test
    fun `een coach mag geen grensrechter zijn`() {
        val conflict = ok + ("coachThuis" to "jan claes")
        assertEquals(Officials.FieldStatus.CONFLICT, Officials.status("coachThuis", conflict))
        assertTrue(Officials.validate("1NAH", conflict).any { it.contains("art. 25") })
        assertEquals(Officials.FieldStatus.OK, Officials.status("coachUit", conflict))
    }

    private fun rows(n: Int) = (1..n).map { LineupRow(player = it, rugnummer = it, deelgenomen = true, gecontroleerd = true) }

    private fun getekend(officials: Map<String, String>) = SheetView(
        id = 1, status = "af_te_tekenen", home = rows(7), away = rows(7), homeConfirmed = true, awayConfirmed = true,
        keuring = emptyMap(), keuringBevestigd = true, officials = officials,
        startAkkoord = true, startNaam = null, eindeAkkoord = false, forfait = "geen",
        kapiteinThuis = Signature(true, "A"), kapiteinUit = Signature(true, "B"), scheidsrechter = Signature(true, "C"),
        assignedReferee = 1, backupReferee = null,
    )

    @Test
    fun `indienen wacht tot de officials in orde zijn`() {
        val fin = MatchFacts("finished", home = "A", away = "B", reeks = "RHA")
        // alles getekend maar zonder officials kan het blad nog niet in
        val zonder = Steps.plan(fin, getekend(emptyMap()))
        val indienen = zonder.first { it.id == StepId.INDIENEN }
        assertEquals(StepState.WAIT, indienen.state)
        assertTrue(indienen.detail!!.startsWith("officials aanvullen"))
        // met officials: klaar om in te dienen
        assertEquals(StepState.TODO, Steps.plan(fin, getekend(ok)).first { it.id == StepId.INDIENEN }.state)
    }
}

class LineupModelTest {
    private fun player(id: Int, nr: Int?) =
        RosterPlayer(id, "Speler $id", nr, "ok", emptyList(), suggested = false, geleendVan = null, knipjes = null)

    private fun info(current: List<Pair<Int, Int?>>, players: Int, kapitein: Int? = null) = LineupInfo(
        teamId = 1, teamName = "Thuis", category = "senioren",
        players = (1..players).map { player(it, it) }, favorites = emptySet(), status = "concept",
        current = current, confirmed = false, kapitein = kapitein, vergrendeld = null,
    )

    private fun model(current: List<Pair<Int, Int?>> = emptyList(), players: Int = 10): LineupModel =
        LineupModel(43, Side.HOME).also { it.applyInfo(info(current, players)) }

    @Test
    fun `een speler kiezen geeft hem zijn eigen rugnummer, of het eerste vrije`() {
        val m = model(current = listOf(3 to 3))
        m.toggle(5)
        assertEquals(listOf(3 to 3, 5 to 5), m.ui.value.picked.map { it.player to it.rugnummer })
        // zijn nummer is bezet → het eerste vrije nummer
        val m2 = model(current = listOf(9 to 5))
        m2.toggle(5)
        assertEquals(1, m2.ui.value.picked.first { it.player == 5 }.rugnummer)
        assertTrue(m2.ui.value.dirty)
    }

    @Test
    fun `hoogstens acht spelers`() {
        val m = model(players = 12)
        (1..12).forEach { m.toggle(it) }
        assertEquals(8, m.ui.value.picked.size)
        assertFalse(m.ui.value.canAdd)
        m.toggle(1) // deselecteren kan wel
        assertEquals(7, m.ui.value.picked.size)
    }

    @Test
    fun `de kapitein moet in de selectie staan en valt weg met zijn speler`() {
        val m = model(current = listOf(1 to 1, 2 to 2))
        m.setKapitein(7) // niet gekozen: genegeerd
        assertNull(m.ui.value.kapitein)
        m.setKapitein(2)
        assertEquals(2, m.ui.value.kapitein)
        m.toggle(2) // speler eruit: geen kapitein meer
        assertNull(m.ui.value.kapitein)
    }

    @Test
    fun `dubbele rugnummers worden gesignaleerd en blijven tussen 1 en 99`() {
        val m = model(current = listOf(1 to 4, 2 to 5))
        assertTrue(m.ui.value.duplicates.isEmpty())
        m.bump(2, -1) // 5 wordt 4
        assertEquals(setOf(4), m.ui.value.duplicates)
        m.bump(2, 1)
        assertTrue(m.ui.value.duplicates.isEmpty())
        m.bump(1, -10)
        assertEquals(1, m.ui.value.picked.first { it.player == 1 }.rugnummer)
        m.bump(1, 500)
        assertEquals(99, m.ui.value.picked.first { it.player == 1 }.rugnummer)
    }

    @Test
    fun `een nieuwe stand van de server wist het niet-opgeslagen`() {
        val m = model(current = listOf(1 to 1))
        m.toggle(2)
        assertTrue(m.ui.value.dirty)
        m.applyInfo(info(listOf(1 to 1, 2 to 2), players = 10, kapitein = 1))
        assertFalse(m.ui.value.dirty)
        assertEquals(2, m.ui.value.picked.size)
        assertEquals(1, m.ui.value.kapitein)
    }
}
