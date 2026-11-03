package be.krachtbal.aantekenaar.fed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.krachtbal.aantekenaar.ui.AuroraBackdrop
import be.krachtbal.aantekenaar.ui.Banner
import be.krachtbal.aantekenaar.ui.Card
import be.krachtbal.aantekenaar.ui.Dim
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.Title
import be.krachtbal.aantekenaar.ui.VSpace
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * De status van één actie op een scherm: bezig, de foutmelding van de server, of een bevestiging. Een tweede tik
 * terwijl de eerste nog loopt wordt genegeerd — een handtekening of vrijgave mag nooit dubbel gaan.
 */
@Stable
class ActionState {
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
    var info by mutableStateOf<String?>(null)

    fun clear() {
        error = null
        info = null
    }

    /** Voert [call] uit; bij een succes [onOk] (bv. herladen), bij een weigering komt de tekst van de server in [error]. */
    fun run(scope: CoroutineScope, call: suspend () -> Act, onOk: suspend (Act.Ok) -> Unit = {}) {
        if (busy) return
        busy = true
        clear()
        scope.launch {
            try {
                when (val r = call()) {
                    is Act.Ok -> onOk(r)
                    is Act.Fail -> error = r.message
                }
            } finally {
                busy = false
            }
        }
    }
}

@Composable
fun rememberActionState(): ActionState = remember { ActionState() }

/** Toont de fout of bevestiging van een actie. */
@Composable
fun Feedback(a: ActionState) {
    a.error?.let { Banner("Het lukte niet", it, tint = Pal.Bad) }
    a.info?.let { Banner(it, tint = Pal.Ok) }
}

/**
 * Het kader van een stap-scherm: de aurora-achtergrond, een terugknop en titel, en een scrollende inhoud. [bottom] is
 * een vaste balk onderaan (de knoppen van het scherm) die niet mee scrolt.
 */
@Composable
fun FedScaffold(
    title: String,
    subtitle: String? = null,
    onBack: () -> Unit,
    onRefresh: (() -> Unit)? = null,
    bottom: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    AuroraBackdrop {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("← Terug", color = Pal.Accent, fontWeight = FontWeight.Bold) }
                Box(Modifier.weight(1f))
                if (onRefresh != null) TextButton(onClick = onRefresh) { Text("↻", color = Pal.Accent, fontSize = 20.sp) }
            }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Title(title)
                subtitle?.let { Dim(it) }
                content()
                VSpace(16)
            }
            if (bottom != null) {
                Box(Modifier.fillMaxWidth().background(Pal.Bg2).padding(horizontal = 16.dp, vertical = 10.dp)) { bottom() }
            }
        }
    }
}

/**
 * Een inklapbaar blok: titel met een korte samenvatting ("✓ 14 van 14"), open of dicht. Op een telefoon past zo de
 * hele scheidsrechterspagina op het scherm; wie aan de beurt is, staat open.
 */
@Composable
fun Section(
    title: String,
    summary: String? = null,
    done: Boolean = false,
    open: Boolean,
    onToggle: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(Modifier.fillMaxWidth(), border = if (open) Pal.Accent.copy(alpha = 0.5f) else Pal.Line, radius = 14.dp) {
        Column {
            Row(
                Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onToggle).padding(horizontal = 14.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    Modifier.size(22.dp).clip(CircleShape).background(if (done) Pal.Ok else Color.Transparent).border(2.dp, if (done) Pal.Ok else Pal.Line, CircleShape),
                    contentAlignment = Alignment.Center,
                ) { if (done) Text("✓", color = Pal.Ink, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold) }
                Column(Modifier.weight(1f)) {
                    Text(title, color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    summary?.let { Text(it, color = Pal.Dim, fontSize = 12.sp) }
                }
                Text(if (open) "▾" else "▸", color = Pal.Dim, fontSize = 16.sp)
            }
            if (open) Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
        }
    }
}

/** Een eenvoudig rondje om aan te vinken (geselecteerd = vol groen met een vinkje). */
@Composable
fun Tick(checked: Boolean, enabled: Boolean = true, size: Int = 26) {
    val shape = CircleShape
    Box(
        Modifier.size(size.dp).clip(shape).background(if (checked) Pal.Ok else Color.Transparent).border(2.dp, if (checked) Pal.Ok else if (enabled) Pal.Dim else Pal.Line, shape),
        contentAlignment = Alignment.Center,
    ) { if (checked) Text("✓", color = Pal.Ink, fontSize = (size * 0.5f).sp, fontWeight = FontWeight.ExtraBold) }
}

/** Een gewoon invoerveld in de stijl van de app. */
@Composable
fun FedField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    enabled: Boolean = true,
) {
    androidx.compose.material3.OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = singleLine,
        enabled = enabled,
        shape = RoundedCornerShape(11.dp),
        colors = be.krachtbal.aantekenaar.ui.fieldColors(),
        modifier = modifier.fillMaxWidth(),
    )
}
