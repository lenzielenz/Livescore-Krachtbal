package be.krachtbal.aantekenaar.ui

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import be.krachtbal.aantekenaar.BuildConfig
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.OrientationMode
import be.krachtbal.aantekenaar.data.ScreenOnMode

/** Start een Android-scherm; lukt dat niet (verschilt per merk), val dan terug op de app-info. */
private fun Context.openSettings(primary: Intent) {
    try {
        startActivity(primary)
    } catch (_: ActivityNotFoundException) {
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        } catch (_: Exception) {
            // geen instellingen-app te vinden: er is niets meer te doen
        }
    } catch (_: SecurityException) {
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        } catch (_: Exception) {
        }
    }
}

private fun Context.pkgUri(): Uri = Uri.parse("package:$packageName")

/** Roept [onResume] aan telkens als de gebruiker terugkomt in de app (bv. na de Android-instellingen). */
@Composable
private fun OnResume(onResume: () -> Unit) {
    val owner = LocalContext.current.findActivity() as? LifecycleOwner
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) onResume() }
        owner?.lifecycle?.addObserver(observer)
        onDispose { owner?.lifecycle?.removeObserver(observer) }
    }
}

@Composable
fun SettingsScreen(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val s = Graph.settings

    val screenOn by s.screenOn.collectAsState()
    val orientation by s.orientation.collectAsState()
    val immersive by s.immersiveOnOpen.collectAsState()
    val haptics by s.haptics.collectAsState()
    val keepAlive by s.keepAlive.collectAsState()
    val attention by Graph.attention.collectAsState()

    // Status van de Android-rechten: opnieuw lezen telkens als je terugkomt uit de Android-instellingen.
    var refresh by remember { mutableIntStateOf(0) }
    OnResume { refresh++ }
    val notificationsOk = remember(refresh) { NotificationManagerCompat.from(ctx).areNotificationsEnabled() }
    val batteryOk = remember(refresh) {
        ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) ?: true
    }
    val dataSaverBlocks = remember(refresh) {
        ctx.getSystemService(ConnectivityManager::class.java)?.restrictBackgroundStatus ==
            ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
    }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { refresh++ }

    val okCount = listOf(notificationsOk, batteryOk, !dataSaverBlocks).count { it }

    // Surface blokkeert tikken naar het scherm eronder; AuroraBackdrop is de achtergrond van de site.
    Surface(Modifier.fillMaxSize(), color = Pal.Base) {
        AuroraBackdrop {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onClose) { Text("←", color = Pal.Text, fontSize = 24.sp) }
                Title("Instellingen", Modifier.weight(1f))
            }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // ── Scherm ──
                Section("Scherm") {
                    ChoiceRow(
                        title = "Scherm altijd aan",
                        desc = "Voorkomt dat het scherm dooft terwijl je aantekent. \"Altijd in de app\" houdt het ook aan op de lijst.",
                        options = ScreenOnMode.entries,
                        selected = screenOn,
                        label = { it.label },
                        onSelect = s::setScreenOn,
                    )
                    ChoiceRow(
                        title = "Schermstand",
                        desc = "Vergrendel de app in staand of liggend, of laat het toestel kiezen.",
                        options = OrientationMode.entries,
                        selected = orientation,
                        label = { it.label },
                        onSelect = s::setOrientation,
                    )
                    SwitchRow(
                        title = "Wedstrijd in volledig scherm openen",
                        desc = "Verbergt de statusbalk en navigatiebalk. Veeg vanaf de rand om ze even terug te halen.",
                        checked = immersive,
                        onChange = s::setImmersiveOnOpen,
                    )
                }

                // ── Rechten ──
                Section("Rechten van Android", note = "$okCount van 3 in orde") {
                    PermRow(
                        title = "Meldingen",
                        desc = "Toont de lopende wedstrijd met klok in de meldingenbalk. Zonder melding kan Android de app sneller afsluiten.",
                        ok = notificationsOk,
                        okText = "Toegestaan",
                        badText = "Geblokkeerd",
                        action = if (notificationsOk) "Wijzigen" else "Toestaan",
                    ) {
                        if (Build.VERSION.SDK_INT >= 33 && !s.askedNotifications) {
                            s.askedNotifications = true
                            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            ctx.openSettings(
                                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName),
                            )
                        }
                    }
                    PermRow(
                        title = "Batterij: onbeperkt",
                        desc = "Laat Android de app tijdens een wedstrijd nooit afremmen of sluiten. Aanbevolen voor aantekenaars.",
                        ok = batteryOk,
                        okText = "Onbeperkt",
                        badText = "Beperkt",
                        action = if (batteryOk) "Wijzigen" else "Onbeperkt maken",
                    ) {
                        ctx.openSettings(
                            if (batteryOk) Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                            else Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, ctx.pkgUri()),
                        )
                    }
                    PermRow(
                        title = "Databesparing",
                        desc = "Staat databesparing aan, dan krijgt de app op de achtergrond geen netwerk en blijven tikken hangen.",
                        ok = !dataSaverBlocks,
                        okText = "Geen beperking",
                        badText = "Beperkt",
                        action = if (dataSaverBlocks) "Uitzonderen" else "Wijzigen",
                    ) {
                        ctx.openSettings(Intent(Settings.ACTION_IGNORE_BACKGROUND_DATA_RESTRICTIONS_SETTINGS, ctx.pkgUri()))
                    }
                    TextButton(
                        onClick = { ctx.openSettings(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, ctx.pkgUri())) },
                    ) { Text("Alle app-instellingen van Android openen →", color = Pal.Accent) }
                }

                // ── Gedrag ──
                Section("Gedrag") {
                    SwitchRow(
                        title = "Trillen bij elke tik",
                        desc = "Een korte trilling zodra een tik geregistreerd en op het toestel bewaard is.",
                        checked = haptics,
                        onChange = s::setHaptics,
                    )
                    SwitchRow(
                        title = "Wedstrijd actief houden (melding)",
                        desc = "Voorgrondmelding tijdens een wedstrijd of zolang er tikken wachten. Aanbevolen.",
                        checked = keepAlive,
                        onChange = s::setKeepAlive,
                    )
                }

                // ── Account ──
                Section("Account") {
                    Text(Graph.authRepo.userName ?: Graph.authRepo.email ?: "Niet ingelogd", color = Pal.Text, fontWeight = FontWeight.SemiBold)
                    Dim(Graph.authRepo.serverUrl)
                    if (attention.isNotEmpty()) {
                        Dim("Let op: er wachten nog niet-verzonden acties. Ze blijven bewaard en worden verstuurd zodra je weer inlogt.")
                    }
                    SmallButton("Uitloggen", { onClose(); Graph.authRepo.logout() }, Btn.Danger)
                }

                Dim("${androidx.compose.ui.res.stringResource(be.krachtbal.aantekenaar.R.string.app_name)} ${BuildConfig.VERSION_NAME}", Modifier.padding(bottom = 24.dp))
            }
        }
        }
    }
}

@Composable
private fun Section(title: String, note: String? = null, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionTitle(title, Modifier.weight(1f))
                if (note != null) Dim(note)
            }
            content()
        }
    }
}

@Composable
private fun SwitchRow(title: String, desc: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    // De hele rij is de schakelaar (groot raakvlak, en TalkBack leest titel + stand samen voor).
    Row(
        Modifier.fillMaxWidth().toggleable(value = checked, role = Role.Switch, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Dim(desc)
        }
        Switch(
            checked = checked,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Pal.Ink,
                checkedTrackColor = Pal.Accent,
                checkedBorderColor = Pal.Accent,
                uncheckedThumbColor = Pal.Dim,
                uncheckedTrackColor = Pal.CardHi,
                uncheckedBorderColor = Pal.Line,
            ),
        )
    }
}

@Composable
private fun <T> ChoiceRow(title: String, desc: String, options: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Dim(desc)
        }
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // Selectie zoals op de site: pil, geselecteerd = vol ijsblauw met donkere tekst.
            for (o in options) PillChip(label(o), selected = o == selected, onClick = { onSelect(o) })
        }
    }
}

/** Een Android-recht: toont de echte status en opent het juiste Android-scherm om het te wijzigen. */
@Composable
private fun PermRow(
    title: String,
    desc: String,
    ok: Boolean,
    okText: String,
    badText: String,
    action: String,
    onAction: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Dim(desc)
            }
            // In orde = groen (zoals "klaar" op de site); aandacht nodig = geel.
            Pill(if (ok) "✓ $okText" else "⚠ $badText", if (ok) Pal.Home else Pal.Warn)
        }
        SmallButton(action, onAction, if (ok) Btn.Default else Btn.Primary)
    }
}
