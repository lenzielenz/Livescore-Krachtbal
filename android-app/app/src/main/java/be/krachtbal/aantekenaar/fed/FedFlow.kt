package be.krachtbal.aantekenaar.fed

import androidx.compose.runtime.Composable
import be.krachtbal.aantekenaar.data.Side

/** Het scherm waar een stap naartoe gaat. `null` is de hub; "table" is het bestaande aantekenscherm (MainActivity). */
fun routeFor(step: StepId): String = when (step) {
    StepId.SELECTIE_THUIS -> "lineup:home"
    StepId.SELECTIE_UIT -> "lineup:away"
    StepId.CONTROLE -> "ref:controle"
    StepId.KEURING -> "ref:keuring"
    StepId.VRIJGAVE -> "ref:vrijgave"
    StepId.AANTEKENEN -> "table"
    StepId.WIE_SPEELDE -> "deelname"
    StepId.AFTEKENEN, StepId.INDIENEN -> "aftekenen"
}

/**
 * De schermen van de wedstrijddag in de federatie-app: de hub, en van daaruit het scherm van elke stap. Terug (ook de
 * terugknop van Android) gaat altijd naar de hub; van de hub naar de lijst.
 */
@Composable
fun FedFlow(
    matchId: Int,
    route: String?,
    setRoute: (String?) -> Unit,
    onBackToList: () -> Unit,
    onSettings: () -> Unit,
    onMeldingen: () -> Unit = {},
    ongelezen: Int = 0,
) {
    val toHub = { setRoute(null) }
    when {
        route == null -> MatchDayScreen(matchId, onBack = onBackToList, onOpenStep = { setRoute(routeFor(it)) }, onSettings = onSettings, onMeldingen = onMeldingen, ongelezen = ongelezen)
        route.startsWith("lineup:") -> LineupScreen(matchId, Side.fromWire(route.removePrefix("lineup:")) ?: Side.HOME, "", onBack = toHub)
        route.startsWith("ref:") -> RefereeScreen(matchId, route.removePrefix("ref:"), onBack = toHub, onEditLineup = { setRoute("lineup:${it.wire}") })
        route == "deelname" -> DeelnameScreen(matchId, onBack = toHub)
        route == "aftekenen" -> AftekenenScreen(matchId, onBack = toHub)
        else -> MatchDayScreen(matchId, onBack = onBackToList, onOpenStep = { setRoute(routeFor(it)) }, onSettings = onSettings, onMeldingen = onMeldingen, ongelezen = ongelezen)
    }
}
