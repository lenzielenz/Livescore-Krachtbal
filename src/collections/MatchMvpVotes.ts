import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// "Held van de match": één supporterstem per wedstrijd. We bewaren elke stem als eigen document
// (uniek per match+gebruiker, server-side afgedwongen in de route) zodat we live kunnen optellen
// én later een seizoens-fanaward per speler kunnen berekenen. Publiek leesbaar (voor de teller).
export const MatchMvpVotes: CollectionConfig = {
  slug: 'match-mvp-votes',
  labels: { singular: 'Held-van-de-match-stem', plural: 'Held-van-de-match-stemmen' },
  admin: {
    useAsTitle: 'playerName',
    defaultColumns: ['playerName', 'match', 'side', 'createdAt'],
    description: 'Supporterstemmen voor de held van de match. Eén per supporter per wedstrijd.',
    hidden: true,
  },
  access: {
    // Publiek leesbaar: de teller toont iedereen de stand.
    read: () => true,
    // Stemmen verloopt server-side via de route (overrideAccess); in de admin enkel federatie/admin.
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'match', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'player', type: 'relationship', relationTo: 'players', required: true, index: true },
    { name: 'playerName', type: 'text' },
    { name: 'shirtNumber', type: 'number' },
    { name: 'side', type: 'select', options: [
      { label: 'Thuis', value: 'home' },
      { label: 'Uit', value: 'away' },
    ] },
  ],
}
