import type { CollectionConfig } from 'payload'

// Bovenste niveau van de hiërarchie: Club → Ploegen (per categorie) → Spelers.
export const Clubs: CollectionConfig = {
  slug: 'clubs',
  labels: {
    singular: 'Club',
    plural: 'Clubs',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name'],
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
      name: 'logo',
      label: 'Logo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Clublogo — wordt professioneel weergegeven op de site.',
      },
    },
  ],
}
