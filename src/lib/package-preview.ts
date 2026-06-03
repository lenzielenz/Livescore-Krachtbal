import { cookies } from 'next/headers'

import { PACKAGES_ENABLED, getPackage, resolveMatchPackage, type PackageDef, type PackageTier } from './packages'
import { PKG_PREVIEW_COOKIE, asPreviewTier } from './package-preview-shared'

// Admin-only pakket-preview (server-kant). Een admin kan tijdelijk een ander
// pakketniveau "bekijken" (Starter/Team/Elite) om te zien hoe de functies per
// pakket verschillen, ZONDER het pakket van de club echt te wijzigen. De keuze
// leeft in een cookie en geldt enkel in de eigen weergave (server leest de
// cookie alleen voor admins terug).
//
// De cookienaam + normalisatie staan in package-preview-shared.ts zodat
// client-componenten ze kunnen importeren zonder `next/headers` mee te bundelen.
export { PKG_PREVIEW_COOKIE, asPreviewTier }

/** Lees de actieve pakket-preview (alleen geldig voor admins; uit wanneer de
 * pakket-feature gedeactiveerd is). */
export async function readPackagePreview(isAdmin: boolean): Promise<PackageTier | null> {
  if (!isAdmin || !PACKAGES_ENABLED) return null
  const store = await cookies()
  return asPreviewTier(store.get(PKG_PREVIEW_COOKIE)?.value)
}

/**
 * Effectief pakket voor een wedstrijd: een actieve admin-preview overschrijft het
 * clubpakket, anders valt het terug op het pakket van de thuisclub.
 */
export function effectiveMatchPackage(
  match: { homeTeam?: unknown } | null | undefined,
  previewTier: PackageTier | null,
): PackageDef {
  return previewTier ? getPackage(previewTier) : resolveMatchPackage(match)
}
