package be.krachtbal.aantekenaar.data

/**
 * Tijdbronnen op één plek, zodat de rest testbaar blijft.
 *
 * - [elapsed] is MONOTOON: hij loopt niet terug, trekt zich niets aan van een verkeerd of
 *   bijgestelde gsm-klok (netwerktijd, zomertijd, handmatig) en — op Android, via
 *   SystemClock.elapsedRealtime() — telt hij ook de tijd mee dat het toestel sliep.
 *   Dát is de basis van de wedstrijdklok.
 * - [wall] is de muurklok van het toestel. Enkel gebruikt om tijdstippen naar servertijd om te
 *   rekenen (via [ServerClock]) en om na een herstart van het toestel bij te benaderen.
 *
 * App.onCreate() zet [elapsed] op SystemClock.elapsedRealtime(); de standaard (nanoTime) is voor
 * de JVM-tests.
 */
object Time {
    @Volatile var elapsed: () -> Long = { System.nanoTime() / 1_000_000 }
    @Volatile var wall: () -> Long = { System.currentTimeMillis() }
}
