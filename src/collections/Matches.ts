import type { CollectionConfig } from 'payload'

import { CATEGORY_OPTIONS } from '../lib/categories'

export const MATCH_STATUS_OPTIONS = [
  { label: 'Gepland', value: 'scheduled' },
  { label: 'Live', value: 'live' },
  { label: 'Afgelopen', value: 'finished' },
] as const

export const Matches: CollectionConfig = {
  slug: 'matches',
  labels: {
    singular: 'Wedstrijd',
    plural: 'Wedstrijden',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'date', 'category', 'status'],
    group: 'Wedstrijden',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      // Leesbare titel, samengesteld uit de ploegen. Niet handmatig in te vullen.
      name: 'title',
      label: 'Titel',
      type: 'text',
      admin: {
        readOnly: true,
        hidden: true,
      },
      hooks: {
        beforeChange: [
          async ({ siblingData, req }) => {
            const { homeTeam, awayTeam } = siblingData as {
              homeTeam?: string
              awayTeam?: string
            }
            if (!homeTeam || !awayTeam) return undefined
            const [home, away] = await Promise.all([
              req.payload.findByID({ collection: 'teams', id: homeTeam, depth: 0 }).catch(() => null),
              req.payload.findByID({ collection: 'teams', id: awayTeam, depth: 0 }).catch(() => null),
            ])
            if (!home || !away) return undefined
            return `${home.name} — ${away.name}`
          },
        ],
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'homeTeam',
          label: 'Thuisploeg',
          type: 'relationship',
          relationTo: 'teams',
          required: true,
        },
        {
          name: 'awayTeam',
          label: 'Uitploeg',
          type: 'relationship',
          relationTo: 'teams',
          required: true,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'date',
          label: 'Datum',
          type: 'date',
          required: true,
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
          },
        },
        {
          name: 'category',
          label: 'Categorie',
          type: 'select',
          options: CATEGORY_OPTIONS,
          required: true,
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [...MATCH_STATUS_OPTIONS],
          defaultValue: 'scheduled',
          required: true,
        },
      ],
    },
    {
      // Klokstaat — runtime live-state. De definitieve tijdlijn blijft afleidbaar uit MatchEvents.
      label: 'Klokstaat',
      type: 'collapsible',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'currentHalf',
              label: 'Helft',
              type: 'number',
              defaultValue: 1,
              min: 1,
              max: 2,
            },
            {
              name: 'clockSeconds',
              label: 'Klok (sec, telt op vanaf 0)',
              type: 'number',
              defaultValue: 0,
              min: 0,
            },
            {
              name: 'clockRunning',
              label: 'Klok loopt',
              type: 'checkbox',
              defaultValue: false,
            },
          ],
        },
        {
          // Tijdstip waarop de klok voor het laatst is gestart/bijgewerkt — om de live
          // verstreken tijd te berekenen wanneer clockRunning = true.
          name: 'clockUpdatedAt',
          label: 'Klok bijgewerkt op',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
          },
        },
      ],
    },
  ],
}
