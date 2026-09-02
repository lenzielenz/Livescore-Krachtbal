'use client'

import { useEffect } from 'react'

// Houdt een openstaande sessie levend.
//
// Het kantinescherm en de aantekentafel staan uren aan één stuk open. Payload's token heeft een
// vervaldatum, en zonder verlenging val je er middenin uit — je merkt het pas bij de volgende
// klik of herlading, en dat lijkt dan op "de update heeft me uitgelogd".
//
// Payload heeft daar een eigen eindpunt voor (`/api/users/refresh-token`): dat geeft een verse
// cookie zolang de huidige nog geldig is. Eén keer bij het openen en daarna om de zes uur is
// ruim genoeg — de token zelf gaat dertig dagen mee (zie collections/Users.ts), dus dit is de
// tweede lijn, geen kruk.
//
// Bewust stil: mislukt het (niet ingelogd, netwerk weg, server herstart net), dan gebeurt er
// niets. De volgende ronde probeert opnieuw.

const ELKE_MS = 6 * 60 * 60 * 1000

export function SessieVerlengen() {
  useEffect(() => {
    let actief = true
    const verleng = () => {
      if (!actief || typeof document === 'undefined' || document.visibilityState === 'hidden') return
      void fetch('/api/users/refresh-token', { method: 'POST', credentials: 'include' }).catch(() => {})
    }
    verleng()
    const tik = setInterval(verleng, ELKE_MS)
    // Een scherm dat dagen aanstaat en tussendoor slaapt: bij het terugkomen meteen verlengen
    // in plaats van tot de volgende tik te wachten.
    const opWakker = () => {
      if (document.visibilityState === 'visible') verleng()
    }
    document.addEventListener('visibilitychange', opWakker)
    return () => {
      actief = false
      clearInterval(tik)
      document.removeEventListener('visibilitychange', opWakker)
    }
  }, [])
  return null
}
