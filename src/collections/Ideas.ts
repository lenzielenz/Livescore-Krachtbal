import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

export const Ideas: CollectionConfig = {
  slug: 'ideas',
  labels: { singular: 'Idee', plural: 'Ideeënbus' },
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'category', 'status', 'name', 'createdAt'],
    group: 'Beheer',
    description: 'Ideeën, aanpassingen en problemen die bezoekers via de site doorgeven.',
  },
  access: {
    read: ({ req }) => isFederationLevel(req.user),
    create: () => false, // uitsluitend via de beveiligde publieke formulierroute
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      name: 'category',
      label: 'Soort',
      type: 'select',
      required: true,
      options: [
        { label: 'Nieuw idee', value: 'idea' },
        { label: 'Aanpassing', value: 'change' },
        { label: 'Probleem melden', value: 'problem' },
      ],
    },
    { name: 'subject', label: 'Onderwerp', type: 'text', required: true },
    { name: 'message', label: 'Uitleg', type: 'textarea', required: true },
    { name: 'name', label: 'Naam indiener', type: 'text' },
    { name: 'email', label: 'E-mail indiener', type: 'email' },
    { name: 'submittedBy', label: 'Ingelogde gebruiker', type: 'relationship', relationTo: 'users' },
    { name: 'pageUrl', label: 'Ingezonden vanaf', type: 'text', admin: { readOnly: true } },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      options: [
        { label: 'Nieuw', value: 'new' },
        { label: 'Bekijken', value: 'reviewing' },
        { label: 'Gepland', value: 'planned' },
        { label: 'Uitgevoerd', value: 'done' },
        { label: 'Afgewezen', value: 'declined' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'adminNotes',
      label: 'Interne notities',
      type: 'textarea',
      admin: { description: 'Alleen zichtbaar voor de beheerder.' },
    },
  ],
}
