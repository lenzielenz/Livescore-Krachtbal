import type { Payload } from 'payload'

// Centrale scherm-selecties leven op de settings-global, zodat je vanaf één
// toestel (de cast-pagina) kiest wát er op de tv's verschijnt, terwijl de tv's
// gewoon een vaste scherm-URL openen en de selectie pollen. Geen Chromecast of
// login nodig — werkt op elk toestel met een browser (ook iPhone).

// De centraal gekozen wedstrijd voor het veldscherm (of null als er geen staat).
export async function readVeldMatchId(payload: Payload): Promise<number | null> {
  const s = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  const raw = (s as { veldMatchId?: string | null } | null)?.veldMatchId ?? ''
  const n = Number(String(raw).trim())
  return Number.isFinite(n) && n > 0 ? n : null
}
