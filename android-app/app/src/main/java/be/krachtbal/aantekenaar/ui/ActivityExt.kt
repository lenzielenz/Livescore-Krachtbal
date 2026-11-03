package be.krachtbal.aantekenaar.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper

/** De Activity achter een (verpakte) Context — Compose geeft er soms een ContextWrapper van. */
internal fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}
