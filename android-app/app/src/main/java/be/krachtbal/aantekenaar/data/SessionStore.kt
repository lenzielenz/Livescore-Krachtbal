package be.krachtbal.aantekenaar.data

import kotlinx.serialization.Serializable
import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Alles wat een aantekensessie moet overleven: de laatst bevestigde serverstand, de klok, de
 * wachtrij en de geweigerde acties. Wordt na ELKE wijziging weggeschreven, vóór de gebruiker de tik
 * als "gedaan" ziet: een app die gedood wordt (geheugen, wisselen van app, lege batterij) verliest
 * dus geen enkele tik.
 */
@Serializable
data class SessionSnapshot(
    val matchId: Int,
    val state: MatchState? = null,
    val clock: LocalClock.Snapshot? = null,
    val queue: List<Op> = emptyList(),
    val rejected: List<Rejected> = emptyList(),
    val savedWall: Long = 0,
)

class SessionStore(private val dir: File) {
    init {
        dir.mkdirs()
    }

    private fun file(matchId: Int) = File(dir, "$matchId.json")

    fun load(matchId: Int): SessionSnapshot? = try {
        val f = file(matchId)
        if (f.exists()) AppJson.decodeFromString(SessionSnapshot.serializer(), f.readText()) else null
    } catch (_: Exception) {
        null // beschadigd bestand: liever opnieuw beginnen dan crashen
    }

    @Synchronized
    fun save(s: SessionSnapshot) {
        val target = file(s.matchId)
        val tmp = File(dir, "${s.matchId}.json.tmp")
        tmp.writeText(AppJson.encodeToString(SessionSnapshot.serializer(), s))
        try {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    fun delete(matchId: Int) {
        file(matchId).delete()
    }

    /** Wedstrijden met onverstuurde tikken (of geweigerde tikken die nog op een keuze wachten). */
    fun idsWithPending(): List<Int> =
        (dir.listFiles { f -> f.name.endsWith(".json") } ?: emptyArray())
            .mapNotNull { f -> f.nameWithoutExtension.toIntOrNull() }
            .filter { id -> load(id)?.let { it.queue.isNotEmpty() || it.rejected.isNotEmpty() } == true }
}
