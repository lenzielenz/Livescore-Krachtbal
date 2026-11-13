// De vaste maten van het medisch attest met QR (A4, in mm, oorsprong linksboven). Eén bron voor twee kanten:
// de PDF (lib/submit/pdf-medische-kaart.ts) tekent hier, en de lezer (lib/medische-kaart-lezen.ts) zoekt hier.
// Verschuift er iets op het blad, dan verschuift het voor allebei — ze kunnen niet uit elkaar lopen.
//
// Uitlijning bij het importeren: eerst de QR (zegt van wie de kaart is én waar ze ongeveer ligt), dan de vier
// zwarte hoekmerken (exacte ligging, ook bij een scheve gsm-foto). Daarmee worden de aankruisvakjes gelezen.
// Rond de hoekmerken blijft het blad leeg, anders verwart de lezer tekst met een merk.

export const PAGINA = { b: 210, h: 297 } as const

export type Rect = { x: number; y: number; b: number; h: number }

/** De vier hoekmerken (volle zwarte vierkanten): linksboven, rechtsboven, linksonder, rechtsonder. */
export const MERK_MAAT = 7
export const MERKEN: readonly Rect[] = [
  { x: 8, y: 8, b: MERK_MAAT, h: MERK_MAAT },
  { x: PAGINA.b - 8 - MERK_MAAT, y: 8, b: MERK_MAAT, h: MERK_MAAT },
  { x: 8, y: PAGINA.h - 8 - MERK_MAAT, b: MERK_MAAT, h: MERK_MAAT },
  { x: PAGINA.b - 8 - MERK_MAAT, y: PAGINA.h - 8 - MERK_MAAT, b: MERK_MAAT, h: MERK_MAAT },
]
export const midden = (r: Rect) => ({ x: r.x + r.b / 2, y: r.y + r.h / 2 })

/** De QR: het beeld (met een stille rand van QR_MARGE modules) op deze plaats. */
export const QR: Rect = { x: 152, y: 22, b: 40, h: 40 }
export const QR_MARGE = 2

/** De aankruisvakjes van de arts. */
export const VAKJES = {
  geschikt: { x: 20, y: 146, b: 8, h: 8 },
  nietHoger: { x: 20, y: 160, b: 8, h: 8 },
} as const satisfies Record<string, Rect>
export type Vakje = keyof typeof VAKJES

/** Binnen een vakje lezen we pas vanaf deze rand (de lijn van het vakje zelf telt niet mee). */
export const VAKJE_BINNENRAND = 1.4

/** De datum van het onderzoek: acht hokjes (dd mm jjjj) — leesbaar voor wie de datum overneemt. */
export const DATUM_Y = 182
export const DATUM_HOKJE = 7

/** Stempel en handtekening, en het vak van de federatie. */
export const STEMPEL: Rect = { x: 20, y: 200, b: 81, h: 30 }
export const HANDTEKENING: Rect = { x: 109, y: 200, b: 81, h: 30 }
export const ONTVANGEN: Rect = { x: 134, y: 240, b: 56, h: 22 }
