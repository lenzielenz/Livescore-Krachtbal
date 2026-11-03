package be.krachtbal.aantekenaar.data

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest
import kotlin.math.max

/**
 * Clublogo's ophalen en bewaren. Drie lagen, zodat een logo er altijd is, ook zonder internet:
 *  1. geheugen (de badges op het scherm),
 *  2. schijf (`cacheDir/logos`, 7 dagen vers, daarna eerst opnieuw proberen en bij falen het oude gebruiken),
 *  3. het platform zelf (`/api/clublogo`, dat op zijn beurt een bewaarde kopie geeft).
 * Lukt niets, dan toont de badge de initialen (zoals de site).
 */
object Logos {
    // Het geheugen telt in BYTES, niet in aantal logo's: 48 logo's van 512×512 px waren tot 48 MB.
    private const val MEM_BYTES = 6 * 1024 * 1024
    private val mem = object : LruCache<String, ImageBitmap>(MEM_BYTES) {
        override fun sizeOf(key: String, value: ImageBitmap): Int = value.width * value.height * 4
    }
    private val failedAt = HashMap<String, Long>()
    private val inflight = HashMap<String, Deferred<ImageBitmap?>>()
    private const val RETRY_FAILED_MS = 10 * 60_000L
    private const val FRESH_MS = 7 * 24 * 3_600_000L

    // De grootste badge (naast de klok) is ~64 dp: 256 px dekt dat ook op een tablet. Groter decoderen is verspilling.
    private const val MAX_SIDE = 256

    /**
     * Eén logo, ook als tientallen badges er tegelijk om vragen (dezelfde club staat vaak in meerdere rijen):
     * dan loopt er maar één ophaalronde, en wachten de anderen op diezelfde uitkomst.
     */
    suspend fun load(raw: String?): ImageBitmap? {
        val url = logoSource(raw, Graph.auth.serverUrl) ?: return null
        mem.get(url)?.let { return it }
        failedAt[url]?.let { if (Time.elapsed() - it < RETRY_FAILED_MS) return null }
        // LAZY: pas starten bij de eerste await, ná het opslaan in `inflight` — anders kon een meteen
        // klaar zijn (bv. ongeldige url) vóór de opruiming en bleef een afgeronde taak eeuwig staan.
        val job = inflight.getOrPut(url) {
            Graph.scope.async(start = CoroutineStart.LAZY) {
                try {
                    fetchAndDecode(url)
                } finally {
                    inflight.remove(url)
                }
            }
        }
        return job.await()
    }

    private suspend fun fetchAndDecode(url: String): ImageBitmap? {

        val file = File(File(Graph.app.cacheDir, "logos"), sha1(url))
        val onDisk: ByteArray? = withContext(Dispatchers.IO) { runCatching { if (file.exists()) file.readBytes() else null }.getOrNull() }
        val fresh = onDisk != null && System.currentTimeMillis() - file.lastModified() < FRESH_MS

        var bytes = if (fresh) onDisk else null
        if (bytes == null) {
            val net = Graph.api.fetchBytes(url)
            if (net != null) {
                bytes = net
                withContext(Dispatchers.IO) {
                    runCatching {
                        file.parentFile?.mkdirs()
                        file.writeBytes(net)
                    }
                }
            } else {
                bytes = onDisk // oud is beter dan niets
            }
        }

        val bmp = bytes?.let { withContext(Dispatchers.Default) { decode(it) } }
        if (bmp == null) {
            failedAt[url] = Time.elapsed()
            // Een beschadigd bestand op schijf niet blijven hergebruiken.
            if (bytes != null) withContext(Dispatchers.IO) { runCatching { file.delete() } }
            return null
        }
        failedAt.remove(url)
        mem.put(url, bmp)
        return bmp
    }

    /** Verkleint (inSampleSize) tot hooguit [MAX_SIDE] px: een badge is nooit groter dan een paar honderd px. */
    private fun decode(b: ByteArray): ImageBitmap? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(b, 0, b.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            null // geen afbeelding, of een SVG (niet te decoderen) → initialen
        } else {
            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / sample > MAX_SIDE) sample *= 2
            BitmapFactory.decodeByteArray(b, 0, b.size, BitmapFactory.Options().apply { inSampleSize = sample })?.asImageBitmap()
        }
    } catch (_: Throwable) {
        null
    }

    private fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}

/**
 * Alle clubs met hun logo en clubkleur, één keer per sessie opgehaald en op schijf bewaard (offline
 * blijven de logo's in de wedstrijdlijst dus staan). De lijst heeft enkel het club-id van elke ploeg.
 */
object ClubDirectory {
    private val _clubs = MutableStateFlow<Map<Int, ClubLook>>(emptyMap())
    val clubs: StateFlow<Map<Int, ClubLook>> = _clubs.asStateFlow()

    private var loading = false
    private var loadedAt = 0L
    private const val REFRESH_MS = 6 * 3_600_000L

    fun ensureLoaded() {
        if (loading) return
        if (_clubs.value.isNotEmpty() && Time.elapsed() - loadedAt < REFRESH_MS) return
        loading = true
        Graph.scope.launch {
            try {
                val file = File(Graph.app.filesDir, "clubs.json")
                if (_clubs.value.isEmpty()) {
                    withContext(Dispatchers.IO) {
                        runCatching {
                            if (file.exists()) {
                                AppJson.decodeFromString<List<ClubLook>>(file.readText()).associateBy { it.id }
                            } else {
                                null
                            }
                        }.getOrNull()
                    }?.let { _clubs.value = it }
                }
                Graph.api.fetchClubs()?.let { list ->
                    _clubs.value = list.associateBy { it.id }
                    loadedAt = Time.elapsed()
                    withContext(Dispatchers.IO) {
                        runCatching { file.writeText(AppJson.encodeToString(kotlinx.serialization.builtins.ListSerializer(ClubLook.serializer()), list)) }
                    }
                }
            } finally {
                loading = false
            }
        }
    }
}
