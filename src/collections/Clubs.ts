import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

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
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      name: 'name',
      label: 'Naam',
      type: 'text',
      required: true,
    },
    {
      name: 'email',
      label: 'Contact-e-mail',
      type: 'email',
      admin: {
        description: 'Ontvangt het PDF-wedstrijdblad na indienen.',
      },
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
