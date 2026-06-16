import type { Access, CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'

// Beheer van clubnieuws is voorbehouden aan clubmedewerkers (rol 'club-beheerder'); federatie/admin
// staan daarboven. Iedereen mag gepubliceerd nieuws lezen.
const canManageNews: Access = ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder')

// Clubnieuws / wedstrijdverslagen: korte artikels die supporters publiek kunnen lezen en delen.
export const News: CollectionConfig = {
  slug: 'news',
  labels: { singular: 'Nieuws', plural: 'Nieuws' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'published', 'publishedAt', 'club'],
    group: 'Beheer',
  },
  access: {
    // Publiek: enkel gepubliceerde artikels. Beheerders zien alles (ook concepten).
    read: ({ req }) => (isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder') ? true : { published: { equals: true } }),
    create: canManageNews,
    update: canManageNews,
    delete: canManageNews,
  },
  fields: [
    { name: 'title', label: 'Titel', type: 'text', required: true },
    { name: 'coverImage', label: 'Coverfoto', type: 'upload', relationTo: 'media', admin: { description: 'Grote foto bovenaan het artikel (optioneel).' } },
    { name: 'excerpt', label: 'Samenvatting', type: 'textarea', admin: { description: 'Korte intro die in de nieuwslijst verschijnt.' } },
    { name: 'body', label: 'Tekst', type: 'textarea', required: true, admin: { description: 'De volledige tekst. Lege regel = nieuwe alinea.' } },
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', admin: { description: 'Welke club dit nieuws plaatst (optioneel).' } },
    {
      name: 'publishedAt',
      label: 'Publicatiedatum',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } },
      hooks: { beforeChange: [({ value, siblingData }) => value || ((siblingData as { published?: boolean })?.published ? new Date().toISOString() : value)] },
    },
    { name: 'published', label: 'Gepubliceerd', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Pas zichtbaar voor supporters wanneer dit aanstaat.' } },
  ],
}
