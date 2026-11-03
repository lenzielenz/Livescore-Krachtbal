package be.krachtbal.aantekenaar.data

import java.net.URLDecoder
import java.security.MessageDigest

/**
 * Toegang tot de demoruimte, zoals de website ze regelt (src/lib/demoruimte/toegang.ts). Is er een
 * `DEMO_TOEGANGSCODE` gezet, dan wil de server een cookie `demo-toegang` met een hash van die code.
 * De hash is dezelfde als op de server: de eerste 32 tekens van sha256("krachtbal-demo:" + code).
 */
object DemoAccess {
    const val COOKIE = "demo-toegang"

    fun hash(code: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest("krachtbal-demo:${code.trim()}".toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }.take(32)
    }

    /** Het sessietoken uit de `Set-Cookie`-regels van de server (`payload-token=…; Path=/; …`). Null als het ontbreekt of leeg is. */
    fun tokenFromCookies(setCookie: List<String>): String? {
        for (line in setCookie) {
            val first = line.substringBefore(';').trim()
            if (!first.startsWith("payload-token=")) continue
            val raw = first.removePrefix("payload-token=")
            val value = try {
                URLDecoder.decode(raw, "UTF-8")
            } catch (_: Exception) {
                raw
            }
            if (value.isNotBlank()) return value
        }
        return null
    }
}

/** De rollen van de demoruimte (src/lib/demoruimte/rollen.ts) die in de app zin hebben, met de naam uit de demo. */
data class DemoRol(val sleutel: String, val label: String, val icoon: String)

val DEMO_ROLLEN_APP = listOf(
    DemoRol("coach", "Coach heren Sint-Michiels", "📋"),
    DemoRol("coach-baasrode", "Coach heren Baasrode", "📋"),
    DemoRol("scheidsrechter", "Scheidsrechter", "🧑‍⚖️"),
    DemoRol("tafel", "Aantekentafel Sint-Michiels", "✏️"),
    DemoRol("clubbeheer", "Clubbeheerder Sint-Michiels", "🏠"),
    DemoRol("federatie", "Federatie", "🏛️"),
)
