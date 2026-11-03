package be.krachtbal.aantekenaar.ui

import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import be.krachtbal.aantekenaar.R

// De lettertypes van de site (layout.tsx): Inter voor tekst en cijfers, Sora voor titels en het merk.
// Beide onder de SIL Open Font License; meegeleverd als variabele fonts (res/font).

@OptIn(ExperimentalTextApi::class)
private fun inter(weight: Int) = Font(
    R.font.inter_variable,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

@OptIn(ExperimentalTextApi::class)
private fun sora(weight: Int) = Font(
    R.font.sora_variable,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val InterFamily = FontFamily(inter(400), inter(500), inter(600), inter(700), inter(800), inter(900))
val SoraFamily = FontFamily(sora(600), sora(700), sora(800))
