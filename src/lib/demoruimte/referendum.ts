import type { Payload } from 'payload'

import { kandidaten, rondeVan } from '@/lib/referendum-server'
import { kiesbaarVoor, PUNTEN, type Competitie } from '@/lib/referendum'
import { demoEmail } from './rollen'

// Het referendum in de demoruimte: een open stemronde voor de reeksen van de demowereld (RHA/RDA),
// met de demo-speler die mag stemmen en al een deel stemmen van andere spelers, zodat de federatie
// meteen een tussenstand en een uitslag kan tonen. "Referendum resetten" zet precies deze toestand
// terug — los van de rest van de demo, om het na een stem of een bekendmaking opnieuw te tonen.
//
// Enkel aanroepen in de demo-omgeving (de route controleert dat): het wist de stemmen en de
// bekendgemaakte prijzen van dit seizoen.

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

/** Hoeveel andere spelers per competitie al gestemd hebben: genoeg voor een echte tussenstand. */
const ANDERE_STEMMERS = 8

export async function demoReferendumKlaarzetten(payload: Payload): Promise<string> {
  const wedstrijd = (await payload.find({ collection: 'matches', where: { reeks: { equals: 'RHA' } }, sort: '-date', limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const seizoen = String((wedstrijd as { seizoen?: unknown } | undefined)?.seizoen ?? '')
  if (!seizoen) throw new Error('Geen demoseizoen gevonden — zet de demo eerst klaar.')

  // Opruimen: de ronde van dit seizoen, haar stemmen en de prijzen die eruit bekendgemaakt werden.
  const oud = await payload.find({ collection: 'referendum-rondes', where: { seizoen: { equals: seizoen } }, depth: 0, limit: 10, overrideAccess: true })
  for (const r of oud.docs) {
    await payload.delete({ collection: 'referendum-stemmen', where: { ronde: { equals: r.id } }, overrideAccess: true })
    await payload.delete({ collection: 'referendum-rondes', id: r.id, overrideAccess: true })
  }
  const prijzen = await payload.find({ collection: 'referendum-awards', depth: 0, limit: 50, pagination: false, overrideAccess: true })
  for (const p of prijzen.docs) {
    const rest = (p.winnaars ?? []).filter((w) => w.jaar !== seizoen).map((w) => ({ jaar: w.jaar, naam: w.naam, club: w.club }))
    if (rest.length === (p.winnaars ?? []).length) continue
    if (rest.length) await payload.update({ collection: 'referendum-awards', id: p.id, data: { winnaars: rest }, overrideAccess: true })
    else await payload.delete({ collection: 'referendum-awards', id: p.id, overrideAccess: true })
  }
  // Andere rondes die nog open staan sluiten: er mag er maar één open zijn.
  await payload.update({ collection: 'referendum-rondes', where: { status: { equals: 'open' } }, data: { status: 'gesloten' }, overrideAccess: true })

  // Het minimum aantal wedstrijden volgt de demowereld (een half seizoen): zo ver dat de demo-speler
  // net meedoet, maximaal 3 — zodat ook te zien is dat niet iedereen mag stemmen.
  const doc = await payload.create({
    collection: 'referendum-rondes',
    data: { seizoen, status: 'open', reeksHeren: 'RHA', reeksDames: 'RDA', minWedstrijden: 1, maxLeeftijdBelofte: 21 } as never,
    overrideAccess: true,
  })
  const speler = (await payload.find({ collection: 'users', where: { email: { equals: demoEmail('speler') } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
  const spelerId = relId(speler?.player)
  const heren = await kandidaten(payload, rondeVan(doc as never), 'heren')
  const ik = heren.find((k) => k.id === spelerId)
  const min = Math.max(1, Math.min(3, ik?.gespeeld ?? 3))
  const ronde = rondeVan((await payload.update({ collection: 'referendum-rondes', id: doc.id, data: { minWedstrijden: min }, overrideAccess: true })) as never)

  // Andere spelers stemmen al: elk geeft 5–1 punt aan vijf kiesbare spelers. Vast patroon (geen
  // toeval), zodat de tussenstand bij elke demo hetzelfde verhaal vertelt.
  let gestemd = 0
  for (const competitie of ['heren', 'dames'] as Competitie[]) {
    const lijst = await kandidaten(payload, ronde, competitie)
    const stemmers = lijst.filter((k) => k.id !== spelerId).slice(0, ANDERE_STEMMERS)
    for (const [i, s] of stemmers.entries()) {
      const kiesbaar = kiesbaarVoor({ id: s.id, clubId: s.clubId }, lijst)
      if (kiesbaar.length < PUNTEN.length) continue
      const gekozen = Array.from({ length: PUNTEN.length }, (_, j) => kiesbaar[(j * 2 + i) % kiesbaar.length])
      if (new Set(gekozen.map((k) => k.id)).size < PUNTEN.length) continue
      await payload.create({
        collection: 'referendum-stemmen',
        data: { ronde: ronde.id, stemmer: s.id, competitie, regels: gekozen.map((k, j) => ({ speler: k.id, punten: PUNTEN[j] })) } as never,
        overrideAccess: true,
      })
      gestemd++
    }
  }
  return `Referendum ${seizoen} open: min. ${min} wedstrijden, ${gestemd} spelers stemden al — de demo-speler mag nog stemmen`
}
