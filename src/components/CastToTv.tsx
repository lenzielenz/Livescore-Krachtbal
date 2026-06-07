'use client'

import { useState } from 'react'

// Supporter-vriendelijke "bekijk op tv"-kaart. Opent het grote scorebord (/veld/[id]) en legt
// uit hoe je dat naar je televisie cast (Chromecast / AirPlay / smart-tv-browser). Bewust
// duidelijk en zichtbaar, zodat elke supporter weet dat dit kan.
export function CastToTv({ matchId }: { matchId: number }) {
  const [open, setOpen] = useState(false)
  const url = `/veld/${matchId}`
  return (
    <div className="cast-tv">
      <div className="cast-tv-main">
        <span className="cast-tv-ico" aria-hidden>
          📺
        </span>
        <div className="cast-tv-txt">
          <strong>Bekijk deze wedstrijd op je tv</strong>
          <span>Open het grote scorebord en cast of spiegel het naar je televisie.</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="cast-tv-btn">
          Open groot scherm →
        </a>
      </div>
      <button
        type="button"
        className="cast-tv-how"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open ? 'true' : 'false'}
      >
        {open ? '▾ Verberg uitleg' : '▸ Hoe zet ik dit op mijn tv?'}
      </button>
      {open && (
        <ul className="cast-tv-steps">
          <li>
            <strong>Chromecast / Google TV:</strong> open het groot scherm, tik in Chrome op ⋮ →{' '}
            <em>Casten</em> en kies je tv.
          </li>
          <li>
            <strong>Apple TV (AirPlay):</strong> open het groot scherm, open het bedieningspaneel →{' '}
            <em>Schermspiegeling</em> → kies je Apple TV.
          </li>
          <li>
            <strong>Smart-tv:</strong> open de webbrowser van je tv en surf naar deze wedstrijdpagina.
          </li>
        </ul>
      )}
    </div>
  )
}
