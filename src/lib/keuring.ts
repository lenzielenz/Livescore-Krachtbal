// Materiële keuring / inrichting — gedeelde definitie (WEDSTRIJDBLAD-PROMPT §MatchSheets).
// In een aparte lib zodat zowel de Payload-collectie (server) als het scheidsrechterscherm
// (client) ze kunnen gebruiken.

export const KEURING_ITEMS = [
  { name: 'terrein', label: 'Terrein' },
  { name: 'kleedkamers', label: 'Kleedkamers' },
  { name: 'douches', label: 'Douches' },
  { name: 'aantekentafel', label: 'Aantekentafel' },
  { name: 'scorebord', label: 'Scorebord' },
  { name: 'grensrechtersvlag', label: 'Grensrechtersvlag' },
  { name: 'ehbo', label: 'EHBO' },
  { name: 'bal', label: 'Bal' },
  { name: 'kentekenGrensrechter', label: 'Kenteken grensrechter' },
  { name: 'verlichting', label: 'Verlichting' },
] as const

export type KeuringItem = (typeof KEURING_ITEMS)[number]['name']

export const KEURING_OPTIONS = [
  { label: 'OK', value: 'ok' },
  { label: 'NIET OK', value: 'niet_ok' },
  { label: 'N.v.t.', value: 'nvt' },
] as const
