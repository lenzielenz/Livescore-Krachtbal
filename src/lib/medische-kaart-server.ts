import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { formatDateBE } from './datetime'
import { kaartCode, kaartLink } from './medische-kaart-code'
import { scanKaart } from './medische-kaart-scan'
import { clubStaf, meld, relId } from './meldingen'
import { isOuderVan } from './ouders'
import { clubMagBewerken } from './registratie'
import { attestFout, attestOpslaan, clubPloegen } from './registratie-server'
import type { MedischeKaartData } from './submit/pdf-medische-kaart'
import { huidigSeizoen } from './uitlening'

// De medische kaart met QR (lib/medische-kaart-code.ts, submit/pdf-medische-kaart.ts): wie welke kaart
// mag afdrukken en opladen, en het opladen zelf — één kaart of een hele stapel. De QR op de foto zegt
// bij welk lid een kaart hoort; de gebruiker hoeft niemand te kiezen.
//
// Wie mag wat (medisch document, GDPR):
//   • de federatie: elk lid;
//   • de staf van een club: de leden van de eigen club (via de ploegen — players.club is bij oude leden leeg);
//   • het lid zelf of een ouder: het eigen dossier. Afdrukken pas als de federatie de kaart "verstuurd"
//     heeft (de aanvraag via Mijn profiel blijft de weg); opladen altijd.

export type Rol = 'federatie' | 'club' | 'lid'
type Speler = Record<string, unknown> & { id: number | string }

export async function kaartRol(payload: Payload, user: unknown, speler: Speler | null): Promise<Rol | null> {
  if (!user || !speler) return null
  if (isFederationLevel(user)) return 'federatie'
  const playerId = Number(speler.id)
  if (relId((user as { player?: unknown }).player) === playerId || isOuderVan(user, playerId)) return 'lid'
  const club = userClubId(user)
  if (club != null && hasRole(user, 'club-beheerder', 'club-medewerker')) {
    if (relId(speler.club) != null && String(relId(speler.club)) === String(club)) return 'club'
    const team = relId(speler.team)
    if (team != null && (await clubPloegen(payload, club)).has(team)) return 'club'
  }
  return null
}

const speler = (payload: Payload, id: number) =>
  payload.findByID({ collection: 'players', id, depth: 0, overrideAccess: true }).then((p) => p as unknown as Speler).catch(() => null)

/** Mag deze gebruiker de kaart van dit lid afdrukken? */
export async function magKaartAfdrukken(payload: Payload, user: unknown, playerId: number): Promise<boolean> {
  const rol = await kaartRol(payload, user, await speler(payload, playerId))
  if (rol === 'federatie' || rol === 'club') return true
  if (rol !== 'lid') return false
  const verstuurd = await payload.count({
    collection: 'medische-kaart-aanvragen',
    where: { and: [{ player: { equals: playerId } }, { status: { equals: 'verstuurd' } }] },
    overrideAccess: true,
  })
  return verstuurd.totalDocs > 0
}

/** De gegevens voor de PDF van deze leden (in deze volgorde; onbekende ids vallen weg). */
export async function kaartGegevens(payload: Payload, playerIds: number[], basis: string): Promise<MedischeKaartData[]> {
  if (!playerIds.length) return []
  const [res, seizoen] = await Promise.all([
    payload.find({ collection: 'players', where: { id: { in: playerIds } }, depth: 2, limit: playerIds.length, pagination: false, overrideAccess: true }),
    huidigSeizoen(payload),
  ])
  const per = new Map(res.docs.map((p) => [Number(p.id), p as unknown as Record<string, unknown>]))
  const naamVan = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
  return playerIds.flatMap((id) => {
    const p = per.get(id)
    if (!p) return []
    const team = p.team && typeof p.team === 'object' ? (p.team as { club?: unknown }) : null
    return [
      {
        playerId: id,
        naam: String(p.name ?? ''),
        geboortedatum: p.birthDate ? formatDateBE(String(p.birthDate)) : null,
        club: naamVan(p.club) || naamVan(team?.club) || null,
        vergunningsnummer: p.vergunningsnummer ? String(p.vergunningsnummer) : null,
        categorie: p.berekendeCategorie ? String(p.berekendeCategorie) : null,
        seizoen: seizoen.label,
        code: kaartCode(id),
        link: kaartLink(basis, id),
      },
    ]
  })
}

export type OpgeladenKaart =
  | { bestand: string; ok: true; playerId: number; naam: string; viaQr: boolean }
  | { bestand: string; ok: false; fout: string }

/**
 * Een of meer foto's/scans van ingevulde kaarten opladen. Per bestand: de QR lezen → het lid; mag deze
 * gebruiker dat lid? → attest bewaren (het vorige vervangen) en, met `datum`, de keuringsdatum zetten.
 * `voorLid`: het lid waarvoor de gebruiker oplaadt (de pagina achter de QR, of "Mijn profiel"); geldt
 * enkel bij één bestand, en enkel als de foto geen leesbare QR heeft — een kaart van een ánder lid
 * wordt geweigerd. Meldingen: lid/ouder laadt op → de club kijkt na; de club of de federatie → het lid.
 */
export async function kaartenOpladen(
  payload: Payload,
  user: { id: unknown } & Record<string, unknown>,
  bestanden: File[],
  o: { datum?: string | null; voorLid?: number | null } = {},
): Promise<OpgeladenKaart[]> {
  const datum = o.datum && /^\d{4}-\d{2}-\d{2}$/.test(o.datum) ? o.datum : null
  if (datum && (Number.isNaN(Date.parse(datum)) || Date.parse(datum) > Date.now() + 86_400_000)) {
    return bestanden.map((b) => ({ bestand: b.name, ok: false as const, fout: 'De datum van de keuring kan niet in de toekomst liggen.' }))
  }
  const uit: OpgeladenKaart[] = []
  const gemeld = new Map<number, { naam: string; club: number | null; rol: Rol }>()
  for (const b of bestanden) {
    const fout = attestFout(b)
    if (fout) {
      uit.push({ bestand: b.name, ok: false, fout })
      continue
    }
    const scan = await scanKaart(Buffer.from(await b.arrayBuffer()), b.type)
    if (scan && o.voorLid != null && bestanden.length === 1 && scan.playerId !== o.voorLid) {
      uit.push({ bestand: b.name, ok: false, fout: 'Dit is de kaart van een ander lid (zie de QR-code). Laad ze op bij dat lid, of via "Kaarten opladen".' })
      continue
    }
    const playerId = scan?.playerId ?? (bestanden.length === 1 ? (o.voorLid ?? null) : null)
    if (playerId == null) {
      uit.push({ bestand: b.name, ok: false, fout: 'Geen QR-code gevonden. Neem een scherpere foto van de hele kaart, of laad ze op bij het lid zelf.' })
      continue
    }
    const sp = await speler(payload, playerId)
    const rol = await kaartRol(payload, user, sp)
    if (!sp || !rol) {
      uit.push({ bestand: b.name, ok: false, fout: 'Deze kaart hoort bij een lid waarvoor je niet mag opladen.' })
      continue
    }
    if (rol !== 'federatie' && !clubMagBewerken(sp.registratieStatus as string)) {
      uit.push({ bestand: b.name, ok: false, fout: `${String(sp.name ?? 'Dit lid')} ligt bij de federatie ter goedkeuring; probeer na de beslissing opnieuw.` })
      continue
    }
    const club = relId(sp.club)
    await attestOpslaan(payload, { playerId, clubId: club, userId: Number(user.id), bestand: b, vorige: relId(sp.medischAttestBestand), herkendViaQr: scan != null })
    if (datum) await payload.update({ collection: 'players', id: playerId, data: { medischeKeuringOp: datum }, overrideAccess: true })
    uit.push({ bestand: b.name, ok: true, playerId, naam: String(sp.name ?? ''), viaQr: scan != null })
    gemeld.set(playerId, { naam: String(sp.name ?? ''), club, rol })
  }

  // Eén melding per lid; de club krijgt bij een stapel van een lid/ouder er telkens één per lid.
  for (const [, g] of gemeld) {
    if (g.rol === 'lid') {
      await meld(payload, await clubStaf(payload, g.club), {
        titel: `🩺 Nieuwe medische kaart voor ${g.naam}`,
        tekst: 'Het lid of een ouder laadde de ingevulde kaart op. Kijk ze na.',
        url: '/club/leden',
      })
    }
  }
  return uit
}
