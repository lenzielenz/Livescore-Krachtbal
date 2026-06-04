import type { CollectionConfig } from 'payload'

export const MATCH_EVENT_TYPE_OPTIONS = [
  { label: 'Time-out (ploeg)', value: 'timeout' },
  { label: 'Scheidsrechter-onderbreking', value: 'referee_stop' },
  { label: 'Start helft', value: 'half_start' },
  { label: 'Einde helft', value: 'half_end' },
] as const

// Niet-worp-gebeurtenissen voor de tijdlijn: time-outs (tellen mee in quotum, 2 p/ploeg
// p/helft), scheidsrechter-onderbrekingen (stoppen klok, tellen niet mee) en helft-grenzen.
export const MatchEvents: CollectionConfig = {
  slug: 'match-events',
  labels: {
    singular: 'Wedstrijdgebeurtenis',
    plural: 'Wedstrijdgebeurtenissen',
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['match', 'type', 'team', 'half', 'gameClock'],
    group: 'Wedstrijden',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'match',
      label: 'Wedstrijd',
      type: 'relationship',
      relationTo: 'matches',
      required: true,
      index: true,
    },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: [...MATCH_EVENT_TYPE_OPTIONS],
      required: true,
    },
    {
      // Enkel bij een time-out: welke ploeg. Leeg voor scheidsrechter-onderbreking/helft-grenzen.
      name: 'team',
      label: 'Ploeg',
      type: 'relationship',
      relationTo: 'teams',
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'timeout',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'half',
          label: 'Helft',
          type: 'number',
          required: true,
          min: 1,
          max: 2,
        },
        {
          name: 'gameClock',
          label: 'Klok (sec)',
          type: 'number',
          required: true,
          min: 0,
        },
      ],
    },
    {
      name: 'note',
      label: 'Notitie',
      type: 'text',
    },
    {
      // Audit-trail: welke gebruiker deze gebeurtenis registreerde.
      name: 'createdBy',
      label: 'Geregistreerd door',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
}
