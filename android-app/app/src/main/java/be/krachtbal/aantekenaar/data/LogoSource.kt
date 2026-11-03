package be.krachtbal.aantekenaar.data

import java.net.URI
import java.net.URLEncoder

// Waar de app een clublogo vandaan haalt — dezelfde regels als src/lib/logo-bron.ts van de site.
//
// De originele bestanden bij de federatie (www.krachtbal.be/images/logo_N.png) verdwenen in oktober 2026.
// De site laat die logo's daarom via /api/clublogo lopen, dat een bewaarde kopie geeft (en terugvalt op
// het webarchief). De app doet precies hetzelfde: zo zien de logo's er in de app en op de site hetzelfde uit.

private val BEWAARDE_HOSTS = setOf("www.krachtbal.be", "krachtbal.be")
private val LOGO_PAD = Regex("^/(?:images|news_images)/[\\w.-]+\\.(?:png|gif|jpe?g|webp|svg)$", RegexOption.IGNORE_CASE)

/** Mag deze absolute URL via /api/clublogo bewaard en geserveerd worden? (`isBewaardLogo`) */
fun isBewaardLogo(url: String): Boolean = try {
    val u = URI(url)
    val scheme = u.scheme?.lowercase()
    (scheme == "https" || scheme == "http") &&
        u.userInfo == null &&
        u.port == -1 &&
        u.host?.lowercase() in BEWAARDE_HOSTS &&
        u.rawQuery == null &&
        LOGO_PAD.matches(u.rawPath ?: "")
} catch (_: Exception) {
    false
}

/**
 * De URL waarmee de app een logo ophaalt (`logoBron`). [server] is de basis van het platform.
 * Lege waarden geven null; eigen uploads (`/api/media/…`) krijgen de serverbasis ervoor.
 */
fun logoSource(raw: String?, server: String): String? {
    val s = raw?.trim().orEmpty()
    if (s.isEmpty()) return null
    val base = server.trimEnd('/')
    if (isBewaardLogo(s)) {
        // Altijd https naar de bron: zo is de cachesleutel voor http- en https-varianten dezelfde.
        val https = if (s.startsWith("http://", ignoreCase = true)) "https://" + s.substring(7) else s
        return "$base/api/clublogo?u=" + URLEncoder.encode(https, "UTF-8")
    }
    if (s.startsWith("//")) return "https:$s"
    if (s.startsWith("/")) return base + s
    return s
}

/** Initialen van een ploeg als er geen logo is: de eerste letter van elk woord, max. 3, hoofdletters. */
fun initialsFor(name: String): String =
    name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.map { it.first() }.joinToString("").take(3).uppercase()
