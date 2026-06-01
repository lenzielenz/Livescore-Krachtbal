import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

export const OFFICIAL_TYPE_OPTIONS = [
  { label: 'Scheidsrechter', value: 'scheidsrechter' },
  { label: 'Grensrechter', value: 'grensrechter' },
  { label: 'Aantekenaar', value: 'aantekenaar' },
  { label: 'Tijdopnemer', value: 'tijdopnemer' },
] as const

// Officials (scheidsrechters, grensrechters, ...) worden door comité/federatie beheerd en
// aan wedstrijden toegewezen (WEDSTRIJDBLAD-PROMPT §Officials).
export const Officials: CollectionConfig = {
  slug: 'officials',
  labels: { singular: 'Official', plural: 'Officials' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'federationNumber'],
    group: 'Federatie',
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
      type: 'row',
      fields: [
        {
          name: 'type',
          label: 'Type',
          type: 'select',
          options: [...OFFICIAL_TYPE_OPTIONS],
          required: true,
        },
        {
          name: 'federationNumber',
          label: 'Federatie-lidnummer',
          type: 'text',
        },
      ],
    },
  ],
}
