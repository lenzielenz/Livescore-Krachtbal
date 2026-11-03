package be.krachtbal.aantekenaar.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.background
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Het kleurenschema, de radii en de selectie-stijl van de WEBSITE, 1-op-1 overgenomen uit
// src/app/(frontend)/styles.css (:root) en scorekeeper/[id]/simple-scorekeeper.css.
// Wijzigt de site haar tokens, pas ze dan HIER aan: dan blijft de app herkenbaar.
// ──────────────────────────────────────────────────────────────────────────────────────────────
object Pal {
    // Achtergronden en panelen: "antraciet + ijsblauw"
    val Base = Color(0xFF070809) // body background-color
    val Bg = Color(0xFF090A0C) // --bg
    val Bg2 = Color(0xFF0F1116) // --bg-2
    val Card = Color(0xFF16181E) // --panel
    val CardHi = Color(0xFF20242D) // --panel-2
    val Line = Color(0xFF2E333D) // --line

    // Tekst
    val Text = Color(0xFFF7F9FC) // --txt
    val Dim = Color(0xFF9AA4B2) // --dim
    val DimStrong = Color(0xFFCAD2DC) // --dim-strong

    // Accenten
    val Accent = Color(0xFF6FB2FF) // --accent (ijsblauw)
    val Accent2 = Color(0xFF4D8FF0) // --accent-2
    val AccentLight = Color(0xFFAED4FF) // begin van --grad-accent
    val Home = Color(0xFF0FE0A6) // --home (ok / klaar / live-badge)
    val Away = Color(0xFF4CC9F0) // --away
    val Pop = Color(0xFFFF5D6C) // --pop (koraalrood: live)
    val Pop2 = Color(0xFFB07BFF)

    // Status
    val Bad = Color(0xFFEF476F) // .ssk-btn.danger, .ssk-error
    val Warn = Color(0xFFF6C544) // .ssk-offline / .ssk-startklaar
    val Ok = Home

    // Tekst op accentvlakken en op de +1-knop
    val Ink = Color(0xFF06140D)
    val InkDark = Color(0xFF0E1014)

    // Standaardkleuren van een ploeg zonder clubkleuren (lib/club-colors.ts)
    val DefaultHome = Color(0xFF06D6A0)
    val DefaultAway = Color(0xFF4CC9F0)
}

/** Radius-schaal van de site: --r-control, --r-card, --r-card-lg. */
object Radius {
    val control = 11.dp
    val card = 14.dp
    val cardLg = 16.dp
}

/** `color-mix(in srgb, a aPct, b)`. */
fun mix(a: Color, aPct: Float, b: Color): Color = lerp(b, a, aPct)

/** `--panel-grad`: een grafiet-paneel met een zachte lichtval. */
val PanelGrad: Brush = Brush.linearGradient(
    colors = listOf(mix(Pal.CardHi, 0.78f, Pal.Card), Pal.Card),
    start = Offset.Zero,
    end = Offset(900f, 1400f),
)

/** `--grad-accent`: het merkverloop van knoppen. */
val AccentGrad: Brush = Brush.linearGradient(
    colors = listOf(Pal.AccentLight, Pal.Accent, Pal.Accent2),
    start = Offset.Zero,
    end = Offset(500f, 300f),
)

private val Scheme = darkColorScheme(
    primary = Pal.Accent,
    onPrimary = Pal.Ink,
    secondary = Pal.Warn,
    onSecondary = Pal.InkDark,
    background = Pal.Bg,
    onBackground = Pal.Text,
    surface = Pal.Card,
    onSurface = Pal.Text,
    surfaceVariant = Pal.CardHi,
    onSurfaceVariant = Pal.Dim,
    outline = Pal.Line,
    error = Pal.Bad,
)

/** Standaardtekst = Inter zonder de ruime Material-regelafstand (de site gebruikt line-height ≈ 1.15–1.4). */
private val AppTypography = Typography(
    bodyLarge = TextStyle(fontFamily = InterFamily, letterSpacing = 0.sp, lineHeight = TextUnit.Unspecified),
)

@Composable
fun AantekenaarTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, typography = AppTypography, content = content)
}

/** Tabulaire cijfers (`font-variant-numeric: tabular-nums`): de klok en scores springen niet heen en weer. */
val Num = TextStyle(fontFeatureSettings = "tnum")

/** Titels in Sora met de strakke tracking van de site (letter-spacing -0.015em). */
val DisplayStyle = TextStyle(fontFamily = SoraFamily, letterSpacing = (-0.015).sp)

// ── Clubkleuren: exact dezelfde logica als src/lib/club-colors.ts ───────────────────────────────

/** "#rrggbb" naar Color; ongeldig → null. */
fun parseHex(s: String?): Color? {
    if (s.isNullOrBlank()) return null
    return try {
        Color(android.graphics.Color.parseColor(if (s.startsWith("#")) s else "#$s"))
    } catch (_: Exception) {
        null
    }
}

private fun channel(v: Int): Double {
    val c = v / 255.0
    return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
}

/** Relatieve luminantie (WCAG), 0 (zwart) … 1 (wit). */
fun relativeLuminance(c: Color): Double {
    val r = (c.red * 255).roundToInt()
    val g = (c.green * 255).roundToInt()
    val b = (c.blue * 255).roundToInt()
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Een (mogelijk donkere) clubkleur lichter maken tot minstens 3:1 contrast tegen het donkere paneel,
 * zodat een navy of zwart crest de score of ploegnaam niet onzichtbaar maakt (club-colors.ts).
 */
fun readableOnDark(c: Color, panelLum: Double = 0.02): Color {
    var r = (c.red * 255).roundToInt()
    var g = (c.green * 255).roundToInt()
    var b = (c.blue * 255).roundToInt()
    var guard = 0
    while ((relativeLuminance(Color(r, g, b)) + 0.05) / (panelLum + 0.05) < 3 && guard++ < 16) {
        r = min(255, r + 20)
        g = min(255, g + 20)
        b = min(255, b + 20)
    }
    return Color(r, g, b)
}

/** Leesbare inkt op een gevulde achtergrond: donker op licht, wit op donker (`inkOn`). */
fun inkOn(c: Color): Color = if (relativeLuminance(c) > 0.4) Pal.Ink else Color.White

/** Zelfde als [inkOn]; naam uit de eerste versie van de app. */
fun onTeam(c: Color): Color = inkOn(c)

// ── Achtergronden ───────────────────────────────────────────────────────────────────────────────

private fun androidx.compose.ui.graphics.drawscope.DrawScope.glow(color: Color, alpha: Float, cx: Float, cy: Float, radius: Float) {
    drawRect(
        brush = Brush.radialGradient(
            colors = listOf(color.copy(alpha = alpha), Color.Transparent),
            center = Offset(cx, cy),
            radius = max(1f, radius),
        ),
    )
}

/**
 * De "aurora" van de site (body-achtergrond): bijna-zwart met ijsblauwe gloed bovenaan, groen en
 * blauw in de hoeken en een koraalrode gloed rechtsonder.
 */
@Composable
fun AuroraBackdrop(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier
            .fillMaxSize()
            .background(Pal.Base)
            .drawBehind {
                drawRect(Brush.verticalGradient(listOf(Color(0xFF0C0E12), Pal.Base)))
                val w = size.width
                val h = size.height
                glow(Pal.Accent, 0.21f, w * 0.5f, -h * 0.05f, w * 1.0f)
                glow(Pal.Home, 0.13f, w * 0.04f, h * 0.02f, w * 0.75f)
                glow(Pal.Away, 0.18f, w * 0.97f, h * 0.01f, w * 0.75f)
                glow(Pal.Pop, 0.15f, w * 0.88f, h * 0.92f, w * 0.7f)
            },
        content = content,
    )
}

/**
 * De achtergrond van de aantekentafel (`.ssk::before`): donker groen met een gloed in de clubkleur
 * van thuis links en uit rechts.
 */
@Composable
fun ScoreboardBackdrop(home: Color, away: Color, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier
            .fillMaxSize()
            .background(Color(0xFF050F0A))
            .drawBehind {
                drawRect(Brush.verticalGradient(listOf(Color(0xFF07170E), Color(0xFF050F0A))))
                val w = size.width
                val h = size.height
                glow(Pal.Accent, 0.07f, w * 0.5f, -h * 0.1f, w * 0.95f)
                glow(home, 0.20f, 0f, h * 0.42f, w * 0.62f)
                glow(away, 0.20f, w, h * 0.42f, w * 0.62f)
            },
        content = content,
    )
}
