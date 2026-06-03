import { cookies } from 'next/headers'

import {
  PACKAGE_TIERS,
  getPackage,
  resolveMatchPackage,
  type PackageDef,
  type PackageTier,
} from './packages'

// Admin-only pakket-preview. Een admin kan tijdelijk een ander pakketniveau
// "bekijken" (Starter/Team/Elite) om te zien hoe de functies per pakket
// verschillen, ZONDER het pakket van de club echt te wijzigen. De keuze leeft in
// een cookie en geldt enkel in de eigen weergave (server leest de cookie alleen
// voor admins terug).
export const PKG_PREVIEW_COOKIE = 'kb_pkg_preview'

/** Normaliseer een cookie-waarde naar een geldig pakketniveau (of null). */
export function asPreviewTier(value: unknown): PackageTier | null {
  return typeof value === 'string' && (PACKAGE_TIERS as string[]).includes(value)
    ? (value as PackageTier)
    : null
}

/** Lees de actieve pakket-preview (alleen geldig voor admins). */
export async function readPackagePreview(isAdmin: boolean): Promise<PackageTier | null> {
  if (!isAdmin) return null
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
