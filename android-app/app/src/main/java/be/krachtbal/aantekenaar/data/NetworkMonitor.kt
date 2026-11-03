package be.krachtbal.aantekenaar.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Houdt bij of het toestel een netwerk heeft, en roept "terug online" om zodat de wachtrij en de
 * livestream meteen herstarten in plaats van op hun backoff te wachten.
 */
class NetworkMonitor(ctx: Context) {
    private val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val _online = MutableStateFlow(currentlyOnline())
    val online: StateFlow<Boolean> = _online.asStateFlow()

    private val _regained = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val regained: SharedFlow<Unit> = _regained.asSharedFlow()

    private fun currentlyOnline(): Boolean {
        val n = cm.activeNetwork ?: return false
        val c = cm.getNetworkCapabilities(n) ?: return false
        return c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    init {
        try {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    val was = _online.value
                    _online.value = true
                    if (!was) _regained.tryEmit(Unit)
                    // Ook bij wisselen wifi ↔ data: de oude verbinding is dood, begin opnieuw.
                    _regained.tryEmit(Unit)
                }

                override fun onLost(network: Network) {
                    _online.value = currentlyOnline()
                }
            })
        } catch (_: Exception) {
            // Zonder callback valt de app terug op de periodieke pogingen van de wachtrij.
        }
    }
}
