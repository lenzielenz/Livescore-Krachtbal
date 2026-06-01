import type { CollectionConfig } from 'payload'

import { CATEGORY_OPTIONS } from '../lib/categories'
import { REEKS_OPTIONS } from '../lib/reeksen'
import { isFederationLevel } from '../lib/access'

export const Teams: CollectionConfig = {
  slug: 'teams',
  labels: {
    singular: 'Ploeg',
    plural: 'Ploegen',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'club', 'category'],
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
      name: 'club',
      label: 'Club',
      type: 'relationship',
      relationTo: 'clubs',
      required: true,
    },
    {
      name: 'category',
      label: 'Categorie',
      type: 'select',
      options: CATEGORY_OPTIONS,
      required: true,
    },
    {
      name: 'reeks',
      label: 'Reeks / niveau',
      type: 'select',
      options: [...REEKS_OPTIONS],
      admin: {
        description: 'Competitiereeks (KVKBF) waarin deze ploeg speelt.',
      },
    },
    {
      name: 'thuisUur',
      label: 'Vast thuisuur (HH:MM)',
      type: 'text',
      admin: {
        description: 'Vast aanvangsuur wanneer deze ploeg thuis speelt in deze reeks (bv. 11:30).',
        placeholder: '11:30',
      },
    },
    {
      name: 'name',
      label: 'Ploegnaam',
      type: 'text',
      required: true,
      admin: {
        description: 'Bv. "KV Roeselare U14". Het logo komt van de club.',
      },
    },
    {
      // Verouderd: het logo hoort nu bij de Club. Verborgen gehouden (niet verwijderd) zodat
      // bestaande databases geen kolom-migratie/rename-prompt nodig hebben.
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { hidden: true },
    },
  ],
}
