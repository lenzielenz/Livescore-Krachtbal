// Standaard takenlijst voor de organisatie van een bekerfinaledag (formulier_12).
// Verdeeld over de verantwoordelijken: OC (organiserende club), Federatie en SRC
// (scheidsrechterscommissie). Dient als sjabloon dat bij het aanmaken van een
// bekerfinale automatisch ingevuld wordt; taken kunnen daarna aangepast/afgevinkt worden.

export const VERANTWOORDELIJKE_OPTIONS = [
  { label: 'OC (organiserende club)', value: 'OC' },
  { label: 'Federatie', value: 'federatie' },
  { label: 'SRC (scheidsrechters)', value: 'SRC' },
] as const

export type Verantwoordelijke = (typeof VERANTWOORDELIJKE_OPTIONS)[number]['value']

export type ChecklistTaak = { taak: string; verantwoordelijke: Verantwoordelijke }

export const BEKERFINALE_TAKEN: ChecklistTaak[] = [
  { taak: 'Infrastructuur en terreinen klaarmaken', verantwoordelijke: 'OC' },
  { taak: 'Kleedkamers voorzien en toewijzen', verantwoordelijke: 'OC' },
  { taak: 'Scoreborden en tijdsregistratie voorzien', verantwoordelijke: 'OC' },
  { taak: 'EHBO / hulpdienst ter plaatse', verantwoordelijke: 'OC' },
  { taak: 'Kantine en catering organiseren', verantwoordelijke: 'OC' },
  { taak: 'Affiches en bewegwijzering ophangen', verantwoordelijke: 'OC' },
  { taak: 'Parkeergelegenheid regelen', verantwoordelijke: 'OC' },
  { taak: 'Wedstrijdschema opstellen en verspreiden', verantwoordelijke: 'federatie' },
  { taak: 'Persuitnodigingen en communicatie', verantwoordelijke: 'federatie' },
  { taak: 'Bekers en medailles voorzien', verantwoordelijke: 'federatie' },
  { taak: 'Kampioenenhulde / protocol voorbereiden', verantwoordelijke: 'federatie' },
  { taak: 'Scheidsrechters aanduiden', verantwoordelijke: 'SRC' },
  { taak: 'Aantekenaars en tijdopnemers aanduiden', verantwoordelijke: 'SRC' },
  { taak: 'Wedstrijdbladen en materiaal klaarleggen', verantwoordelijke: 'SRC' },
]
