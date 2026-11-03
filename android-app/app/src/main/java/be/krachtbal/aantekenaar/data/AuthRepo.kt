package be.krachtbal.aantekenaar.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Uitkomst van stil opnieuw inloggen. */
enum class Reauth {
    OK,

    /** De server weigert de bewaarde gegevens (of ze ontbreken): de gebruiker moet zelf inloggen. */
    DENIED,

    /** Geen verbinding: dat is geen reden om uit te loggen — straks opnieuw proberen. */
    UNREACHABLE,
}

/**
 * Inloggen en — belangrijker — ingelogd BLIJVEN. Het token geldt 30 dagen (Users.ts), maar een
 * aantekenaar mag midden in een wedstrijd nooit op een inlogscherm belanden. Wordt een verzoek met
 * 401 geweigerd, dan loggen we stil opnieuw in met de bewaarde (versleutelde) gegevens en proberen
 * we dezelfde tik opnieuw.
 */
class AuthRepo(private val store: AuthStore, private val api: Api) {
    private val _signedIn = MutableStateFlow(store.token != null)
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()

    private val mutex = Mutex()

    private val _clubId = MutableStateFlow(store.clubId.takeIf { it >= 0 })

    /** De club van het ingelogde account, of null als het account er geen heeft (of nog niet bekend is). */
    val clubId: StateFlow<Int?> = _clubId.asStateFlow()

    private fun saveClub(id: Int?) {
        store.clubId = id ?: -1
        _clubId.value = id
    }

    private val _me = MutableStateFlow(Me(store.roles, store.clubFuncties))

    /** Rollen en clubfuncties van het account — bepalen welke wedstrijddag-stappen de federatie-app toont. */
    val me: StateFlow<Me> = _me.asStateFlow()

    private fun saveMe(ok: Api.LoginOk) {
        store.roles = ok.roles
        store.clubFuncties = ok.clubFuncties
        _me.value = Me(ok.roles, ok.clubFuncties)
    }

    /** Vernieuwt naam, club, rollen en functies van het account — de lijst heeft de club nodig voor "Thuis/Uit" en "Mijn club". */
    suspend fun refreshProfile() {
        val me = api.fetchMe() ?: return // geen verbinding: de bewaarde club en rollen blijven gelden
        store.userName = me.name ?: store.userName
        saveClub(me.clubId)
        saveMe(me)
    }

    /** Sleutel van de demorol waarmee ingelogd is, of null bij een gewoon account. */
    val demoRol: String? get() = store.demoRol

    /** De bewaarde toegangscode van de demo (leeg als de demo er geen vraagt). */
    val demoCode: String? get() = store.demoCode

    /**
     * Demoruimte: inloggen als een demorol, zonder wachtwoord. De server gaf enkel een sessie terug; naam, club
     * en rollen halen we daarna op uit het profiel. Mislukt dat, dan blijft er niets half ingelogd achter.
     */
    suspend fun loginDemo(server: String, rol: String, code: String?): Result<Unit> {
        val cleanServer = server.trim().trimEnd('/').ifEmpty { DEFAULT_SERVER }
        val ok = api.loginDemo(cleanServer, rol, code).getOrElse { return Result.failure(it) }
        val before = Triple(store.serverUrl, store.token, store.demoRol)
        store.serverUrl = cleanServer
        store.token = ok.token
        val me = api.fetchMe()
        if (me == null) {
            store.serverUrl = before.first
            store.token = before.second
            return Result.failure(java.io.IOException("Het profiel van deze rol kon niet gelezen worden."))
        }
        store.demoRol = rol
        store.demoCode = code
        store.email = null
        store.savePassword(null)
        store.userId = me.userId
        store.userName = me.name
        saveClub(me.clubId)
        saveMe(me)
        _signedIn.value = true
        return Result.success(Unit)
    }

    val userId: Int get() = store.userId
    val userName: String? get() = store.userName
    val email: String? get() = store.email
    val serverUrl: String get() = store.serverUrl

    suspend fun login(server: String, email: String, password: String): Result<Unit> {
        val cleanServer = server.trim().trimEnd('/').ifEmpty { DEFAULT_SERVER }
        return api.login(cleanServer, email.trim(), password).map { ok ->
            store.serverUrl = cleanServer
            store.token = ok.token
            store.email = email.trim()
            store.userId = ok.userId
            store.userName = ok.name
            store.demoRol = null
            saveClub(ok.clubId)
            saveMe(ok)
            store.savePassword(password)
            _signedIn.value = true
        }
    }

    /**
     * Stil opnieuw inloggen na een 401. Meerdere tikken tegelijk wachten op één poging, en wie
     * achter een poging aanloopt die al lukte, hoeft niet nog eens.
     */
    suspend fun reauthenticate(failedToken: String? = store.token): Reauth = mutex.withLock {
        if (store.token != null && store.token != failedToken) return@withLock Reauth.OK // al vernieuwd
        // Een demorol heeft geen wachtwoord: opnieuw "inloggen als" die rol (met dezelfde toegangscode).
        store.demoRol?.let { rol ->
            return@withLock api.loginDemo(store.serverUrl, rol, store.demoCode).fold(
                onSuccess = { ok ->
                    store.token = ok.token
                    _signedIn.value = true
                    Reauth.OK
                },
                onFailure = { if (it is LoginDenied) Reauth.DENIED else Reauth.UNREACHABLE },
            )
        }
        val email = store.email ?: return@withLock Reauth.DENIED
        val pw = store.password() ?: return@withLock Reauth.DENIED
        api.login(store.serverUrl, email, pw).fold(
            onSuccess = { ok ->
                store.token = ok.token
                store.userId = ok.userId
                store.userName = ok.name
                saveClub(ok.clubId)
                _signedIn.value = true
                Reauth.OK
            },
            onFailure = { if (it is LoginDenied) Reauth.DENIED else Reauth.UNREACHABLE },
        )
    }

    /** Het huidige token, voor het vergelijken in [reauthenticate]. */
    fun currentToken(): String? = store.token

    fun logout() {
        store.signOut()
        _clubId.value = null
        _me.value = Me()
        _signedIn.value = false
    }
}
