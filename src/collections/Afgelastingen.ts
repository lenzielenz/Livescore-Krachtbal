import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'
import { uploadDirFor } from './Media'

// Afgelasting van een wedstrijd door de scheidsrechter (slecht terrein, weer, ...), met foto's als
// bewijs. De federatie ziet ze, plant een nieuwe datum of trekt de afgelasting in
// (lib/afgelasting.ts). Lezen: federatie, scheidsrechters en de twee betrokken clubs. Schrijven enkel
// via de routes.
const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter')) return true
  const club = userClubId(req.user)
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker', 'club-lid') ? { clubs: { in: [club] } } : false
}

export const AFGELASTING_REDENEN = [
  { label: 'Terrein onbespeelbaar', value: 'terrein' },
  { label: 'Weersomstandigheden', value: 'weer' },
  { label: 'Andere reden', value: 'ander' },
] as const

export const Afgelastingen: CollectionConfig = {
  slug: 'afgelastingen',
  labels: { singular: 'Afgelasting', plural: 'Afgelastingen' },
  admin: { group: 'Wedstrijden', defaultColumns: ['match', 'reden', 'status', 'createdAt'] },
  access: {
    read: lezen,
    create: () => false,
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'match', label: 'Wedstrijd', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'clubs', label: 'Betrokken clubs', type: 'relationship', relationTo: 'clubs', hasMany: true, admin: { readOnly: true } },
    { name: 'reden', label: 'Reden', type: 'select', required: true, options: [...AFGELASTING_REDENEN] },
    { name: 'toelichting', label: 'Toelichting', type: 'textarea' },
    { name: 'oorspronkelijkeDatum', label: 'Oorspronkelijke datum', type: 'date', admin: { readOnly: true } },
    { name: 'gemeldDoor', label: 'Gemeld door', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'scheidsrechterNaam', label: 'Scheidsrechter', type: 'text' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'gemeld',
      index: true,
      options: [
        { label: 'Nieuwe datum te plannen', value: 'gemeld' },
        { label: 'Herpland', value: 'herpland' },
        { label: 'Ingetrokken', value: 'ingetrokken' },
      ],
    },
    { name: 'nieuweDatum', label: 'Nieuwe datum', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'behandeldOp', label: 'Behandeld op', type: 'date', admin: { readOnly: true } },
  ],
}

// De foto's bij een afgelasting. Zelfde leesrechten; Payload serveert de bestanden en controleert ze.
export const AfgelastingFotos: CollectionConfig = {
  slug: 'afgelasting-fotos',
  labels: { singular: 'Afgelastingsfoto', plural: "Afgelastingsfoto's" },
  admin: { group: 'Wedstrijden', hidden: ({ user }) => !isFederationLevel(user) },
  access: {
    read: lezen,
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'afgelasting', type: 'relationship', relationTo: 'afgelastingen', required: true, index: true },
    { name: 'clubs', type: 'relationship', relationTo: 'clubs', hasMany: true },
  ],
  upload: {
    staticDir: uploadDirFor('afgelasting-fotos'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  },
}
