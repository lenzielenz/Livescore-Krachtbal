package be.krachtbal.aantekenaar.fed

import be.krachtbal.aantekenaar.data.Field
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.Player
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.data.Sides

/**
 * Wie speelde? De tafel houdt bij wie er op het veld staat en logt elke wissel op het blad. Wie op het einde op het veld
 * staat of er tijdens de wedstrijd afging, speelde; wie de hele tijd op de bank zat, niet. Zo hoeft de scheidsrechter dat
 * na afloop niet meer aan te duiden: hij ziet het voorgevuld en bevestigt met één tik (dat telt voor het vastspelen en het
 * referendum, dus de bevestiging blijft aan hem).
 */
object Played {
    /**
     * Pure berekening. [roster] = de spelers op het blad per kant; [finalField] = de veldspelers op het einde (`MatchState.lineup`);
     * [notes] = de wissel-regels per kant (`#nr naam → #nr naam`). Het resultaat bevat enkel spelers van het blad.
     */
    fun fromEvents(roster: Sides<List<Player>>, finalField: Sides<List<Int>>, notes: Sides<List<String>>): Sides<Set<Int>> {
        fun side(s: Side): Set<Int> {
            val onSheet = roster[s].map { it.id }.toSet()
            val outs = Field.parseOuts(notes[s], roster[s])
            return Field.played(finalField[s], outs).filter { it in onSheet }.toSet()
        }
        return Sides(side(Side.HOME), side(Side.AWAY))
    }

    /**
     * Berekent wie speelde voor deze wedstrijd. Null als het blad of de namen ontbreken (dan kan de scheidsrechter het nog
     * altijd zelf aanduiden). Een wedstrijd zonder wissels geeft gewoon de 4 veldspelers per ploeg.
     */
    suspend fun compute(ui: HubModel.UI): Sides<Set<Int>>? {
        val st = ui.state ?: return null
        val sheet = ui.sheet ?: return null
        fun roster(s: Side): List<Player> = sheet.lineup(s).map { r ->
            Player(id = r.player, name = ui.nameOf(s, r.player) ?: return emptyList(), shirtNumber = r.rugnummer ?: 0, teamId = st.teams[s].id)
        }
        val rosters = Sides(roster(Side.HOME), roster(Side.AWAY))
        if (rosters.home.isEmpty() && rosters.away.isEmpty()) return null
        val subs = Graph.api.fetchSubstitutions(st.match.id)
        fun notes(s: Side) = subs.filter { it.teamId == st.teams[s].id }.map { it.note }
        return fromEvents(rosters, st.lineup, Sides(notes(Side.HOME), notes(Side.AWAY)))
    }
}
