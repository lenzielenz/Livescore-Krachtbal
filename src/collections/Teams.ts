import type { CollectionConfig } from 'payload'

import { CATEGORY_OPTIONS } from '../lib/categories'

export const Teams: CollectionConfig = {
  slug: 'teams',
  labels: {
    singular: 'Ploeg',
    plural: 'Ploegen',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'category'],
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
      name: 'category',
      label: 'Categorie',
      type: 'select',
      options: CATEGORY_OPTIONS,
      required: true,
    },
    {
      name: 'logo',
      label: 'Logo',
      type: 'upload',
      relationTo: 'media',
    },
  ],
}
