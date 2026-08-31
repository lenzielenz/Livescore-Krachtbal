// De veertien kruispunten van een krachtbalveld, in de volgorde waarin je ze op het veld
// tegenkomt: achterlijn, doellijn, vrijeworplijn, middellijn, vrijeworplijn, doellijn,
// achterlijn — telkens links en rechts. Eén bron voor het aanduidscherm en de controle op
// de server, zodat er nooit een label bestaat dat de een kent en de ander weigert.
//
// Spiegelbeeld van cv/veld.py (`kruispunten`): dezelfde namen, dezelfde volgorde.

export type Dwarslijn = { sleutel: string; naam: string; kant: string | null }

export const DWARSLIJNEN: Dwarslijn[] = [
  { sleutel: 'achterlijn_thuis', naam: 'Achterlijn', kant: 'thuiskant' },
  { sleutel: 'doellijn_thuis', naam: 'Doellijn', kant: 'thuiskant' },
  { sleutel: 'vrijeworplijn_thuis', naam: 'Vrijeworplijn', kant: 'thuiskant' },
  { sleutel: 'middellijn', naam: 'Middellijn', kant: null },
  { sleutel: 'vrijeworplijn_uit', naam: 'Vrijeworplijn', kant: 'uitkant' },
  { sleutel: 'doellijn_uit', naam: 'Doellijn', kant: 'uitkant' },
  { sleutel: 'achterlijn_uit', naam: 'Achterlijn', kant: 'uitkant' },
]

export const ZIJDEN = ['links', 'rechts'] as const
export type Zijde = (typeof ZIJDEN)[number]

export function labelVan(lijn: string, zijde: Zijde): string {
  return `${lijn}_${zijde}`
}

/** Alle veertien labels, in veldvolgorde. */
export const ALLE_LABELS: string[] = DWARSLIJNEN.flatMap((l) => ZIJDEN.map((z) => labelVan(l.sleutel, z)))

/** Leesbare omschrijving van één punt, zoals ze in het scherm staat. */
export function omschrijving(lijn: Dwarslijn, zijde: Zijde): string {
  return `${lijn.naam}${lijn.kant ? ` ${lijn.kant}` : ''} — ${zijde}`
}

export function geldigLabel(label: unknown): boolean {
  return typeof label === 'string' && ALLE_LABELS.includes(label)
}
