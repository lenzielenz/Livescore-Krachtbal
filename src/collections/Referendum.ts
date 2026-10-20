import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'
import { MAX_LEEFTIJD_BELOFTE, MIN_WEDSTRIJDEN } from '../lib/referendum'

// Een stemronde van het referendum (speler/speelster/belofte van het jaar) — zie lib/referendum.ts.
// Eén ronde per seizoen. De federatie opent en sluit ze en maakt de uitslag bekend; dan komen de
// winnaars in het archief (referendum-awards). Stemmen zelf staan in referendum-stemmen.
export const ReferendumRondes: CollectionConfig = {
  slug: 'referendum-rondes',
  labels: { singular: 'Referendum-ronde', plural: 'Referendum-rondes' },
  admin: { useAsTitle: 'seizoen', defaultColumns: ['seizoen', 'status'], group: 'Federatie' },
  access: {
    // Iedereen mag weten dat er een ronde loopt (de stempagina); de uitslag zit niet in dit document.
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'seizoen', label: 'Seizoen', type: 'text', required: true, unique: true, admin: { description: 'Bv. 2026-2027.' } },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'voorbereiding',
      options: [
        { label: 'In voorbereiding', value: 'voorbereiding' },
        { label: 'Stemmen open', value: 'open' },
        { label: 'Gesloten', value: 'gesloten' },
        { label: 'Uitslag bekend', value: 'gepubliceerd' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'reeksHeren', label: 'Reeks heren', type: 'text', defaultValue: '1NAH' },
        { name: 'reeksDames', label: 'Reeks dames', type: 'text', defaultValue: '1NAD' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'minWedstrijden', label: 'Minimum gespeelde wedstrijden', type: 'number', defaultValue: MIN_WEDSTRIJDEN, min: 1 },
        { name: 'maxLeeftijdBelofte', label: 'Belofte: jonger dan', type: 'number', defaultValue: MAX_LEEFTIJD_BELOFTE, min: 10 },
        { name: 'peildatum', label: 'Peildatum leeftijd', type: 'date', admin: { description: 'Leeg = de dag dat de ronde sluit.' } },
      ],
    },
    { name: 'gepubliceerdOp', label: 'Uitslag bekendgemaakt op', type: 'date', admin: { readOnly: true } },
  ],
}

// Eén stem: de stemmer (speler) en zijn vijf keuzes met 5..1 punten. Geheim: enkel de federatie
// leest stemmen, en ook zij ziet in de app enkel de optelling. Aanmaken gebeurt uitsluitend via
// /api/referendum/stem, dat de regels controleert.
export const ReferendumStemmen: CollectionConfig = {
  slug: 'referendum-stemmen',
  labels: { singular: 'Referendum-stem', plural: 'Referendum-stemmen' },
  admin: { group: 'Federatie', hidden: ({ user }) => !isFederationLevel(user) },
  access: {
    read: ({ req }) => isFederationLevel(req.user),
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'ronde', type: 'relationship', relationTo: 'referendum-rondes', required: true, index: true },
    { name: 'stemmer', label: 'Stemmer (speler)', type: 'relationship', relationTo: 'players', required: true, index: true },
    { name: 'competitie', type: 'select', required: true, options: [{ label: 'Heren', value: 'heren' }, { label: 'Dames', value: 'dames' }] },
    {
      name: 'regels',
      type: 'array',
      required: true,
      minRows: 5,
      maxRows: 5,
      fields: [
        { name: 'speler', type: 'relationship', relationTo: 'players', required: true },
        { name: 'punten', type: 'number', required: true, min: 1, max: 5 },
      ],
    },
  ],
}
