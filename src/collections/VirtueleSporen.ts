import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Sporen in het virtuele stadion: wat bezoekers achterlaten voor wie na hen komt (een eendje in
// het zwembad, verf in het water, popcorn, gelopen meters, een naam op een cinemazetel, een
// highscore, de stand van een tactiekbord, een gevonden gouden bal). Eén record per handeling;
// totalen en ranglijsten worden afgeleid (lib/virtueel-sporen.ts), nooit apart opgeslagen.
// Aanmaken gebeurt via /api/virtueel/sporen (login + tempo-limiet + validatie).
export const VirtueleSporen: CollectionConfig = {
  slug: 'virtuele-sporen',
  labels: { singular: 'Spoor', plural: 'Sporen (virtueel stadion)' },
  admin: {
    useAsTitle: 'authorName',
    defaultColumns: ['soort', 'authorName', 'club', 'createdAt'],
    group: 'Virtueel stadion',
    description: 'Wat bezoekers in het virtuele stadion achterlieten. Verwijder hier iets ongepasts.',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: () => false,
    delete: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const uid = req.user?.id
      return uid ? { author: { equals: uid } } : false
    },
  },
  fields: [
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', index: true, admin: { description: 'Leeg = het algemene stadion (bezoekers zonder club).' } },
    { name: 'soort', label: 'Soort', type: 'text', required: true, index: true },
    { name: 'author', label: 'Door', type: 'relationship', relationTo: 'users', index: true },
    { name: 'authorName', label: 'Naam', type: 'text' },
    { name: 'waarde', label: 'Waarde', type: 'json', required: true, admin: { readOnly: true } },
  ],
}
