import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

// Lidmaatschap per seizoen (lib/lidmaatschap.ts): wie in welk seizoen bij welke club aangesloten (en dus
// verzekerd) was, van wanneer tot wanneer. Een vaststelling die bewaard blijft, ook als het lid later stopt of van
// club verandert — de verzekerdenlijst van vorig seizoen moet morgen nog dezelfde zijn. Enkel server-side
// geschreven (dagelijks bijgewerkt en bij elke goedkeuring).
const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user)) return true
  const club = userClubId(req.user)
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker') ? { club: { equals: club } } : false
}

export const Lidmaatschappen: CollectionConfig = {
  slug: 'lidmaatschappen',
  labels: { singular: 'Lidmaatschap', plural: 'Lidmaatschappen' },
  admin: { group: 'Federatie', defaultColumns: ['player', 'club', 'seizoen', 'soort', 'vanaf', 'tot'] },
  access: { read: lezen, create: () => false, update: () => false, delete: ({ req }) => isFederationLevel(req.user) },
  fields: [
    { name: 'player', label: 'Lid', type: 'relationship', relationTo: 'players', index: true },
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', index: true },
    { name: 'seizoen', label: 'Seizoen', type: 'text', required: true, index: true },
    {
      name: 'soort',
      label: 'Soort',
      type: 'select',
      defaultValue: 'speler',
      options: [
        { label: 'Speler (met vergunning)', value: 'speler' },
        { label: 'Gewoon lid', value: 'lid' },
      ],
    },
    { name: 'vanaf', label: 'Aangesloten vanaf', type: 'date', required: true },
    { name: 'tot', label: 'Tot', type: 'date', admin: { description: 'Leeg = nog aangesloten.' } },
    // Eén lidmaatschap per lid per seizoen: "<seizoen>:<lid>".
    { name: 'sleutel', label: 'Sleutel', type: 'text', unique: true, index: true, admin: { readOnly: true } },
  ],
}
