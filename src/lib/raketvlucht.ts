// De baan van de rugworp-raket op het kantinescherm: van het logo van de scorende club, in een
// grote boog over het hele scherm, tot in het logo van de tegenstander.
//
// Puur: enkel meetkunde en de tijdlijn. Het tekenen (vuurspoor, rook, vonken, inslag) gebeurt in
// KantineCelebration.tsx op een canvas; wat hier staat, valt zonder browser te testen.

export type Punt = { x: number; y: number }

/** Na hoeveel ms de raket vertrekt (eerst even een lanceerflits). */
export const LANCEER_MS = 220
/** Hoelang de vlucht zelf duurt. */
export const VLUCHT_MS = 1350
/** Het moment van de inslag. */
export const INSLAG_MS = LANCEER_MS + VLUCHT_MS

/**
 * De twee stuurpunten van de kubische Bézierboog. De raket stijgt steil op en trekt een grote boog
 * tot bijna bovenaan het scherm, over de breedte heen, om dan van boven in het doel te duiken: een
 * baan die het hele scherm gebruikt, niet een rechte lijn tussen twee logo's.
 */
export function stuurpunten(van: Punt, naar: Punt, scherm: { b: number; h: number }): [Punt, Punt] {
  const dx = naar.x - van.x
  const top = Math.max(scherm.h * 0.02, Math.min(van.y, naar.y) - scherm.h * 0.75)
  return [
    { x: van.x + dx * 0.2, y: top },
    { x: van.x + dx * 0.8, y: top },
  ]
}

/** Een punt op de kubische Bézier (t van 0 tot 1). */
export function bezier(p0: Punt, p1: Punt, p2: Punt, p3: Punt, t: number): Punt {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/** De richting (raaklijn) op t, als hoek in radialen. */
export function richting(p0: Punt, p1: Punt, p2: Punt, p3: Punt, t: number): number {
  const u = 1 - t
  const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x)
  const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  return Math.atan2(dy, dx)
}

/**
 * Hoe ver de raket is op tijdstip `ms` (0 = vertrek, 1 = inslag). Hij trekt traag op en gaat
 * steeds sneller — een raket, geen bal.
 */
export function voortgang(ms: number): number {
  const u = Math.min(1, Math.max(0, (ms - LANCEER_MS) / VLUCHT_MS))
  // Afklemmen: de formule geeft bij u = 1 net iets meer dan 1, en dan schiet de raket voorbij.
  return Math.min(1, u * u * (2.2 - 1.2 * u))
}

/**
 * De 🚀-emoji wijst zelf schuin naar rechtsboven (−45°). Om hem langs de baan te laten wijzen,
 * draaien we hem dus met de richting plus een kwartslag-helft.
 */
export function emojiDraaiing(hoek: number): number {
  return hoek + Math.PI / 4
}
