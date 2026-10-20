import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

// Een club vraagt een wedstrijd te verplaatsen (lib/verplaatsing.ts): de tegenpartij gaat akkoord
// (of niet), daarna beslist de federatie. Bij goedkeuring krijgt de wedstrijd de nieuwe datum en
// hoort iedereen het. Lezen: federatie en de twee betrokken clubs. Schrijven enkel via de routes.
const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user)) return true
  const club = userClubId(req.user)
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker') ? { or: [{ aanvrager: { equals: club } }, { tegenpartij: { equals: club } }] } : false
}

export const VERPLAATSING_STATUSSEN = [
  { label: 'Wacht op de tegenpartij', value: 'wacht_tegenpartij' },
  { label: 'Wacht op de federatie', value: 'wacht_federatie' },
  { label: 'Geweigerd door de tegenpartij', value: 'geweigerd' },
  { label: 'Goedgekeurd', value: 'goedgekeurd' },
  { label: 'Afgewezen door de federatie', value: 'afgewezen' },
  { label: 'Ingetrokken', value: 'ingetrokken' },
] as const

export const Verplaatsingsaanvragen: CollectionConfig = {
  slug: 'verplaatsingsaanvragen',
  labels: { singular: 'Verplaatsingsaanvraag', plural: 'Verplaatsingsaanvragen' },
  admin: { group: 'Wedstrijden', defaultColumns: ['match', 'aanvrager', 'voorgesteld', 'status', 'createdAt'] },
  access: {
    read: lezen,
    create: () => false,
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'match', label: 'Wedstrijd', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'aanvrager', label: 'Aanvragende club', type: 'relationship', relationTo: 'clubs', required: true, index: true },
    { name: 'tegenpartij', label: 'Tegenpartij', type: 'relationship', relationTo: 'clubs', index: true },
    { name: 'oorspronkelijk', label: 'Oorspronkelijke datum', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'voorgesteld', label: 'Voorgestelde datum', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'reden', label: 'Reden', type: 'textarea', required: true },
    { name: 'status', label: 'Status', type: 'select', defaultValue: 'wacht_tegenpartij', options: [...VERPLAATSING_STATUSSEN], index: true },
    { name: 'aangevraagdDoor', label: 'Aangevraagd door', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'tegenpartijOpmerking', label: 'Opmerking tegenpartij', type: 'textarea' },
    { name: 'federatieOpmerking', label: 'Opmerking federatie', type: 'textarea' },
    { name: 'behandeldOp', label: 'Behandeld op', type: 'date', admin: { readOnly: true } },
  ],
}
