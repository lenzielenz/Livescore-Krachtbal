import type { Access, CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'

// Beheer van de reclamesectie is voorbehouden aan clubmedewerkers (rol 'club-beheerder');
// federatie/admin staan daar uiteraard boven. Iedereen mag reclame wél lezen (de schermen tonen ze).
const canManageAds: Access = ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder')

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
    description: 'Sponsors voor de schermen. Snijd het beeld bij zodat het recht en vol in de balk staat.',
    group: 'Beheer',
  },
  access: {
    read: () => true,
    create: canManageAds,
    update: canManageAds,
    delete: canManageAds,
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
    // Bijsnijden: reclame komt binnen zoals ze binnenkomt — een liggende banner, een vierkant
    // logo, of een foto van een affiche die scheef genomen is. De Field-component hieronder toont
    // een live voorvertoning van de bannertegel met zoom, draaiing en slepen, zodat "wat je
    // opslaat is wat de kantine ziet" (zie lib/reclame.ts).
    {
      name: 'zoom',
      label: 'Beeld bijsnijden',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 4,
      admin: {
        components: {
          Field: '/components/admin/ReclameFitEditor#ReclameFitEditor',
        },
      },
    },
    { name: 'offsetX', type: 'number', defaultValue: 0, admin: { hidden: true } },
    { name: 'offsetY', type: 'number', defaultValue: 0, admin: { hidden: true } },
    { name: 'rotatie', type: 'number', defaultValue: 0, admin: { hidden: true } },
    {
      // Een logo dat op wit hóórt te staan, valt weg op een donkere balk. Eén kleur per reclame
      // lost dat op zonder dat de rest van de balk eronder lijdt.
      name: 'achtergrond',
      label: 'Achtergrond van de tegel',
      type: 'select',
      defaultValue: 'donker',
      options: [
        { label: 'Donker (standaard)', value: 'donker' },
        { label: 'Wit', value: 'wit' },
        { label: 'Doorzichtig', value: 'geen' },
      ],
      admin: { description: 'Kies wit voor een logo dat op een witte achtergrond hoort.' },
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
