package be.krachtbal.aantekenaar.data

import kotlinx.serialization.Serializable

/**
 * De wedstrijdklok van DIT toestel.
 *
 * De website rekent `server.clockSeconds + (Date.now() − server.clockUpdatedAt)`: de muurklok van de
 * gsm tegenover die van de server. Staat de gsm 40 seconden voor, dan staat de wedstrijdtijd 40
 * seconden mis. Hier is de klok een ANKER op de monotone tijd: (basisseconden, moment van ankeren).
 * Tikken = ankeren; de stand lezen = basis + verstreken monotone tijd. Geen netwerk, geen muurklok.
 */
class LocalClock(
    private val elapsedNow: () -> Long = { Time.elapsed() },
    private val wallNow: () -> Long = { Time.wall() },
) {
    @Serializable
    data class Snapshot(
        val base: Double,
        val running: Boolean,
        val anchorElapsed: Long,
        val anchorWall: Long,
    )

    @Volatile private var base = 0.0
    @Volatile private var running = false
    @Volatile private var anchorElapsed = elapsedNow()
    @Volatile private var anchorWall = wallNow()

    val isRunning: Boolean get() = running

    /** Klokstand in seconden op het gegeven monotone moment. */
    fun valueAt(elapsedMs: Long): Double =
        if (running) base + maxOf(0L, elapsedMs - anchorElapsed) / 1000.0 else base

    fun value(): Double = valueAt(elapsedNow())

    /** Zet de klok op [seconds] en laat ze lopen of stilstaan, ingegaan op [atElapsed] (standaard nu). */
    fun set(seconds: Double, run: Boolean, atElapsed: Long = elapsedNow()) {
        base = maxOf(0.0, seconds)
        running = run
        anchorElapsed = atElapsed
        anchorWall = wallNow()
    }

    fun snapshot(): Snapshot = Snapshot(base, running, anchorElapsed, anchorWall)

    /**
     * Herstel na een herstart van de app. Overleefde het toestel (zelfde opstart), dan blijft de
     * monotone tijd geldig. Werd het intussen herstart, dan is `elapsed` opnieuw begonnen en valt
     * de klok terug op de muurklok — beter een benadering dan een klok die op nul springt.
     */
    fun restore(s: Snapshot) {
        val nowElapsed = elapsedNow()
        // Zelfde opstart van het toestel? Dan is het opstartmoment (muurklok − monotone tijd) nog hetzelfde, op een kleine
        // klokcorrectie na. Enkel "de monotone tijd is al voorbij het anker" volstaat niet: na een herstart is ze dat na
        // een paar minuten óók, en dan leek een kwartier stilstand op twee minuten.
        val bootThen = s.anchorWall - s.anchorElapsed
        val bootNow = wallNow() - nowElapsed
        val sameBoot = nowElapsed >= s.anchorElapsed && kotlin.math.abs(bootNow - bootThen) < BOOT_TOLERANCE_MS
        if (sameBoot) {
            base = s.base
            running = s.running
            anchorElapsed = s.anchorElapsed
            anchorWall = s.anchorWall
        } else {
            val sinceWall = maxOf(0L, wallNow() - s.anchorWall) / 1000.0
            base = if (s.running) s.base + sinceWall else s.base
            running = s.running
            anchorElapsed = nowElapsed
            anchorWall = wallNow()
        }
    }

    companion object {
        /** Zoveel mag het opstartmoment verschoven zijn en nog dezelfde opstart heten (NTP-correcties zijn seconden). */
        const val BOOT_TOLERANCE_MS = 120_000L
    }
}
