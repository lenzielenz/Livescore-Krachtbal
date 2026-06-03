import { PACKAGE_TIERS, type PackageTier } from './packages'

// Client-veilige helpers voor de admin pakket-preview. Bewust GESCHEIDEN van
// package-preview.ts: dat bestand importeert `next/headers` (server-only), wat
// de client-bundle breekt zodra een client-component (AdminBar) de cookienaam
// nodig heeft. Hier staan enkel waarden zonder server-afhankelijkheden.
export const PKG_PREVIEW_COOKIE = 'kb_pkg_preview'

/** Normaliseer een cookie-waarde naar een geldig pakketniveau (of null). */
export function asPreviewTier(value: unknown): PackageTier | null {
  return typeof value === 'string' && (PACKAGE_TIERS as string[]).includes(value)
    ? (value as PackageTier)
    : null
}
