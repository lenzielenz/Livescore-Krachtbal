import type { AttestLezing } from './medische-kaart-lezen'

// Het medisch attest: wanneer keurt het systeem het zelf goed, en wanneer kijkt de federatie het na? Puur —
// gedeeld door elke weg waarlangs een attest binnenkomt (de club, het lid of de ouder op "Mijn profiel", de
// QR-pagina, de publieke link /attest) en door de wachtrij van de federatie (lib/attest-server.ts).
//
// Automatisch goedgekeurd enkel als ALLES juist staat:
//   · de QR-code van het lid staat op de foto (het systeem weet van wie het attest is);
//   · het blad is uitgelijnd op de vier hoekmerken (dus de vakjes zijn echt gelezen, niet geschat);
//   · de arts kruiste "geschikt" aan, en het vakje "mag niet hoger" is duidelijk (aangekruist of leeg).
// Al de rest gaat naar de federatie: een blanco attest (zonder lid), een foto zonder QR (bv. het eigen
// formulier van de arts), een onduidelijk vakje, of "geschikt" niet aangekruist.

export type AttestStatus = 'goedgekeurd' | 'nakijken' | 'afgekeurd'

export const ATTEST_STATUS_OPTIONS: { label: string; value: AttestStatus }[] = [
  { label: 'Goedgekeurd', value: 'goedgekeurd' },
  { label: 'Bij de federatie ter nakijken', value: 'nakijken' },
  { label: 'Afgekeurd', value: 'afgekeurd' },
]

export type Beoordeling = { status: AttestStatus; reden: string | null }

export function beoordeelAttest(o: { lid: boolean; viaQr: boolean; lezing: AttestLezing | null; doorFederatie?: boolean }): Beoordeling {
  if (!o.lid) return { status: 'nakijken', reden: 'Blanco attest: de federatie zoekt het lid op.' }
  if (o.doorFederatie) return { status: 'goedgekeurd', reden: null }
  if (!o.viaQr) return { status: 'nakijken', reden: 'Geen QR-code van het lid op de foto: de federatie kijkt het attest na.' }
  const l = o.lezing
  if (!l || l.uitlijning !== 'merken') {
    return { status: 'nakijken', reden: 'De vier zwarte hoeken stonden niet (allemaal) scherp in beeld: de federatie kijkt het attest na.' }
  }
  if (l.vakjes.geschikt.aangekruist === false) return { status: 'nakijken', reden: 'Het vakje "geschikt voor de krachtbalsport" is niet aangekruist.' }
  if (l.vakjes.geschikt.aangekruist === null) return { status: 'nakijken', reden: 'Het vakje "geschikt" kon niet duidelijk gelezen worden.' }
  if (l.vakjes.nietHoger.aangekruist === null) return { status: 'nakijken', reden: 'Het vakje "mag niet 1 categorie hoger spelen" kon niet duidelijk gelezen worden.' }
  return { status: 'goedgekeurd', reden: null }
}

/** Wat een blanco attest meebrengt: wie de uploader zegt dat het is (het lid staat er met de hand op). */
export type Opgegeven = {
  naam: string
  geboortedatum: string | null
  club: string | null
  email: string | null
  /** Het lid dat het systeem erbij vond (zelfde naam en geboortedatum), als voorstel voor de federatie. */
  voorstelLid?: number | null
}

const schoon = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max)

/** De gegevens van een blanco attest nakijken; null als de naam ontbreekt. */
export function opgegevenUit(invoer: Record<string, unknown>): Opgegeven | null {
  const naam = schoon(invoer.naam, 100)
  if (naam.length < 3) return null
  const g = schoon(invoer.geboortedatum, 10)
  const email = schoon(invoer.email, 120).toLowerCase()
  return {
    naam,
    geboortedatum: /^\d{4}-\d{2}-\d{2}$/.test(g) && !Number.isNaN(Date.parse(g)) ? g : null,
    club: schoon(invoer.club, 100) || null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  }
}

/**
 * Een naam zoals we hem tonen aan wie zonder login oplaadt: voornaam en de eerste letter van de familienaam
 * ("Kaat K."). Genoeg om te zien dat het attest bij het juiste kind kwam, zonder een medisch dossier aan een
 * naam te hangen voor wie toevallig de link heeft.
 */
export function korteNaam(voornaam: unknown, naam: unknown): string {
  const vn = String(voornaam ?? '').trim()
  const volledig = String(naam ?? '').trim()
  const delen = volledig.split(/\s+/).filter(Boolean)
  const voor = vn || delen[0] || 'Het lid'
  const rest = vn && volledig.toLowerCase().startsWith(vn.toLowerCase()) ? volledig.slice(vn.length).trim() : delen.slice(1).join(' ')
  return rest ? `${voor} ${rest[0]!.toUpperCase()}.` : voor
}
