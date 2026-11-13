import type { Payload, Where } from 'payload'

import { dateStrBE, formatDateBE } from './datetime'
import { ploegenEnClubs } from './leden-register-server'
import { relId } from './meldingen'
import { huidigSeizoen } from './uitlening'

// Lidmaatschap per seizoen en de verzekerdenlijst. Aangesloten (en dus verzekerd bij de federatie) is een lid dat
// actief is en goedgekeurd: een speler met een geldige vergunning, of een goedgekeurd gewoon lid. Dat verandert
// in de loop van het seizoen; daarom leggen we per seizoen en per club vast VAN WANNEER TOT WANNEER iemand
// aangesloten was (collection "lidmaatschappen"). Zo blijft de lijst van een voorbij seizoen dezelfde, ook als
// het lid nadien stopt of van club verandert.

type Lid = { id: number; club: number | null; soort: 'speler' | 'lid' }

/** Wie is nu aangesloten, en bij welke club? (Oudere leden: de club volgt uit de ploeg.) */
export async function aangeslotenNu(payload: Payload): Promise<Lid[]> {
  const [res, pc] = await Promise.all([
    payload.db.find<{ id: number; club?: unknown; team?: unknown; soortLid?: string | null; vergunningsstatus?: string | null; registratieStatus?: string | null; actief?: boolean | null }>({
      collection: 'players',
      where: { and: [{ analyseOnly: { not_equals: true } }, { or: [{ actief: { equals: true } }, { actief: { exists: false } }] }] } as Where,
      limit: 0,
      pagination: false,
      select: { club: true, team: true, soortLid: true, vergunningsstatus: true, registratieStatus: true, actief: true },
    }),
    ploegenEnClubs(payload),
  ])
  const uit: Lid[] = []
  for (const p of res.docs) {
    const lid = (p.soortLid ?? 'speler') === 'lid'
    const ok = lid ? p.registratieStatus === 'goedgekeurd' : p.vergunningsstatus === 'geldig'
    if (!ok) continue
    uit.push({ id: Number(p.id), club: relId(p.club) ?? pc.clubVanPloeg.get(relId(p.team) ?? -1) ?? null, soort: lid ? 'lid' : 'speler' })
  }
  return uit
}

const sleutelVan = (seizoen: string, player: number, club: number | null) => `${seizoen}:${player}:${club ?? 0}`

/**
 * De lidmaatschappen van het lopende seizoen bijwerken naar wie nu aangesloten is: nieuwe leden erbij (vanaf
 * vandaag), wie niet meer aangesloten is (of van club veranderde) afsluiten (tot vandaag), wie terugkomt weer
 * openzetten. Idempotent: twee keer na elkaar verandert niets.
 */
export async function lidmaatschappenBijwerken(payload: Payload, nu: Date = new Date()): Promise<{ nieuw: number; gestopt: number; terug: number; seizoen: string }> {
  const seizoen = (await huidigSeizoen(payload, nu)).label
  const vandaag = dateStrBE(nu)
  const [nu_, bestaand] = await Promise.all([
    aangeslotenNu(payload),
    payload.db.find<{ id: number; sleutel?: string | null; tot?: string | null }>({
      collection: 'lidmaatschappen',
      where: { seizoen: { equals: seizoen } },
      limit: 0,
      pagination: false,
      select: { sleutel: true, tot: true },
    }),
  ])
  const perSleutel = new Map(bestaand.docs.map((d) => [String(d.sleutel), d]))
  const actueel = new Set<string>()
  let nieuw = 0
  let gestopt = 0
  let terug = 0
  for (const l of nu_) {
    const k = sleutelVan(seizoen, l.id, l.club)
    actueel.add(k)
    const d = perSleutel.get(k)
    if (!d) {
      await payload.create({ collection: 'lidmaatschappen', data: { player: l.id, club: l.club, seizoen, soort: l.soort, vanaf: vandaag, sleutel: k } as never, overrideAccess: true })
      nieuw++
    } else if (d.tot) {
      await payload.update({ collection: 'lidmaatschappen', id: d.id, data: { tot: null } as never, overrideAccess: true })
      terug++
    }
  }
  for (const d of bestaand.docs) {
    if (actueel.has(String(d.sleutel)) || d.tot) continue
    await payload.update({ collection: 'lidmaatschappen', id: d.id, data: { tot: vandaag } as never, overrideAccess: true })
    gestopt++
  }
  return { nieuw, gestopt, terug, seizoen }
}

export type VerzekerdeRij = {
  id: number
  naam: string
  voornaam: string
  achternaam: string
  geboortedatum: string
  geslacht: string
  straat: string
  postcode: string
  gemeente: string
  land: string
  club: string
  clubId: number | null
  soort: 'speler' | 'lid'
  vergunningsnummer: string
  vanaf: string
  tot: string | null
}

/** De verzekerden van een seizoen (optioneel per club, of enkel wie aansloot sinds een datum). */
export async function verzekerden(payload: Payload, seizoen: string, o: { club?: number | null; sinds?: string | null } = {}): Promise<VerzekerdeRij[]> {
  const res = await payload.find({
    collection: 'lidmaatschappen',
    where: {
      and: [
        { seizoen: { equals: seizoen } },
        ...(o.club ? [{ club: { equals: o.club } }] : []),
        ...(o.sinds && /^\d{4}-\d{2}-\d{2}$/.test(o.sinds) ? [{ vanaf: { greater_than_equal: o.sinds } }] : []),
      ],
    },
    depth: 1,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  const dag = (v: unknown) => (v ? String(v).slice(0, 10) : '')
  return res.docs
    .map((d) => {
      const p = (d.player && typeof d.player === 'object' ? d.player : {}) as Record<string, unknown>
      const c = (d.club && typeof d.club === 'object' ? d.club : {}) as { id?: number; name?: string }
      return {
        id: Number(p.id ?? 0),
        // Een lid dat later uit de databank verwijderd werd, blijft in de lijst van dat seizoen staan.
        naam: String(p.name ?? '(verwijderd lid)'),
        voornaam: String(p.voornaam ?? ''),
        achternaam: String(p.achternaam ?? ''),
        geboortedatum: dag(p.birthDate),
        geslacht: String(p.geslacht ?? ''),
        straat: String(p.straat ?? ''),
        postcode: String(p.postcode ?? ''),
        gemeente: String(p.gemeente ?? ''),
        land: String(p.land ?? ''),
        club: String(c.name ?? ''),
        clubId: c.id != null ? Number(c.id) : null,
        soort: d.soort === 'lid' ? ('lid' as const) : ('speler' as const),
        vergunningsnummer: String(p.vergunningsnummer ?? ''),
        vanaf: dag(d.vanaf),
        tot: d.tot ? dag(d.tot) : null,
      }
    })
    .sort((a, b) => a.club.localeCompare(b.club) || a.naam.localeCompare(b.naam))
}

/** De lijst voor de verzekeraar (CSV, puntkomma, BOM voor Excel). */
export function verzekerdenCsv(rijen: VerzekerdeRij[]): string {
  const cel = (v: unknown) => {
    const s = String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const kop = ['Naam', 'Voornaam', 'Geboortedatum', 'Geslacht', 'Straat', 'Postcode', 'Gemeente', 'Land', 'Club', 'Soort', 'Vergunningsnummer', 'Aangesloten vanaf', 'Tot']
  const datum = (d: string | null) => (d ? formatDateBE(d) : '')
  const lijnen = rijen.map((r) =>
    [r.achternaam || r.naam, r.voornaam, datum(r.geboortedatum), r.geslacht, r.straat, r.postcode, r.gemeente, r.land, r.club, r.soort === 'lid' ? 'gewoon lid' : 'speler', r.vergunningsnummer, datum(r.vanaf), datum(r.tot)]
      .map(cel)
      .join(';'),
  )
  return '﻿' + [kop.join(';'), ...lijnen].join('\r\n')
}

/** Het lidmaatschap van één lid (voor het attest van lidmaatschap): het lopende seizoen, anders het laatste. */
export async function lidmaatschapVan(payload: Payload, playerId: number, seizoen?: string | null): Promise<{ seizoen: string; club: string; vanaf: string; tot: string | null; soort: 'speler' | 'lid' } | null> {
  const res = await payload.find({
    collection: 'lidmaatschappen',
    where: { and: [{ player: { equals: playerId } }, ...(seizoen ? [{ seizoen: { equals: seizoen } }] : [])] },
    sort: '-vanaf',
    depth: 1,
    limit: 1,
    overrideAccess: true,
  })
  const d = res.docs[0]
  if (!d) return null
  return {
    seizoen: String(d.seizoen),
    club: d.club && typeof d.club === 'object' ? String((d.club as { name?: unknown }).name ?? '') : '',
    vanaf: String(d.vanaf).slice(0, 10),
    tot: d.tot ? String(d.tot).slice(0, 10) : null,
    soort: d.soort === 'lid' ? 'lid' : 'speler',
  }
}
