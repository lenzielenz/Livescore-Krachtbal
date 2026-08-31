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

/**
 * Hetzelfde punt met links en rechts omgewisseld.
 *
 * De klassieke vergissing bij het aanduiden: je klikt wat je ziet in plaats van wat de
 * veldconventie zegt (sta op de THUIS-achterlijn, kijk naar uit — links is x=0). Dat is geen
 * ander gezichtspunt maar een spiegeling, en die verziekt elke meting stil. De fit merkt het
 * (de oriëntatie klapt om); met deze wissel kan de app het rechtzetten in plaats van veertien
 * punten te laten herklikken.
 *
 * Let op het verschil met een 180°-draai (thuis↔uit én links↔rechts): dát is wél een geldig
 * ander standpunt — filmen vanaf de overkant — en wordt gewoon aanvaard.
 */
export function spiegelLabel(label: string): string {
  const delen = label.split('_')
  delen[delen.length - 1] = delen[delen.length - 1] === 'links' ? 'rechts' : 'links'
  return delen.join('_')
}

/**
 * Waar de camera stond, rond het veld.
 *
 * Geen etiket: de server rekent uit de aangeduide punten terug waar de camera écht stond (in
 * meters, met hoogte) en legt dat naast deze keuze. Klopt het niet, dan is er bij het
 * aanduiden iets misgegaan — beter nu dan na een uur rekenen. Spiegelbeeld van `POSITIES`
 * in cv/camera.py; de sleutels moeten gelijk blijven.
 */
export const CAMERA_POSITIES: { sleutel: string; naam: string; groep: string }[] = [
  { sleutel: 'achter-thuis-links', naam: 'Links achter de thuislijn', groep: 'Achter het veld (thuiskant)' },
  { sleutel: 'achter-thuis-midden', naam: 'Midden achter de thuislijn', groep: 'Achter het veld (thuiskant)' },
  { sleutel: 'achter-thuis-rechts', naam: 'Rechts achter de thuislijn', groep: 'Achter het veld (thuiskant)' },
  { sleutel: 'achter-uit-links', naam: 'Links achter de uitlijn', groep: 'Achter het veld (uitkant)' },
  { sleutel: 'achter-uit-midden', naam: 'Midden achter de uitlijn', groep: 'Achter het veld (uitkant)' },
  { sleutel: 'achter-uit-rechts', naam: 'Rechts achter de uitlijn', groep: 'Achter het veld (uitkant)' },
  { sleutel: 'zijlijn-links-thuis', naam: 'Linkerzijlijn, thuiskant', groep: 'Aan de zijlijn' },
  { sleutel: 'zijlijn-links-midden', naam: 'Midden aan de linkerzijlijn', groep: 'Aan de zijlijn' },
  { sleutel: 'zijlijn-links-uit', naam: 'Linkerzijlijn, uitkant', groep: 'Aan de zijlijn' },
  { sleutel: 'zijlijn-rechts-thuis', naam: 'Rechterzijlijn, thuiskant', groep: 'Aan de zijlijn' },
  { sleutel: 'zijlijn-rechts-midden', naam: 'Midden aan de rechterzijlijn', groep: 'Aan de zijlijn' },
  { sleutel: 'zijlijn-rechts-uit', naam: 'Rechterzijlijn, uitkant', groep: 'Aan de zijlijn' },
  { sleutel: 'hoek-thuis-links', naam: 'Hoek thuislijn — links', groep: 'In een hoek' },
  { sleutel: 'hoek-thuis-rechts', naam: 'Hoek thuislijn — rechts', groep: 'In een hoek' },
  { sleutel: 'hoek-uit-links', naam: 'Hoek uitlijn — links', groep: 'In een hoek' },
  { sleutel: 'hoek-uit-rechts', naam: 'Hoek uitlijn — rechts', groep: 'In een hoek' },
]

export function geldigeCameraPositie(waarde: unknown): boolean {
  return typeof waarde === 'string' && CAMERA_POSITIES.some((p) => p.sleutel === waarde)
}
