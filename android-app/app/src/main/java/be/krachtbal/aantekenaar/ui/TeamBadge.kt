package be.krachtbal.aantekenaar.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.krachtbal.aantekenaar.data.LogoFit
import be.krachtbal.aantekenaar.data.Logos
import be.krachtbal.aantekenaar.data.initialsFor

/**
 * De clublogo-badge van de site (`TeamLogo` + team-logo.css): een witte ronde plaat met het logo netjes
 * ingepast, een ring in de clubkleur en een zachte schaduw. Zonder logo (of als het laden mislukt) staan
 * de initialen van de ploeg erin. [fit] is de zoom en verschuiving die de club zelf instelde.
 */
@Composable
fun TeamBadge(
    name: String,
    logoUrl: String?,
    fit: LogoFit?,
    ring: Color,
    size: Dp,
    modifier: Modifier = Modifier,
    /** Gloed in de clubkleur (de klok-badges); anders een gewone zachte schaduw. */
    glow: Color? = null,
) {
    val bmp: ImageBitmap? by produceState<ImageBitmap?>(initialValue = null, logoUrl) {
        value = if (logoUrl.isNullOrBlank()) null else Logos.load(logoUrl)
    }
    val shadowColor = glow ?: Color.Black.copy(alpha = 0.35f)
    val inner = size - 4.dp
    Box(
        modifier
            .size(size)
            .shadow(if (glow != null) 14.dp else 6.dp, CircleShape, ambientColor = shadowColor, spotColor = shadowColor)
            .background(ring, CircleShape) // de 2 dp ring (box-shadow: 0 0 0 2px)
            .padding(2.dp)
            .clip(CircleShape)
            .background(Color.White),
        contentAlignment = Alignment.Center,
    ) {
        val b = bmp
        if (b != null) {
            val px = with(LocalDensity.current) { inner.toPx() }
            Image(
                bitmap = b,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(inner * 0.03f)
                    .graphicsLayer {
                        // transform: translate(x%, y%) scale(zoom) — zoals logoFitStyle op de site
                        if (fit != null) {
                            scaleX = fit.zoom.toFloat()
                            scaleY = fit.zoom.toFloat()
                            translationX = (fit.offsetX / 100.0 * px).toFloat()
                            translationY = (fit.offsetY / 100.0 * px).toFloat()
                        }
                    },
            )
        } else {
            Text(
                initialsFor(name),
                color = Color(0xFF15352A),
                fontSize = (size.value * 0.42f).sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.02.sp,
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}

/** Het logo naast de klok (`.ssk-cl-logo`): een badge met een gekleurde halo en gloed in de clubkleur. */
@Composable
fun LogoHalo(name: String, logoUrl: String?, fit: LogoFit?, color: Color, size: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(size + 14.dp)
            .drawBehind {
                // radial-gradient(circle, club 30% → transparent 70%)
                drawCircle(
                    Brush.radialGradient(
                        listOf(color.copy(alpha = 0.30f), Color.Transparent),
                        radius = this.size.minDimension / 2f,
                    ),
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        TeamBadge(name, logoUrl, fit, ring = color.copy(alpha = 0.7f), size = size, glow = color.copy(alpha = 0.8f))
    }
}
