import type { CollectionConfig } from 'payload'

export const POSITION_OPTIONS = [
  { label: 'Achter', value: 'achter' },
  { label: 'Vleugel', value: 'vleugel' },
  { label: 'Barage', value: 'barage' },
] as const

export const Players: CollectionConfig = {
  slug: 'players',
  labels: {
    singular: 'Speler',
    plural: 'Spelers',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['shirtNumber', 'name', 'team', 'position'],
    group: 'Beheer',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'name',
      label: 'Naam',
      type: 'text',
      required: true,
    },
    {
      name: 'team',
      label: 'Ploeg',
      type: 'relationship',
      relationTo: 'teams',
      required: true,
    },
    {
      name: 'shirtNumber',
      label: 'Rugnummer',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        step: 1,
      },
    },
    {
      name: 'position',
      label: 'Positie',
      type: 'select',
      options: [...POSITION_OPTIONS],
    },
  ],
}
