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
    {
      type: 'collapsible',
      label: 'Accommodatie & contact',
      admin: { initCollapsed: true },
      fields: [
        { name: 'accommodatie', label: 'Terrein / accommodatie', type: 'textarea', admin: { description: 'Naam stadion, adres, type terrein (bv. kunstgras).' } },
        {
          type: 'row',
          fields: [
            { name: 'telefoon', label: 'Telefoon', type: 'text' },
            { name: 'website', label: 'Website', type: 'text' },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Secretaris',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'secretarisNaam', label: 'Naam', type: 'text' },
            { name: 'secretarisEmail', label: 'E-mail', type: 'email' },
            { name: 'secretarisTelefoon', label: 'Telefoon', type: 'text' },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Jeugdverantwoordelijke',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'jeugdNaam', label: 'Naam', type: 'text' },
            { name: 'jeugdEmail', label: 'E-mail', type: 'email' },
            { name: 'jeugdTelefoon', label: 'Telefoon', type: 'text' },
          ],
        },
      ],
    },
  ],
}
