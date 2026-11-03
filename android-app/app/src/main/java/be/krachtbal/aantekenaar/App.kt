package be.krachtbal.aantekenaar

import android.app.Application
import be.krachtbal.aantekenaar.data.Graph

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this)
    }
}
