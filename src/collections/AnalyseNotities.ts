import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Notities bij een analyse: wat een coach of speler opvalt, eventueel aan een moment in de video
// gekoppeld. Privé (alleen de schrijver) of gedeeld (iedereen die de analyse mag zien, en wie de
// deellink van de analyse krijgt). Lezen en schrijven gebeurt via /api/analyse/match/[id]/notities
// — daar zit de echte toegangscontrole (wie de analyse mag zien); de collectie zelf is voor de
// admin en voor de schrijver.
export const AnalyseNotities: CollectionConfig = {
  slug: 'analyse-notities',
  labels: { singular: 'Analyse-notitie', plural: 'Analyse-notities' },
  admin: {
    useAsTitle: 'tekst',
    defaultColumns: ['tekst', 'auteurNaam', 'match', 'zichtbaarheid', 'createdAt'],
    group: 'Analyse',
  },
  access: {
    read: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const uid = req.user?.id
      return uid ? { auteur: { equals: uid } } : false
    },
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const uid = req.user?.id
      return uid ? { auteur: { equals: uid } } : false
    },
    delete: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const uid = req.user?.id
      return uid ? { auteur: { equals: uid } } : false
    },
  },
  fields: [
    { name: 'match', label: 'Wedstrijd', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'auteur', label: 'Geschreven door', type: 'relationship', relationTo: 'users', index: true },
    { name: 'auteurNaam', label: 'Naam', type: 'text' },
    { name: 'tekst', label: 'Notitie', type: 'textarea', required: true, maxLength: 2000 },
    {
      name: 'tijdS',
      label: 'Moment in de video (s)',
      type: 'number',
      min: 0,
      admin: { description: 'Leeg = een notitie bij de hele wedstrijd.' },
    },
    {
      name: 'tekening',
      label: 'Tekening (pijlen op het veld)',
      type: 'json',
      admin: { description: 'Pijlen in veldmeters: { pijlen: [{ van: {x,y}, naar: {x,y}, kleur }] }.' },
    },
    {
      name: 'zichtbaarheid',
      label: 'Zichtbaar voor',
      type: 'select',
      required: true,
      defaultValue: 'prive',
      options: [
        { label: 'Alleen mij', value: 'prive' },
        { label: 'Iedereen die de analyse ziet', value: 'gedeeld' },
      ],
    },
  ],
}
