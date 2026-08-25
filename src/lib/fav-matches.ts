// "Mijn wedstrijden" — een eigen lijstje van wedstrijden die je wil bijhouden.
//
// Een wedstrijd die pas over drie weken gespeeld wordt, hoeft geen scorebord: je wil ze onthouden
// en in je agenda zetten. Dat lijstje staat lokaal in de browser (geen account nodig, geen
// server-opslag): het is een bladwijzer, geen gedeelde data.
//
// Van elke wedstrijd bewaren we een kleine momentopname (ploegen, uur, reeks) zodat het lijstje
// meteen leesbaar is zonder eerst de server te bevragen. Verplaatst een wedstrijd, dan klopt de
// bewaarde tekst niet meer — daarom linkt elke regel naar de wedstrijdpagina, die wél leidend is.

export interface BewaardeWedstrijd {
  id: number
  home: string
  away: string
  /** ISO-tijdstip van de aftrap zoals gekend bij het bewaren. */
  date: string
  reeks?: string | null
}

export const FAV_MATCHES_KEY = 'kb-fav-wedstrijden'
/** Ruim genoeg voor een heel seizoen van één ploeg, klein genoeg om nooit in de weg te zitten. */
export const MAX_BEWAARD = 100

/** Leest het lijstje; kapotte of vreemde inhoud levert een leeg lijstje op i.p.v. een fout. */
export function leesBewaard(ruw: string | null): BewaardeWedstrijd[] {
  if (!ruw) return []
  let data: unknown
  try {
    data = JSON.parse(ruw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const uit: BewaardeWedstrijd[] = []
  const gezien = new Set<number>()
  for (const w of data) {
    if (!w || typeof w !== 'object') continue
    const o = w as Partial<BewaardeWedstrijd>
    const id = Number(o.id)
    if (!Number.isFinite(id) || id <= 0 || gezien.has(id)) continue
    gezien.add(id)
    uit.push({
      id,
      home: String(o.home ?? '—'),
      away: String(o.away ?? '—'),
      date: String(o.date ?? ''),
      reeks: o.reeks ? String(o.reeks) : null,
    })
  }
  return uit.slice(0, MAX_BEWAARD)
}

/** Zet een wedstrijd erbij of haalt ze eruit. Geeft het nieuwe lijstje terug (op datum gesorteerd). */
export function wisselBewaard(lijst: BewaardeWedstrijd[], w: BewaardeWedstrijd): BewaardeWedstrijd[] {
  const bestaat = lijst.some((x) => x.id === w.id)
  const volgend = bestaat ? lijst.filter((x) => x.id !== w.id) : [...lijst, w]
  return volgend.sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_BEWAARD)
}

/** Enkel wat nog gespeeld moet worden (met wat marge, zodat een lopende wedstrijd blijft staan). */
export function nogTeSpelen(lijst: BewaardeWedstrijd[], nu = Date.now()): BewaardeWedstrijd[] {
  const marge = 3 * 60 * 60 * 1000
  return lijst.filter((w) => {
    const t = new Date(w.date).getTime()
    return Number.isNaN(t) || t >= nu - marge
  })
}

/** Agenda-link voor het hele lijstje in één bestand (zie /api/agenda/ics). */
export function agendaLinkVoor(lijst: BewaardeWedstrijd[]): string | null {
  if (lijst.length === 0) return null
  return `/api/agenda/ics?matches=${lijst.map((w) => w.id).join(',')}&name=${encodeURIComponent('Mijn wedstrijden')}`
}
