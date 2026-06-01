import type { GlobalConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Federatie-instellingen voor de wedstrijdblad-laag. Configureerbaar door federatie/admin.
export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Federatie-instellingen',
  admin: { group: 'Federatie' },
  access: {
    read: () => true,
    update: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      name: 'releaseMinutesBefore',
      label: 'Vrijgave (minuten vóór aanvang)',
      type: 'number',
      defaultValue: 60,
      min: 0,
      max: 1440,
      required: true,
      admin: {
        description:
          'Vanaf hoeveel minuten vóór het aanvangsuur mag de scheidsrechter beide opstellingen zien.',
      },
    },
    {
      // Drempel waarboven een speler door administratieve knipjes geblokkeerd wordt (fase 8).
      // Defaults; echte waarde komt van de federatie-boetelijst.
      name: 'knipjesDrempel',
      label: 'Knipjes-drempel (selectieblokkade)',
      type: 'number',
      defaultValue: 3,
      min: 1,
      max: 50,
      required: true,
      admin: {
        description: 'Bij dit aantal of meer openstaande knipjes kan een speler niet geselecteerd worden.',
      },
    },
  ],
}
