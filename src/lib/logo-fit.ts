// Weergave-instelling voor een clublogo binnen de ronde badge.
// Met `zoom` zoomt de aantekenaar/beheerder het logo in zodat het de badge mooi vult
// (bv. wapenschild-logo's met veel witruimte of tekst "komen er anders niet door").
// `offsetX`/`offsetY` verschuiven het logo binnen de badge (percentage van de badge, -50..50).
export type LogoFit = {
  zoom: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_LOGO_FIT: LogoFit = { zoom: 1, offsetX: 0, offsetY: 0 }

export const LOGO_ZOOM_MIN = 1
export const LOGO_ZOOM_MAX = 3
export const LOGO_OFFSET_RANGE = 50 // ± percentage

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

// Maakt een veilige LogoFit van ruwe (mogelijk ontbrekende) waarden uit de database.
export function normalizeLogoFit(raw: Partial<LogoFit> | null | undefined): LogoFit {
  if (!raw) return DEFAULT_LOGO_FIT
  return {
    zoom: clamp(typeof raw.zoom === 'number' && raw.zoom > 0 ? raw.zoom : 1, LOGO_ZOOM_MIN, LOGO_ZOOM_MAX),
    offsetX: clamp(typeof raw.offsetX === 'number' ? raw.offsetX : 0, -LOGO_OFFSET_RANGE, LOGO_OFFSET_RANGE),
    offsetY: clamp(typeof raw.offsetY === 'number' ? raw.offsetY : 0, -LOGO_OFFSET_RANGE, LOGO_OFFSET_RANGE),
  }
}

// True als de fit afwijkt van de standaard (en dus een transform nodig heeft).
export function hasLogoAdjustment(fit: LogoFit | null | undefined): boolean {
  if (!fit) return false
  return fit.zoom !== 1 || fit.offsetX !== 0 || fit.offsetY !== 0
}

// CSS-transform voor het <img> in de badge. Identiek in admin-preview én op de site,
// zodat "wat je opslaat" exact is wat het publiek ziet.
export function logoFitStyle(fit: LogoFit | null | undefined): React.CSSProperties | undefined {
  if (!hasLogoAdjustment(fit)) return undefined
  const f = normalizeLogoFit(fit)
  return {
    transform: `translate(${f.offsetX}%, ${f.offsetY}%) scale(${f.zoom})`,
    transformOrigin: 'center',
  }
}
