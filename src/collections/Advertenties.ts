import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Waar een reclame getoond mag worden. Bewust uitbreidbaar zodat we dezelfde reclame later op
// andere schermen/plekken kunnen hergebruiken. "Overal" = op alle ondersteunde plekken.
export const PLAATSING_OPTIONS = [
  { label: 'Veldscherm (tv)', value: 'veldscherm' },
  { label: 'Kantinescherm', value: 'kantine' },
  { label: 'Overal', value: 'overal' },
] as const

// Reclameblok: een logo of banner van een sponsor. Beheerbaar in de admin (federatie/admin) en
// publiek leesbaar zodat de schermen ze kunnen tonen. Voorlopig gebruikt op het veldscherm
// (scrollende balk boven- en onderaan), later herbruikbaar op andere plekken.
export const Advertenties: CollectionConfig = {
  slug: 'advertenties',
  labels: { singular: 'Reclame', plural: 'Reclame' },
  admin: {
    useAsTitle: 'naam',
    defaultColumns: ['naam', 'plaatsing', 'actief', 'volgorde'],
    group: 'Beheer',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'naam', label: 'Naam', type: 'text', required: true, admin: { description: 'Interne naam van de sponsor/reclame.' } },
    {
      name: 'afbeelding',
      label: 'Logo of banner',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: { description: 'Het logo of de banner die getoond wordt (PNG/JPG/WEBP).' },
    },
    { name: 'link', label: 'Link (optioneel)', type: 'text', admin: { description: 'Website van de sponsor — voor later gebruik (klikbare reclame).' } },
    {
      name: 'plaatsing',
      label: 'Waar tonen',
      type: 'select',
      options: [...PLAATSING_OPTIONS],
      defaultValue: 'veldscherm',
      admin: { description: 'Op welk scherm deze reclame verschijnt. "Overal" = op alle plekken.' },
    },
    { name: 'volgorde', label: 'Volgorde', type: 'number', defaultValue: 0, admin: { description: 'Lager = eerder in de balk.' } },
    { name: 'actief', label: 'Actief', type: 'checkbox', defaultValue: true, admin: { description: 'Toon deze reclame momenteel.' } },
  ],
}
