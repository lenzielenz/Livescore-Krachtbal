package be.krachtbal.aantekenaar.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import be.krachtbal.aantekenaar.MainActivity
import be.krachtbal.aantekenaar.R
import be.krachtbal.aantekenaar.data.ForegroundInfo
import be.krachtbal.aantekenaar.data.Graph
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * Voorgrondservice zolang er een wedstrijd actief is of tikken wachten op verzending.
 *
 * Doel: Android doodt een app op de achtergrond zonder waarschuwing (geheugen, batterijbesparing) —
 * precies wat een browsertabblad aan de tafel overkomt. Met een voorgrondmelding blijft het proces
 * leven, loopt de wachtrij door en blijft de livestream open, ook als je even van app wisselt of
 * het scherm dooft. De melding toont de stand en een lopende klok (door Android zelf getekend, dus
 * zonder dat we elke seconde iets hoeven te doen).
 */
class MatchService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var watcher: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val info = Graph.foreground.value
        val n = build(info)
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, n)
        }
        watcher?.cancel()
        watcher = scope.launch {
            Graph.foreground.collect { i ->
                if (i == null) {
                    // Niets actiefs meer: de service stopt zichzélf — en dus altijd ná het startForeground() hierboven.
                    // Een stopService() van buitenaf kon dat voorsteken, en dat is op Android 8.1–11 een crash van
                    // het hele proces ("did not then call Service.startForeground()").
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                } else {
                    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, build(i))
                }
            }
        }
        return START_NOT_STICKY
    }

    // Android 15: een dataSync-service mag hoogstens 6 uur per etmaal lopen; daarna vraagt het systeem om te stoppen en
    // doodt het de app als dat niet gebeurt. De app blijft gewoon werken (de wachtrij loopt zolang de app open is);
    // enkel het levend houden op de achtergrond valt tot het etmaal om is weg.
    override fun onTimeout(startId: Int, fgsType: Int) = verlopen()

    override fun onTimeout(startId: Int) = verlopen()

    private fun verlopen() {
        Graph.onServiceTimedOut()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        Graph.onServiceStopped()
        super.onDestroy()
    }

    private fun ensureChannel() {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Wedstrijd bezig", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Toont de lopende wedstrijd zodat de app niet door Android wordt afgesloten."
                    setShowBadge(false)
                },
            )
        }
    }

    private fun build(i: ForegroundInfo?): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val b = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle(i?.title ?: getString(R.string.app_name))
            .setContentText(i?.text ?: "Wedstrijd bezig")
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
        if (i != null && i.running) {
            b.setShowWhen(true).setWhen(i.chronoBaseWall).setUsesChronometer(true)
        } else {
            b.setShowWhen(false)
        }
        return b.build()
    }

    companion object {
        private const val CHANNEL = "wedstrijd"
        private const val NOTIF_ID = 42

        fun intent(ctx: Context) = Intent(ctx, MatchService::class.java)
    }
}
