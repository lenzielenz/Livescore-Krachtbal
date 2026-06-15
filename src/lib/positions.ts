// Speelposities in krachtbal. Eén bron voor zowel de spelers-collectie, de gebruikers-collectie
// (eigen profiel) als de frontend-formulieren, zodat labels en waarden overal gelijklopen.
export const POSITION_OPTIONS = [
  { label: 'Achter', value: 'achter' },
  { label: 'Vleugel links', value: 'vleugel-links' },
  { label: 'Vleugel rechts', value: 'vleugel-rechts' },
  { label: 'Barage', value: 'barage' },
  // Legacy: bestaande spelers zonder aangeduide kant (re-set naar links/rechts waar mogelijk).
  { label: 'Vleugel (kant onbekend)', value: 'vleugel' },
] as const

export type PlayerPosition = (typeof POSITION_OPTIONS)[number]['value']

// Geldige positiewaarden (incl. legacy), voor server-side validatie.
export const POSITION_VALUES: readonly string[] = POSITION_OPTIONS.map((o) => o.value)

// Waarde → label (voor weergave op scorecard/profiel).
export const POSITION_LABELS: Record<string, string> = Object.fromEntries(
  POSITION_OPTIONS.map((o) => [o.value, o.label]),
)

// De posities die een lid zelf mag kiezen — de legacy "kant onbekend" laten we weg.
export const SELECTABLE_POSITIONS = POSITION_OPTIONS.filter((o) => o.value !== 'vleugel')
