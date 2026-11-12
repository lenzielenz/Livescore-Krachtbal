import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

// Een klacht over een ingediend wedstrijdblad (lib/klacht.ts): een van beide clubs dient ze in met
// een reden; de federatie heropent het blad (terug af te tekenen, opnieuw te ondertekenen) of wijst
// de klacht af. De PDF van vóór het heropenen blijft bewaard in de klacht zelf. Lezen: de federatie
// en de staf van de club die klaagde; schrijven enkel via de routes.
const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user)) return true
  const club = userClubId(req.user)
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker') ? { club: { equals: club } } : false
}

export const KLACHT_STATUSSEN = [
  { label: 'Open (bij de federatie)', value: 'open' },
  { label: 'Blad heropend', value: 'heropend' },
  { label: 'Afgewezen', value: 'afgewezen' },
  { label: 'Voorbehoud: te bekrachtigen door de club', value: 'te_bekrachtigen' },
  { label: 'Voorbehoud: club zag af', value: 'afgezien' },
  { label: 'Voorbehoud: niet bekrachtigd binnen de termijn', value: 'vervallen' },
] as const

export const KLACHT_SOORTEN = [
  { label: 'Klacht over een ingediend blad', value: 'klacht' },
  { label: 'Voorbehoud op het blad (RCVK item 25)', value: 'voorbehoud' },
] as const

export const Klachten: CollectionConfig = {
  slug: 'klachten',
  labels: { singular: 'Klacht', plural: 'Klachten' },
  admin: { group: 'Wedstrijden', defaultColumns: ['match', 'club', 'status', 'createdAt'] },
  access: {
    read: lezen,
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'match', label: 'Wedstrijd', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'soort', label: 'Soort', type: 'select', defaultValue: 'klacht', options: [...KLACHT_SOORTEN], index: true },
    { name: 'club', label: 'Club die klaagt', type: 'relationship', relationTo: 'clubs', required: true, index: true },
    { name: 'ingediendDoor', label: 'Ingediend door', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'reden', label: 'Reden', type: 'textarea', required: true },
    { name: 'status', label: 'Status', type: 'select', defaultValue: 'open', options: [...KLACHT_STATUSSEN], index: true },
    // Voorbehoud: de club bekrachtigt binnen 5 werkdagen met een uitgebreid relaas, of ziet af. Daarna
    // behandelt de federatie het als een gewone klacht. De sleutel maakt het aanmaken bij het indienen idempotent.
    { name: 'bekrachtigTegen', label: 'Te bekrachtigen tegen', type: 'date', admin: { readOnly: true } },
    { name: 'relaas', label: 'Relaas van de club (bekrachtiging)', type: 'textarea' },
    { name: 'sleutel', label: 'Sleutel', type: 'text', index: true, admin: { readOnly: true, hidden: true } },
    // RCVK item 25.3: het onderwerp van het voorbehoud bepaalt welk comité het onderzoekt (lib/voorbehoud.ts).
    {
      name: 'comite',
      label: 'Bevoegd comité',
      type: 'select',
      options: [
        { label: 'Sportcomité', value: 'sport' },
        { label: 'Scheidsrechterscomité', value: 'scheidsrechters' },
      ],
    },
    { name: 'beslissing', label: 'Beslissing van de federatie', type: 'textarea' },
    { name: 'behandeldDoor', label: 'Behandeld door', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'behandeldOp', label: 'Behandeld op', type: 'date', admin: { readOnly: true } },
    { name: 'pdfVoorHeropenen', label: 'Wedstrijdblad vóór het heropenen', type: 'relationship', relationTo: 'media', admin: { readOnly: true } },
  ],
}
