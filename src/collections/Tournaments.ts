import type { CollectionConfig } from 'payload'

import { CATEGORY_OPTIONS } from '../lib/categories'

export const TOURNAMENT_STATUS_OPTIONS = [
  { label: 'Bezig', value: 'live' },
  { label: 'Afgelopen', value: 'finished' },
] as const

export const TOURNAMENT_METHOD_OPTIONS = [
  { label: 'Manueel (jij kiest de loting)', value: 'manual' },
  { label: 'Toggle (automatische loting)', value: 'auto' },
] as const

// Een tornooi (enkele afvalrace met kleine finale). De ploegen zijn ad-hoc namen — geen
// geregistreerde Teams/Players nodig. De categorie bepaalt de spelregels (helftduur). De
// wedstrijden van het schema staan in de aparte collectie `tournament-matches`.
export const Tournaments: CollectionConfig = {
  slug: 'tournaments',
  labels: { singular: 'Tornooi', plural: 'Tornooien' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'status'],
    group: 'Wedstrijden',
  },
  access: {
    read: () => true,
  },
  hooks: {
    // Het hele schema mee opruimen wanneer een tornooi verwijderd wordt.
    beforeDelete: [
      async ({ req, id }) => {
        await req.payload
          .delete({ collection: 'tournament-matches', where: { tournament: { equals: id } }, req, overrideAccess: true })
          .catch(() => undefined)
      },
    ],
  },
  fields: [
    { name: 'name', label: 'Naam', type: 'text', required: true, admin: { description: 'Bv. "Paastornooi U14 2026".' } },
    {
      type: 'row',
      fields: [
        {
          name: 'category',
          label: 'Leeftijdscategorie',
          type: 'select',
          options: CATEGORY_OPTIONS,
          required: true,
          admin: { description: 'Bepaalt de spelregels (helftduur). U12/U14/U16 = 2×20 min, rest 2×25 min.' },
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [...TOURNAMENT_STATUS_OPTIONS],
          defaultValue: 'live',
          required: true,
        },
        {
          name: 'method',
          label: 'Lotingsmethode',
          type: 'select',
          options: [...TOURNAMENT_METHOD_OPTIONS],
          defaultValue: 'auto',
        },
      ],
    },
    {
      name: 'teamCount',
      label: 'Aantal ploegen',
      type: 'number',
      min: 2,
      admin: { readOnly: true, description: 'Vastgelegd bij het aanmaken.' },
    },
  ],
}
