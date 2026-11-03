package be.krachtbal.aantekenaar

import be.krachtbal.aantekenaar.data.Field
import be.krachtbal.aantekenaar.data.MatchInfo
import be.krachtbal.aantekenaar.data.MatchState
import be.krachtbal.aantekenaar.data.Op
import be.krachtbal.aantekenaar.data.Overlay
import be.krachtbal.aantekenaar.data.Player
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.data.Sides
import be.krachtbal.aantekenaar.data.TeamInfo
import be.krachtbal.aantekenaar.fed.Played
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun p(id: Int, name: String, nr: Int = id) = Player(id, name, nr, teamId = 1)

private val squad = listOf(
    p(1, "Lars Lambrechts"), p(2, "Milan Smets"), p(3, "Jelle Jacobs"), p(4, "Ward Maes"),
    p(5, "Wout De Bruyne"), p(6, "Milan Dierickx"), p(7, "Lucas Hermans"),
)

class FieldTest {
    @Test
    fun `het veld is wat de server zegt, en anders de eerste vier van de selectie`() {
        assertEquals(listOf(1, 2, 3, 4), Field.resolve(squad, listOf(1, 2, 3, 4)).map { it.id })
        // de server weet nog niets: de eerste vier
        assertEquals(listOf(1, 2, 3, 4), Field.resolve(squad, emptyList()).map { it.id })
        // een speler die niet (meer) in de selectie zit, valt weg en wordt aangevuld
        assertEquals(listOf(1, 2, 3, 4), Field.resolve(squad, listOf(1, 2, 3, 99)).map { it.id })
        // een gewisselde opstelling blijft zoals ze is, in dezelfde volgorde
        assertEquals(listOf(1, 7, 3, 5), Field.resolve(squad, listOf(1, 7, 3, 5)).map { it.id })
    }

    @Test
    fun `met drie spelers spelen er drie, en nooit meer dan vier op het veld`() {
        val drie = squad.take(3)
        assertEquals(3, Field.wanted(drie))
        assertEquals(listOf(1, 2, 3), Field.resolve(drie, emptyList()).map { it.id })
        assertEquals(4, Field.resolve(squad, listOf(1, 2, 3, 4, 5, 6)).size)
    }

    @Test
    fun `de bank is de selectie min het veld`() {
        val veld = Field.resolve(squad, listOf(1, 2, 3, 4))
        assertEquals(listOf(5, 6, 7), Field.bench(squad, veld).map { it.id })
        assertTrue(Field.bench(squad.take(4), squad.take(4)).isEmpty())
    }

    @Test
    fun `een wissel vervangt een veldspeler op dezelfde plaats`() {
        val veld = Field.resolve(squad, listOf(1, 2, 3, 4))
        assertEquals(listOf(1, 7, 3, 4), Field.swap(veld, out = 2, into = 7))
        // niet mogelijk: de speler die eruit moet staat niet op het veld, of de speler die erin moet staat er al
        assertNull(Field.swap(veld, out = 5, into = 7))
        assertNull(Field.swap(veld, out = 2, into = 3))
    }

    @Test
    fun `de wissel-regels van de server leveren wie eruit ging`() {
        val notes = listOf(
            "#2 Milan Smets → #7 Lucas Hermans",
            "#4 Ward Maes → #5 Wout De Bruyne",
            "#7 Lucas Hermans → #2 Milan Smets", // hij ging er weer af
            "#99 Onbekend → #1 Lars Lambrechts", // niet te vinden: genegeerd
            "geen pijl hier",
        )
        assertEquals(listOf(2, 4, 7), Field.parseOuts(notes, squad))
        // twee spelers met dezelfde naam: liever niets dan de verkeerde
        val dubbel = squad + p(8, "milan smets")
        assertTrue(Field.parseOuts(listOf("#2 Milan Smets → #7 X"), dubbel).isEmpty())
        // hoofdletters en spaties maken niet uit
        assertEquals(listOf(6), Field.parseOuts(listOf("#6   milan dierickx  → #1 Y"), squad))
    }

    @Test
    fun `wie speelde is het slotveld plus iedereen die eruit ging`() {
        // start 1-2-3-4; 2 eruit voor 7; 4 eruit voor 5; 7 eruit voor 2 → slotveld 1-2-3-5
        val uitkomst = Played.fromEvents(
            roster = Sides(squad, squad.map { it.copy(id = it.id + 100) }),
            finalField = Sides(listOf(1, 2, 3, 5), listOf(101, 102, 103, 104)),
            notes = Sides(
                listOf("#2 Milan Smets → #7 Lucas Hermans", "#4 Ward Maes → #5 Wout De Bruyne", "#7 Lucas Hermans → #2 Milan Smets"),
                emptyList(),
            ),
        )
        assertEquals(setOf(1, 2, 3, 4, 5, 7), uitkomst.home) // 6 (Milan Dierickx) zat de hele tijd op de bank
        assertEquals(setOf(101, 102, 103, 104), uitkomst.away) // zonder wissels: enkel de vier veldspelers
    }

    @Test
    fun `wie niet op het blad staat telt niet mee`() {
        val uitkomst = Played.fromEvents(
            roster = Sides(squad.take(4), squad.take(4)),
            finalField = Sides(listOf(1, 2, 3, 99), listOf(1, 2, 3, 4)),
            notes = Sides(emptyList(), emptyList()),
        )
        assertEquals(setOf(1, 2, 3), uitkomst.home)
    }
}

class SubstitutionQueueTest {
    private fun state() = MatchState(
        match = MatchInfo(id = 43, status = "live"),
        teams = Sides(TeamInfo(1, "Thuis"), TeamInfo(2, "Uit")),
        lineup = Sides(listOf(1, 2, 3, 4), listOf(8, 9, 10, 11)),
    )

    private fun wissel(side: Side, ids: List<Int>) =
        Op(opId = "a", action = "setlineup", side = side.wire, playerIds = ids, tapWall = 0, tapElapsed = 0)

    @Test
    fun `een wissel in de wachtrij verandert het veld meteen, ook offline`() {
        val na = Overlay.apply(state(), listOf(wissel(Side.HOME, listOf(1, 7, 3, 4))))
        assertEquals(listOf(1, 7, 3, 4), na.lineup.home)
        assertEquals(listOf(8, 9, 10, 11), na.lineup.away) // de andere ploeg blijft
        // meerdere wissels na elkaar: de laatste telt
        val twee = Overlay.apply(state(), listOf(wissel(Side.HOME, listOf(1, 7, 3, 4)), wissel(Side.HOME, listOf(1, 7, 5, 4))))
        assertEquals(listOf(1, 7, 5, 4), twee.lineup.home)
    }

    @Test
    fun `de wissel gaat als lijst spelers naar de server`() {
        val body = wissel(Side.AWAY, listOf(8, 9, 10, 12)).toBody(0L) { it }.toString()
        assertTrue(body, body.contains("\"action\":\"setlineup\""))
        assertTrue(body, body.contains("\"side\":\"away\""))
        assertTrue(body, body.contains("\"playerIds\":[8,9,10,12]"))
        assertTrue(body, body.contains("\"opId\":\"a\"")) // heruitzenden blijft veilig
    }
}
