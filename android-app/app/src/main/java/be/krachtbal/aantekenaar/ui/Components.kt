package be.krachtbal.aantekenaar.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Een paneel zoals `.match-card` / `.btn` op de site: grafiet met zachte lichtval en een haarlijn. */
@Composable
fun Card(
    modifier: Modifier = Modifier,
    border: Color = Pal.Line,
    background: Color? = null,
    radius: Dp = Radius.card,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    Box(
        modifier
            .clip(shape)
            .then(if (background != null) Modifier.background(background) else Modifier.background(PanelGrad))
            .border(1.dp, border, shape)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier),
    ) { content() }
}

/** Waarschuwing zoals `.ssk-startklaar` / `.ssk-offline`: gekleurde rand, 10 % tint, vette titel. */
@Composable
fun Banner(
    title: String,
    text: String? = null,
    tint: Color = Pal.Warn,
    modifier: Modifier = Modifier,
    actions: @Composable (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier.fillMaxWidth().clip(shape).background(tint.copy(alpha = 0.10f)).border(1.dp, tint, shape).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, color = tint, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        if (text != null) Text(text, color = Pal.Text, fontSize = 13.sp, lineHeight = 17.sp)
        if (actions != null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { actions() }
    }
}

/** De knopsoorten van de site: primair (`.btn-primary`), gewoon (`.btn`) en gevaar (outline rood, `.ssk-btn.danger`). */
enum class Btn { Primary, Default, Danger }

@Composable
fun SmallButton(label: String, onClick: () -> Unit, kind: Btn = Btn.Primary, enabled: Boolean = true, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(Radius.control)
    val base = modifier.heightIn(min = 40.dp).alpha(if (enabled) 1f else 0.5f).clip(shape)
    val (styled, fg) = when (kind) {
        Btn.Primary -> base.background(AccentGrad).border(1.dp, mix(Pal.Accent, 0.8f, Color.White), shape) to Pal.Ink
        Btn.Default -> base.background(PanelGrad).border(1.dp, Pal.Line, shape) to Pal.Text
        Btn.Danger -> base.border(1.dp, Pal.Bad, shape) to Pal.Bad
    }
    Box(styled.clickable(enabled = enabled, role = Role.Button, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(label, color = fg, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 9.dp))
    }
}

/**
 * Selectie zoals op de site (`.myteams-pill.on`, `.match-toekomst-btn.on`, `.mdn-step.on`): een pil;
 * geselecteerd = vol ijsblauw met donkere, vette tekst; niet geselecteerd = paneel met haarlijn.
 */
@Composable
fun PillChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .heightIn(min = 36.dp)
            .clip(CircleShape)
            .background(if (selected) Pal.Accent else Pal.Card)
            .border(1.dp, if (selected) Pal.Accent else Pal.Line, CircleShape)
            .clickable(role = Role.Tab, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (selected) Pal.Ink else Pal.Text,
            fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.SemiBold,
            fontSize = 14.sp,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
        )
    }
}

/** Min/plus-knop van een teller (`.ssk-stat-btn`): doorzichtig met haarlijn, afgerond; de maat komt van de ruimte. */
@Composable
internal fun StepBtn(symbol: String, onClick: () -> Unit, enabled: Boolean, size: Dp = 46.dp) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        Modifier
            .size(size)
            .alpha(if (enabled) 1f else 0.3f)
            .clip(shape)
            .border(1.dp, Pal.Line, shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(symbol, color = Pal.Text, fontSize = (size.value * 0.48f).sp, fontWeight = FontWeight.Bold)
    }
}

/** Knop in een dialoog (`.ssk-modal .ssk-btn`): groot, 2 dp rand. */
@Composable
internal fun ModalBtn(label: String, kind: Btn, onClick: () -> Unit) {
    val shape = RoundedCornerShape(10.dp)
    val (bg, fg, border) = when (kind) {
        Btn.Primary -> Triple(Pal.Accent, Pal.Ink, Pal.Accent)
        Btn.Default -> Triple(Pal.Card, Pal.Text, Pal.Line)
        Btn.Danger -> Triple(Color.Transparent, Pal.Bad, Pal.Bad)
    }
    Box(
        Modifier.clip(shape).background(bg).border(2.dp, border, shape).clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = fg, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
    }
}

@Composable
fun ConfirmDialog(
    title: String,
    text: String,
    confirmLabel: String,
    danger: Boolean = false,
    /** Optioneel: "thuis · stand · uit" in het groot (`.ssk-confirm-score`), boven de tekst. */
    scoreLine: Triple<String, String, String>? = null,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Pal.Card,
        shape = RoundedCornerShape(Radius.cardLg),
        titleContentColor = Pal.Text,
        textContentColor = Pal.Dim,
        title = { Text(title, fontWeight = FontWeight.Bold, fontSize = 18.sp) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (scoreLine != null) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceEvenly) {
                        Text(scoreLine.first, color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                        Text(scoreLine.second, color = Pal.Accent, fontWeight = FontWeight.Black, fontSize = 32.sp, style = Num)
                        Text(scoreLine.third, color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                    }
                }
                Text(text, fontSize = 14.sp, lineHeight = 19.sp, textAlign = if (scoreLine != null) TextAlign.Center else TextAlign.Start)
            }
        },
        confirmButton = { ModalBtn(confirmLabel, if (danger) Btn.Danger else Btn.Primary, onConfirm) },
        dismissButton = { ModalBtn("Nee, terug", Btn.Default, onDismiss) },
    )
}

/** Een label-pil zoals `.badge-live`: gekleurd, 20 % tint, rand 50 %. */
@Composable
fun Pill(text: String, tint: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .clip(CircleShape)
            .background(mix(tint, 0.20f, Color(0xFF10141A)))
            .border(1.dp, tint.copy(alpha = 0.5f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) { Text(text, color = tint, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.5.sp, maxLines = 1) }
}

/** Status zoals `.ssk-status`: neutraal paneel; live in koraalrood. */
@Composable
fun StatusPill(text: String, live: Boolean = false, dimmed: Boolean = false, modifier: Modifier = Modifier) {
    val color = if (live) Pal.Pop else Pal.Text
    Box(
        modifier
            .alpha(if (dimmed) 0.7f else 1f)
            .clip(CircleShape)
            .background(Pal.Card)
            .border(1.dp, if (live) Pal.Pop else Pal.Line, CircleShape)
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) { Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp, maxLines = 1) }
}

@Composable
fun VSpace(h: Int) = Spacer(Modifier.height(h.dp))

@Composable
fun HSpace(w: Int) = Spacer(Modifier.width(w.dp))

/** `.page-title`: Sora, 1,5 rem. */
@Composable
fun Title(text: String, modifier: Modifier = Modifier) {
    Text(text, color = Pal.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold, style = DisplayStyle, modifier = modifier)
}

/** `.section-title`: kleine hoofdletters in dim met het accent-streepje ervoor. */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        Box(Modifier.width(22.dp).height(3.dp).clip(CircleShape).background(AccentGrad))
        Text(text.uppercase(), color = Pal.Dim, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.7.sp, style = DisplayStyle)
    }
}

@Composable
fun Dim(text: String, modifier: Modifier = Modifier) {
    Text(text, color = Pal.Dim, fontSize = 13.sp, lineHeight = 17.sp, modifier = modifier)
}

@Composable
fun CenterText(text: String, color: Color = Pal.Dim, modifier: Modifier = Modifier) {
    Text(text, color = color, fontSize = 14.sp, textAlign = TextAlign.Center, modifier = modifier.fillMaxWidth().padding(24.dp))
}
