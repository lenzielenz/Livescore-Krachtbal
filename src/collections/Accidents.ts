import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'

// Aangifte lichamelijk ongeval (formulier_14 — DVV/OKRA-SPORT). Verzekeringsaangifte bij blessure,
// gekoppeld aan een wedstrijd en (optioneel) een speler. Het geneeskundig getuigschrift is een
// apart blad en wordt hier niet gemodelleerd.
export const Accidents: CollectionConfig = {
  slug: 'accidents',
  labels: { singular: 'Ongevalsaangifte', plural: 'Ongevalsaangiften' },
  admin: {
    useAsTitle: 'titel',
    defaultColumns: ['titel', 'ongevalDatum'],
    group: 'Federatie',
  },
  access: {
    // Bijzondere-categorie (medische) data: enkel federatie/admin + scheidsrechter, NIET elke
    // ingelogde gebruiker (GDPR Art. 9). Zie AUDIT-2026-06.md §4.
    read: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter'),
    create: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter', 'club-beheerder'),
    update: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter', 'club-beheerder'),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      name: 'titel',
      type: 'text',
      admin: { readOnly: true, hidden: true },
      hooks: {
        beforeChange: [
          ({ siblingData }) => {
            const naam = (siblingData as { slachtofferNaam?: string }).slachtofferNaam
            const datum = (siblingData as { ongevalDatum?: string }).ongevalDatum
            const d = datum ? new Date(datum).toLocaleDateString('nl-BE') : ''
            return `Ongeval — ${naam || 'onbekend'}${d ? ` (${d})` : ''}`
          },
        ],
      },
    },
    {
      name: 'match',
      label: 'Wedstrijd',
      type: 'relationship',
      relationTo: 'matches',
      admin: { description: 'De wedstrijd waarbij het ongeval gebeurde (optioneel).' },
    },
    {
      label: 'Slachtoffer',
      type: 'collapsible',
      admin: { initCollapsed: false },
      fields: [
        {
          name: 'player',
          label: 'Speler (lid)',
          type: 'relationship',
          relationTo: 'players',
          admin: { description: 'Indien het slachtoffer een geregistreerd lid is.' },
        },
        {
          type: 'row',
          fields: [
            { name: 'slachtofferNaam', label: 'Naam + voornaam', type: 'text', required: true },
            { name: 'slachtofferGeboortedatum', label: 'Geboortedatum', type: 'date' },
          ],
        },
        { name: 'slachtofferAdres', label: 'Adres', type: 'textarea' },
        { name: 'slachtofferBeroep', label: 'Beroep', type: 'text' },
      ],
    },
    {
      label: 'Ongeval',
      type: 'collapsible',
      admin: { initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'ongevalPlaats', label: 'Plaats', type: 'text' },
            {
              name: 'ongevalDatum',
              label: 'Datum en uur',
              type: 'date',
              admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } },
            },
          ],
        },
        { name: 'omstandigheden', label: 'Omstandigheden', type: 'textarea' },
      ],
    },
    {
      name: 'getuigen',
      label: 'Getuigen',
      type: 'array',
      fields: [
        { name: 'naam', label: 'Naam + voornaam', type: 'text' },
        { name: 'adres', label: 'Adres', type: 'text' },
      ],
    },
    { name: 'opmerkingen', label: 'Opmerkingen', type: 'textarea' },
  ],
}
