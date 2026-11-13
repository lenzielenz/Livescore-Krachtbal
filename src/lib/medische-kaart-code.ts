import { createHmac, timingSafeEqual } from 'node:crypto'

// De code op de medische kaart (QR + leesbaar). Ze wijst één lid aan zonder iets over dat lid te
// verklappen: enkel het dossiernummer en een handtekening met het server-geheim. Zo kan niemand een
// kaart "maken" voor een ander lid, en zegt de QR aan een vreemde niets (GDPR — het is een medisch
// document). De QR bevat de link /k/<code>: scannen met de gsm opent meteen de oplaadpagina van dat lid
// (enkel voor wie dat mag). Een foto of scan van de ingevulde kaart wordt bij het opladen gelezen
// (lib/medische-kaart-scan.ts) en komt zo bij het juiste lid.
//
// Vorm: "K" + dossiernummer (base 36) + "-" + 8 tekens handtekening (Crockford base 32: geen I, L, O, U
// — overtikken zonder verwarring). Bv. K2KQ-7F3KQ9XZ.

const ALFABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function geheim(): string {
  return process.env.PAYLOAD_SECRET || ''
}

function handtekening(playerId: number, sleutel = geheim()): string {
  const h = createHmac('sha256', `medische-kaart:${sleutel}`).update(String(Math.trunc(playerId))).digest()
  let uit = ''
  for (let i = 0; i < 8; i++) uit += ALFABET[h[i]! % 32]
  return uit
}

/** De code voor dit lid. */
export function kaartCode(playerId: number, sleutel?: string): string {
  return `K${Math.trunc(playerId).toString(36).toUpperCase()}-${handtekening(playerId, sleutel)}`
}

/** De link in de QR: `${basis}/k/<code>`. */
export function kaartLink(basis: string, playerId: number, sleutel?: string): string {
  return `${basis.replace(/\/+$/, '')}/k/${kaartCode(playerId, sleutel)}`
}

/**
 * Leest een code (los, overgetikt, of de volledige link uit de QR) en geeft het dossiernummer als de
 * handtekening klopt; anders null. Overtikken mag in kleine letters, met spaties, en met O/I/L in de
 * plaats van 0/1/1.
 */
export function leesKaartCode(tekst: string, sleutel?: string): number | null {
  const m = /(?:^|\/k\/|\s)(K[0-9A-Z]{1,10})\s*-?\s*([0-9A-Z]{8})(?:$|[\s/?#])/i.exec(String(tekst ?? '').trim())
  if (!m) return null
  const id = parseInt(m[1]!.slice(1), 36)
  if (!Number.isSafeInteger(id) || id <= 0) return null
  const gegeven = m[2]!.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')
  const juist = handtekening(id, sleutel)
  return gegeven.length === juist.length && timingSafeEqual(Buffer.from(gegeven), Buffer.from(juist)) ? id : null
}
