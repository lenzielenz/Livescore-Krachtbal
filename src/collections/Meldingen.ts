import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// In-app meldingen (🔔 in de bovenbalk, /meldingen): "je club vroeg je medische kaart aan", "een lid
// vroeg een medische kaart aan", "je registratie is goedgekeurd". Aangemaakt via lib/meldingen.ts
// (dat ook een push stuurt als die aan staat). Iedereen ziet enkel zijn eigen meldingen.
const eigen = ({ req }: { req: { user?: unknown } }) => {
  const id = (req.user as { id?: unknown } | null)?.id
  if (isFederationLevel(req.user)) return true
  return id != null ? { user: { equals: id } } : false
}

export const Meldingen: CollectionConfig = {
  slug: 'meldingen',
  labels: { singular: 'Melding', plural: 'Meldingen' },
  admin: { group: 'Beheer', useAsTitle: 'titel', defaultColumns: ['titel', 'user', 'gelezen', 'createdAt'], hidden: ({ user }) => !isFederationLevel(user) },
  access: {
    read: eigen,
    create: () => false,
    update: eigen,
    delete: eigen,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'titel', type: 'text', required: true },
    { name: 'tekst', type: 'text' },
    { name: 'url', type: 'text' },
    { name: 'gelezen', type: 'checkbox', defaultValue: false, index: true },
  ],
}
