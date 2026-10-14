import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { formatDateBE } from '@/lib/datetime'
import { FRAGMENTEN } from '@/lib/virtueel'
import './virtueel.css'

export const metadata = { title: 'Virtueel krachtbal — Krachtbal Live' }

// Virtueel krachtbal: wedstrijdfragmenten die uit video gereconstrueerd werden, om in 3D te
// herbekijken en zelf door te lopen. Zie src/lib/virtueel.ts.
export default function VirtueelPage() {
  return (
    <>
      <SiteHeader />
      <div className="site vk-pagina">
        <h1 className="page-title">🥽 <span className="brand">Virtueel krachtbal</span></h1>
        <p className="page-sub">
          Stap mee het veld op. Elke worp, vangst en loopbeweging werd uit video gereconstrueerd: kijk vanop de tribune, volg
          de bal, kijk door de ogen van een speler, of loop zelf tussen de spelers door.
        </p>
        <div className="vk-lijst">
          {FRAGMENTEN.map((f) => (
            <Link key={f.slug} href={`/virtueel/${f.slug}`} className="vk-kaart">
              <span className="vk-kaart-beeld" aria-hidden>
                <span className="vk-kaart-veld" />
                <span className="vk-kaart-play">▶</span>
              </span>
              <span className="vk-kaart-tekst">
                <span className="vk-kaart-meta">{formatDateBE(f.datum, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · {f.plaats}</span>
                <b>{f.titel}</b>
                <span>{f.beschrijving}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
