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
        val rosters = rosters(ui) ?: return null
        val subs = Graph.api.fetchSubstitutions(st.match.id)
        fun notes(s: Side) = subs.filter { it.teamId == st.teams[s].id }.map { it.note }
        return fromEvents(rosters, st.lineup, Sides(notes(Side.HOME), notes(Side.AWAY)))
    }

    /**
     * De spelers op het blad per kant, met hun naam. Eén naam die we niet kennen (een speler die niet meer bij de ploeg
     * hoort, of een lijst die niet laadde) en we geven op: wie eruit gewisseld werd, herkennen we aan zijn naam, en een
     * halve berekening zou een hele ploeg als "niemand speelde" wegschrijven. Dan duidt de scheidsrechter het zelf aan.
     */
    internal fun rosters(ui: HubModel.UI): Sides<List<Player>>? {
        val st = ui.state ?: return null
        val sheet = ui.sheet ?: return null
        fun roster(s: Side): List<Player>? {
            val out = ArrayList<Player>()
            for (r in sheet.lineup(s)) {
                val name = ui.nameOf(s, r.player) ?: return null
                out += Player(id = r.player, name = name, shirtNumber = r.rugnummer ?: 0, teamId = st.teams[s].id)
            }
            return out
        }
        val home = roster(Side.HOME) ?: return null
        val away = roster(Side.AWAY) ?: return null
        if (home.isEmpty() && away.isEmpty()) return null
        return Sides(home, away)
    }
}
