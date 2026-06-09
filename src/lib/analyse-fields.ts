import type { Field } from 'payload'

// Twee velden die een club/ploeg/speler als analyse-eigen markeren — de spiegel van
// matches.analyseOnly + matches.analyseOwner. `analyseOnly` verbergt de entiteit voor de competitie;
// `analyseOwner` koppelt ze privé aan de analist die ze aanmaakte. Gedeeld over clubs/teams/players
// zodat de drie exact dezelfde semantiek (en query-scoping via src/lib/analyse-access.ts) krijgen.
export const analyseEntityFields: Field[] = [
  {
    name: 'analyseOnly',
    label: 'Enkel voor analyse (niet in de competitie)',
    type: 'checkbox',
    defaultValue: false,
    admin: {
      position: 'sidebar',
      description:
        'Aangemaakt in de analysemodule. Verschijnt nooit in de competitie (live, rangschikking, beheer) — enkel in de eigen analyse-database.',
    },
  },
  {
    name: 'analyseOwner',
    label: 'Analyse-eigenaar',
    type: 'relationship',
    relationTo: 'users',
    admin: {
      position: 'sidebar',
      readOnly: true,
      description: 'Wie deze analyse-entiteit aanmaakte. Bepaalt wie ze ziet (privé per persoon).',
    },
  },
]
