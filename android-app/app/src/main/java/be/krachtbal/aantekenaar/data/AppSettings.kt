package be.krachtbal.aantekenaar.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Wanneer blijft het scherm aan? */
enum class ScreenOnMode(val label: String) {
    NEVER("Nooit"),
    MATCH("Tijdens aantekenen"),
    ALWAYS("Altijd in de app"),
}

/** Schermstand van de app. */
enum class OrientationMode(val label: String) {
    AUTO("Automatisch"),
    PORTRAIT("Staand"),
    LANDSCAPE("Liggend"),
}

/**
 * Instellingen van de gebruiker, op het toestel bewaard. Elke instelling is een StateFlow zodat de
 * schermen meteen meebewegen als je ze wijzigt.
 */
class AppSettings(ctx: Context) {
    private val sp = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)

    private inline fun <reified E : Enum<E>> readEnum(key: String, default: E): E =
        runCatching { enumValueOf<E>(sp.getString(key, null) ?: default.name) }.getOrDefault(default)

    private val _screenOn = MutableStateFlow(readEnum("screenOn", ScreenOnMode.MATCH))
    private val _orientation = MutableStateFlow(readEnum("orientation", OrientationMode.AUTO))
    private val _immersiveOnOpen = MutableStateFlow(sp.getBoolean("immersiveOnOpen", false))
    private val _haptics = MutableStateFlow(sp.getBoolean("haptics", true))
    private val _keepAlive = MutableStateFlow(sp.getBoolean("keepAlive", true))

    /** Scherm aan: nooit, enkel op het aantekenscherm (standaard) of overal in de app. */
    val screenOn: StateFlow<ScreenOnMode> = _screenOn.asStateFlow()
    val orientation: StateFlow<OrientationMode> = _orientation.asStateFlow()

    /** Een wedstrijd meteen in volledig scherm openen (systeembalken weg). */
    val immersiveOnOpen: StateFlow<Boolean> = _immersiveOnOpen.asStateFlow()

    /** Korte trilling bij elke geregistreerde tik: bevestigt dat hij bewaard is. */
    val haptics: StateFlow<Boolean> = _haptics.asStateFlow()

    /** Voorgrondmelding tijdens een wedstrijd, zodat Android de app niet afsluit. */
    val keepAlive: StateFlow<Boolean> = _keepAlive.asStateFlow()

    fun setScreenOn(v: ScreenOnMode) {
        _screenOn.value = v
        sp.edit().putString("screenOn", v.name).apply()
    }

    fun setOrientation(v: OrientationMode) {
        _orientation.value = v
        sp.edit().putString("orientation", v.name).apply()
    }

    fun setImmersiveOnOpen(v: Boolean) {
        _immersiveOnOpen.value = v
        sp.edit().putBoolean("immersiveOnOpen", v).apply()
    }

    fun setHaptics(v: Boolean) {
        _haptics.value = v
        sp.edit().putBoolean("haptics", v).apply()
    }

    fun setKeepAlive(v: Boolean) {
        _keepAlive.value = v
        sp.edit().putBoolean("keepAlive", v).apply()
    }

    /**
     * Hoe de wedstrijdenlijst geordend is: wat de gebruiker laatst koos, of null (nog nooit gekozen). Zoals op de site
     * is de standaard dan "Thuis/Uit" voor wie een club heeft en anders "Reeks".
     */
    var listSort: ListSort?
        get() = sp.getString("listSort", null)?.let { s -> ListSort.entries.firstOrNull { it.name == s } }
        set(v) {
            sp.edit().apply { if (v == null) remove("listSort") else putString("listSort", v.name) }.apply()
        }

    /** Is de meldingstoestemming al eens gevraagd? (Daarna sturen we naar de Android-instellingen.) */
    var askedNotifications: Boolean
        get() = sp.getBoolean("askedNotifications", false)
        set(v) {
            sp.edit().putBoolean("askedNotifications", v).apply()
        }
}
