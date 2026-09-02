'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  leesWeggeklikt,
  RUST_SLEUTEL,
  welkeUitnodiging,
  type Uitnodiging,
} from '@/lib/installeren'
import './installeren.css'

// De uitnodiging om de app te installeren.
//
// Android biedt die uitnodiging zélf aan via `beforeinstallprompt`, maar enkel als wij hem
// opvangen en bewaren; laten we het event passeren, dan toont Chrome hooguit een onopvallend
// icoontje in de adresbalk dat niemand aanklikt. iOS stuurt dat event niet — daar is "Zet op
// beginscherm" een verstopte optie in het deelmenu, dus die twee stappen leggen we uit.
//
// De winst zit niet in het icoontje: geïnstalleerd opent de app zonder browserbalk (op een gsm
// scheelt dat een flink stuk scorebord), ze staat tussen de andere apps, en op iOS werken
// push-meldingen alléén in een geïnstalleerde app.

type Prompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function Installeren() {
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [uitnodiging, setUitnodiging] = useState<Uitnodiging>('geen')
  const [uitleg, setUitleg] = useState(false)

  // Herberekent de uitnodiging uit de huidige toestand van het toestel. Eén plek, zodat het
  // antwoord na een installatie of een wegklik nooit uit de pas loopt met wat er te zien is.
  const herbereken = useCallback((aangeboden: boolean) => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    setUitnodiging(
      welkeUitnodiging({
        standalone,
        ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
        aangeboden,
        weggeklikt: leesWeggeklikt(veiligLezen()),
        nu: Date.now(),
      }),
    )
  }, [])

  useEffect(() => {
    herbereken(false)

    const opUitnodiging = (e: Event) => {
      // Zonder dit toont Chrome zijn eigen mini-balk; wij willen de uitnodiging op ons moment en
      // in onze woorden kunnen tonen.
      e.preventDefault()
      setPrompt(e as Prompt)
      herbereken(true)
    }
    // Geïnstalleerd tijdens dit bezoek: de balk hoort meteen weg te zijn.
    const opGeinstalleerd = () => {
      setPrompt(null)
      setUitnodiging('geen')
    }

    window.addEventListener('beforeinstallprompt', opUitnodiging)
    window.addEventListener('appinstalled', opGeinstalleerd)
    return () => {
      window.removeEventListener('beforeinstallprompt', opUitnodiging)
      window.removeEventListener('appinstalled', opGeinstalleerd)
    }
  }, [herbereken])

  const installeer = async () => {
    if (!prompt) return
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      // Eén uitnodiging per event: hij is nu opgebruikt, ook als er "later" geklikt werd.
      setPrompt(null)
      if (outcome === 'accepted') setUitnodiging('geen')
      else wegklikken()
    } catch {
      // Een browser die het venster weigert te openen (bv. omdat het event verlopen is) mag geen
      // vastgelopen balk achterlaten.
      setPrompt(null)
      setUitnodiging('geen')
    }
  }

  const wegklikken = () => {
    veiligSchrijven(String(Date.now()))
    setUitnodiging('geen')
  }

  if (uitnodiging === 'geen') return null

  return (
    <aside className="kb-install" aria-label="App installeren">
      <span className="kb-install-icoon" aria-hidden>
        📲
      </span>
      <div className="kb-install-tekst">
        <strong>Zet Krachtbal op je beginscherm</strong>
        <span>Sneller openen, zonder browserbalk — en meldingen bij de start en de eindstand.</span>
        {uitnodiging === 'ios-uitleg' && uitleg && (
          <ol className="kb-install-stappen">
            {/* Geen SF-Symbols-teken voor de deel-knop: dat komt uit Apple's private use area en
                wordt op alles buiten iOS een leeg blokje. Beschrijven werkt overal. */}
            <li>
              Tik onderaan op <strong>Deel</strong> — het vierkantje met de pijl omhoog
            </li>
            <li>
              Kies <strong>Zet op beginscherm</strong>
            </li>
          </ol>
        )}
      </div>
      {uitnodiging === 'knop' ? (
        <button type="button" className="kb-install-knop" onClick={installeer}>
          Installeren
        </button>
      ) : (
        <button
          type="button"
          className="kb-install-knop"
          aria-expanded={uitleg}
          onClick={() => setUitleg((v) => !v)}
        >
          {uitleg ? 'Verbergen' : 'Hoe?'}
        </button>
      )}
      <button type="button" className="kb-install-weg" onClick={wegklikken} aria-label="Niet nu">
        ✕
      </button>
    </aside>
  )
}

// localStorage kan gooien (privémodus, opslag geblokkeerd). Dat mag nooit een lege pagina
// opleveren voor iets kleins als een installatiebalk.
function veiligLezen(): string | null {
  try {
    return localStorage.getItem(RUST_SLEUTEL)
  } catch {
    return null
  }
}

function veiligSchrijven(waarde: string) {
  try {
    localStorage.setItem(RUST_SLEUTEL, waarde)
  } catch {
    // Dan onthouden we het wegklikken niet — hooguit ziet deze bezoeker de balk later opnieuw.
  }
}
