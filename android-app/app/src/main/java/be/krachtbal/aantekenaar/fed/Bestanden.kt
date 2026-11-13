package be.krachtbal.aantekenaar.fed

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File

// Bestanden van en naar andere apps: een foto met de camera nemen (de camera-app schrijft ze in onze cache) en een PDF
// openen in de PDF-lezer van het toestel. Beide via de FileProvider (res/xml/bestanden.xml): enkel tijdelijke
// bestanden in de cache, nooit iets anders.

private fun Context.bestandUri(f: File): Uri = FileProvider.getUriForFile(this, "$packageName.bestanden", f)

/**
 * Een foto nemen met de camera-app. Geeft een functie die de camera opent; [onFoto] krijgt de foto (als content-URI)
 * als de gebruiker ze bewaarde. Geen camerarecht nodig: de camera-app neemt de foto, wij krijgen enkel het bestand.
 */
@Composable
fun rememberCamera(onFoto: (Uri) -> Unit): () -> Unit {
    val ctx = LocalContext.current
    var wacht by rememberSaveable { mutableStateOf<Uri?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val u = wacht
        wacht = null
        if (ok && u != null) onFoto(u)
    }
    return {
        val dir = File(ctx.cacheDir, "foto").apply { mkdirs() }
        // Oude camerafoto's opruimen: ze zijn al gelezen en verkleind verstuurd.
        dir.listFiles()?.filter { it.lastModified() < System.currentTimeMillis() - 24 * 3600_000L }?.forEach { it.delete() }
        val uri = ctx.bestandUri(File(dir, "foto-${System.currentTimeMillis()}.jpg"))
        wacht = uri
        try {
            launcher.launch(uri)
        } catch (_: ActivityNotFoundException) {
            wacht = null
        }
    }
}

/** Schrijft [bytes] als PDF in de cache en opent ze in de PDF-lezer. Geeft een fouttekst terug, of null als het lukte. */
fun openPdf(ctx: Context, bytes: ByteArray, naam: String): String? {
    val dir = File(ctx.cacheDir, "pdf").apply { mkdirs() }
    dir.listFiles()?.forEach { it.delete() } // één blad tegelijk: medische of persoonlijke gegevens niet laten rondslingeren
    val f = File(dir, naam).apply { writeBytes(bytes) }
    val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(ctx.bestandUri(f), "application/pdf")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        ctx.startActivity(intent)
        null
    } catch (_: ActivityNotFoundException) {
        "Er is geen app om een PDF te openen. Installeer een PDF-lezer, of open het blad op de website."
    }
}
