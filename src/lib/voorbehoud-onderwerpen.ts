// RCVK item 25.3: wie een voorbehoud onderzoekt (sportcomité of scheidsrechterscomité), volgt uit het
// onderwerp. Puur en zonder imports, zodat ook een collection het kan gebruiken (collections/MatchSheets.ts).

export type Comite = 'sport' | 'scheidsrechters'
export const COMITE_LABEL: Record<Comite, string> = { sport: 'Sportcomité', scheidsrechters: 'Scheidsrechterscomité' }

/**
 * RCVK item 25.3: wie een voorbehoud onderzoekt, hangt af van waarover het gaat. De scheidsrechter
 * kiest het onderwerp bij het noteren; het comité volgt daaruit (en staat zo op het bord).
 */
export const VOORBEHOUD_ONDERWERPEN = [
  { value: 'inrichting', label: 'Materiële inrichting niet in orde', comite: 'sport' },
  { value: 'speelduur_tijdopnemer', label: 'Speelduur — fout van de tijdopnemer', comite: 'sport' },
  { value: 'officials', label: 'Officials ontbreken', comite: 'sport' },
  { value: 'leeftijd', label: 'Twijfel over de leeftijdscategorie', comite: 'sport' },
  { value: 'aantekenblad', label: 'Aantekenblad verkeerd ingevuld', comite: 'sport' },
  { value: 'identiteit', label: 'Twijfel over de identiteit van spelers', comite: 'sport' },
  { value: 'doelpunt', label: 'Doelpunt niet toegekend', comite: 'scheidsrechters' },
  { value: 'sr_afwezig', label: 'Scheidsrechter niet opgekomen', comite: 'scheidsrechters' },
  { value: 'sr_te_laat', label: 'Scheidsrechter te laat', comite: 'scheidsrechters' },
  { value: 'spelregels', label: 'Spelregels verkeerd toegepast', comite: 'scheidsrechters' },
  { value: 'speelduur_scheidsrechter', label: 'Speelduur — fout van de scheidsrechter', comite: 'scheidsrechters' },
  { value: 'ander', label: 'Iets anders', comite: null },
] as const satisfies readonly { value: string; label: string; comite: Comite | null }[]

export type VoorbehoudOnderwerp = (typeof VOORBEHOUD_ONDERWERPEN)[number]['value']

/** Puur: welk comité behandelt een voorbehoud over dit onderwerp? null = de federatie beslist zelf. */
export function comiteVoor(onderwerp: unknown): Comite | null {
  return VOORBEHOUD_ONDERWERPEN.find((o) => o.value === onderwerp)?.comite ?? null
}
