package be.krachtbal.aantekenaar.fed

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.util.Base64
import androidx.compose.foundation.Canvas as ComposeCanvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.ByteArrayOutputStream

/**
 * De getekende handtekening: een lijst streken in schermcoördinaten. Het vlak is wit (zoals een blad), de inkt zwart,
 * en het resultaat gaat als PNG (data-URL) naar de server, die ze op het wedstrijdblad zet.
 */
@Stable
class SignaturePadState {
    val strokes = mutableStateListOf<List<Offset>>()
    var current by mutableStateOf<List<Offset>>(emptyList())
    var size by mutableStateOf(IntSize.Zero)

    val hasInk: Boolean get() = strokes.isNotEmpty() || current.isNotEmpty()

    fun clear() {
        strokes.clear()
        current = emptyList()
    }

    /** De handtekening als `data:image/png;base64,…`, op een breedte van hoogstens 600 px; null als er niets getekend is. */
    fun toDataUrl(): String? {
        if (!hasInk || size.width <= 0 || size.height <= 0) return null
        val scale = minOf(1f, MAX_WIDTH / size.width)
        val w = (size.width * scale).toInt().coerceAtLeast(1)
        val h = (size.height * scale).toInt().coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = STROKE_PX * scale
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.BLACK; style = Paint.Style.FILL }
        for (stroke in strokes) {
            if (stroke.size == 1) {
                canvas.drawCircle(stroke[0].x * scale, stroke[0].y * scale, STROKE_PX * scale / 2f, dot)
                continue
            }
            val path = Path().apply {
                moveTo(stroke[0].x * scale, stroke[0].y * scale)
                for (i in 1 until stroke.size) lineTo(stroke[i].x * scale, stroke[i].y * scale)
            }
            canvas.drawPath(path, ink)
        }
        val bytes = ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        return "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    companion object {
        const val MAX_WIDTH = 600f
        const val STROKE_PX = 6f
    }
}

@Composable
fun SignaturePad(state: SignaturePadState, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF7F9FC))
            .border(2.dp, Color(0xFF9AA4B2), RoundedCornerShape(12.dp))
            .onSizeChanged { state.size = it }
            // Elke aanraking meteen consumeren: de pagina eronder mag niet gaan scrollen terwijl je tekent.
            .pointerInput(state) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    down.consume()
                    var path = listOf(down.position)
                    state.current = path
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull { it.id == down.id } ?: break
                        if (!change.pressed) break
                        path = path + change.position
                        state.current = path
                        change.consume()
                    }
                    state.strokes.add(path)
                    state.current = emptyList()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        ComposeCanvas(Modifier.fillMaxSize()) {
            val stroke = Stroke(width = SignaturePadState.STROKE_PX, cap = StrokeCap.Round, join = StrokeJoin.Round)
            fun draw(points: List<Offset>) {
                if (points.size == 1) {
                    drawCircle(Color.Black, radius = SignaturePadState.STROKE_PX / 2f, center = points[0])
                    return
                }
                val p = androidx.compose.ui.graphics.Path().apply {
                    moveTo(points[0].x, points[0].y)
                    for (i in 1 until points.size) lineTo(points[i].x, points[i].y)
                }
                drawPath(p, Color.Black, style = stroke)
            }
            state.strokes.forEach { draw(it) }
            if (state.current.isNotEmpty()) draw(state.current)
        }
        if (!state.hasInk) Text("Teken hier met je vinger", color = Color(0xFF9AA4B2), fontSize = 14.sp)
    }
}
