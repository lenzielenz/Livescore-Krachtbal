package be.krachtbal.aantekenaar.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Het adres waarmee de app begint: productie voor de tafel-app, de demoruimte voor de federatie-app (build.gradle.kts). */
val DEFAULT_SERVER: String = be.krachtbal.aantekenaar.BuildConfig.DEFAULT_SERVER

/** Versleutelt het bewaarde wachtwoord met een sleutel die het toestel nooit prijsgeeft (Android Keystore). */
internal object Vault {
    private const val ALIAS = "aantekenaar_wachtwoord"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    fun encrypt(plain: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val ct = c.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(c.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)
    }

    fun decrypt(blob: String): String? = try {
        val (iv, ct) = blob.split(":", limit = 2)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        String(c.doFinal(Base64.decode(ct, Base64.NO_WRAP)), Charsets.UTF_8)
    } catch (_: Exception) {
        null // sleutel weg (bv. schermvergrendeling gewijzigd): dan opnieuw inloggen
    }
}

/** Instellingen en inloggegevens. Het wachtwoord staat enkel versleuteld op het toestel. */
class AuthStore(ctx: Context) {
    private val sp = ctx.getSharedPreferences("auth", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("server", null) ?: DEFAULT_SERVER
        set(v) {
            sp.edit().putString("server", v.trim().trimEnd('/').ifEmpty { DEFAULT_SERVER }).apply()
        }

    var token: String?
        get() = sp.getString("token", null)
        set(v) {
            sp.edit().putString("token", v).apply()
        }

    var email: String?
        get() = sp.getString("email", null)
        set(v) {
            sp.edit().putString("email", v).apply()
        }

    var userId: Int
        get() = sp.getInt("userId", -1)
        set(v) {
            sp.edit().putInt("userId", v).apply()
        }

    var userName: String?
        get() = sp.getString("userName", null)
        set(v) {
            sp.edit().putString("userName", v).apply()
        }

    /** De club van het account (`user.club`), of -1 als het account geen club heeft: voor "Thuis/Uit" en "Mijn club". */
    var clubId: Int
        get() = sp.getInt("clubId", -1)
        set(v) {
            sp.edit().putInt("clubId", v).apply()
        }

    /** De rollen van het account (`user.roles`): bepaalt welke wedstrijddag-stappen de federatie-app toont. */
    var roles: Set<String>
        get() = sp.getStringSet("roles", null)?.toSet().orEmpty()
        set(v) {
            sp.edit().putStringSet("roles", v.toSet()).apply()
        }

    /** De functies in de club (`user.clubFuncties`: coach, trainer, jeugdverantwoordelijke, …). */
    var clubFuncties: Set<String>
        get() = sp.getStringSet("clubFuncties", null)?.toSet().orEmpty()
        set(v) {
            sp.edit().putStringSet("clubFuncties", v.toSet()).apply()
        }

    /** Sleutel van de demorol waarmee ingelogd werd (demoruimte), of null bij een gewoon account. */
    var demoRol: String?
        get() = sp.getString("demoRol", null)
        set(v) {
            sp.edit().apply { if (v == null) remove("demoRol") else putString("demoRol", v) }.apply()
        }

    /** De toegangscode van de demo, als de demo er een vraagt. Blijft bewaard: dezelfde code geldt de volgende keer weer. */
    var demoCode: String?
        get() = sp.getString("demoCode", null)
        set(v) {
            sp.edit().apply { if (v.isNullOrBlank()) remove("demoCode") else putString("demoCode", v.trim()) }.apply()
        }

    /** Laatst bekende aantekenmodus van de server: "supporters" of "federatie". */
    var scoreMode: String
        get() = sp.getString("scoreMode", null) ?: "supporters"
        set(v) {
            sp.edit().putString("scoreMode", v).apply()
        }

    fun savePassword(pw: String?) {
        sp.edit().apply { if (pw == null) remove("pw") else putString("pw", Vault.encrypt(pw)) }.apply()
    }

    fun password(): String? = sp.getString("pw", null)?.let(Vault::decrypt)

    fun signOut() {
        sp.edit().remove("token").remove("pw").remove("userId").remove("userName").remove("clubId").remove("roles").remove("clubFuncties").remove("demoRol").apply()
    }
}
