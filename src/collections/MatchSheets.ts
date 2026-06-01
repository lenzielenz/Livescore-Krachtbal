import type { CollectionBeforeChangeHook, CollectionConfig, Field } from 'payload'

import { hasRole, isFederationLevel, userRoles } from '../lib/access'
import { KEURING_ITEMS, KEURING_OPTIONS } from '../lib/keuring'
import {
  MATCHSHEET_STATUS_OPTIONS,
  type MatchSheetStatus,
  canTransition,
  nextStatus,
} from '../lib/matchsheet-workflow'

// Eén opstellingsregel (per speler op het blad).
const lineupFields: Field[] = [
  { name: 'player', label: 'Speler', type: 'relationship', relationTo: 'players', required: true },
  { name: 'rugnummer', label: 'Rugnummer', type: 'number', min: 0 },
  {
    name: 'deelgenomen',
    label: 'Deelgenomen (O)',
    type: 'checkbox',
    defaultValue: false,
    admin: { description: 'O-markering: heeft effectief deelgenomen.' },
  },
  { name: 'ibGecontroleerd', label: 'IB gecontroleerd', type: 'checkbox', defaultValue: false },
]

// Status-machine afdwingen + override-log bijhouden (WEDSTRIJDBLAD-PROMPT §workflow, Item 37).
const enforceWorkflow: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation === 'create') return data
  const from = originalDoc?.status as MatchSheetStatus | undefined
  const to = data?.status as MatchSheetStatus | undefined

  // Na indienen is niets meer wijzigbaar (reglement Item 37).
  if (from === 'ingediend') {
    throw new Error('Het wedstrijdblad is ingediend en kan niet meer gewijzigd worden (Item 37).')
  }

  if (!from || !to || from === to) return data

  const roles = userRoles(req.user)
  const check = canTransition(from, to, { roles, isAssignedReferee: false })
  if (!check.allowed) {
    throw new Error(check.reason || 'Ongeldige statusovergang.')
  }

  // Manuele (niet-lineaire) overgang → loggen in de override-log.
  if (nextStatus(from) !== to) {
    const entry = {
      wie: req.user?.id ?? null,
      wanneer: new Date().toISOString(),
      wat: `Manuele statuswijziging: ${from} → ${to}`,
    }
    data.overrideLog = [...((originalDoc?.overrideLog as unknown[]) ?? []), entry]
  }

  return data
}

export const MatchSheets: CollectionConfig = {
  slug: 'matchsheets',
  labels: { singular: 'Wedstrijdblad', plural: 'Wedstrijdbladen' },
  admin: {
    useAsTitle: 'titel',
    defaultColumns: ['titel', 'status'],
    group: 'Wedstrijden',
  },
  access: {
    // Intern document — enkel ingelogde rollen lezen het.
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) =>
      isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter', 'club-beheerder'),
    update: ({ req }) =>
      isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter', 'club-beheerder'),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    beforeChange: [enforceWorkflow],
  },
  fields: [
    {
      name: 'titel',
      type: 'text',
      admin: { readOnly: true, hidden: true },
      hooks: {
        beforeChange: [
          async ({ siblingData, req }) => {
            const matchId = (siblingData as { match?: string | number }).match
            if (!matchId) return undefined
            const m = await req.payload
              .findByID({ collection: 'matches', id: matchId, depth: 0 })
              .catch(() => null)
            return m && typeof m.title === 'string' ? `Blad — ${m.title}` : undefined
          },
        ],
      },
    },
    {
      name: 'match',
      label: 'Wedstrijd',
      type: 'relationship',
      relationTo: 'matches',
      required: true,
      unique: true,
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: MATCHSHEET_STATUS_OPTIONS,
      defaultValue: 'concept',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'assignedReferee',
          label: 'Toegewezen scheidsrechter',
          type: 'relationship',
          relationTo: 'officials',
        },
        {
          name: 'assignedLinesman',
          label: 'Toegewezen grensrechter',
          type: 'relationship',
          relationTo: 'officials',
        },
      ],
    },
    {
      // Officials-functies (volledige naam + voornaam). Welke verplicht zijn hangt af van het
      // reekstype (Wedstrijdblad_invullen.pdf) — zie de hint op het scheidsrechterscherm.
      label: 'Officials (functies)',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'officials',
          type: 'group',
          label: false,
          fields: [
            { name: 'aantekenaar', label: 'Aantekenaar / scorer', type: 'text' },
            { name: 'tijdopnemer', label: 'Tijdopnemer', type: 'text' },
            { name: 'grensrechterThuis', label: 'Grensrechter (thuis)', type: 'text' },
            { name: 'grensrechterUit', label: 'Grensrechter (uit)', type: 'text' },
            { name: 'terreinafgevaardigde', label: 'Terreinafgevaardigde', type: 'text' },
            { name: 'coachThuis', label: 'Coach (thuis)', type: 'text' },
            { name: 'coachUit', label: 'Coach (uit)', type: 'text' },
          ],
        },
      ],
    },
    {
      label: 'Opstellingen',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        { name: 'homeLineup', label: 'Opstelling thuis', type: 'array', fields: lineupFields },
        { name: 'awayLineup', label: 'Opstelling uit', type: 'array', fields: lineupFields },
      ],
    },
    {
      label: 'Materiële keuring',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'keuring',
          type: 'group',
          label: false,
          fields: KEURING_ITEMS.map((item) => ({
            name: item.name,
            label: item.label,
            type: 'select' as const,
            options: [...KEURING_OPTIONS],
            defaultValue: 'ok',
          })),
        },
      ],
    },
    {
      label: 'Uitsluitingen & voorbehoud',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'uitsluitingen',
          label: 'Uitsluitingen',
          type: 'array',
          fields: [
            { name: 'player', label: 'Speler', type: 'relationship', relationTo: 'players' },
            { name: 'naam', label: 'Naam (indien geen lid)', type: 'text' },
            { name: 'reden', label: 'Reden', type: 'text' },
            { name: 'score', label: 'Score op dat moment', type: 'text' },
            { name: 'speeltijd', label: 'Speeltijd', type: 'text' },
          ],
        },
        {
          name: 'voorbehoud',
          label: 'Voorbehoud',
          type: 'array',
          fields: [
            { name: 'naam', label: 'Naam', type: 'text' },
            { name: 'reden', label: 'Reden', type: 'text' },
            { name: 'score', label: 'Score op dat moment', type: 'text' },
          ],
        },
        { name: 'opmerkingen', label: 'Opmerkingen / kwetsuren', type: 'textarea' },
      ],
    },
    {
      label: 'Handtekeningen',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        signatureGroup('kapiteinThuis', 'Kapitein thuis'),
        signatureGroup('kapiteinUit', 'Kapitein uit'),
        signatureGroup('scheidsrechter', 'Scheidsrechter'),
      ],
    },
    {
      name: 'overrideLog',
      label: 'Override-log',
      type: 'array',
      admin: {
        readOnly: true,
        initCollapsed: true,
        description: 'Automatisch: elke manuele overschrijving (wie/wanneer/wat).',
      },
      fields: [
        { name: 'wie', type: 'relationship', relationTo: 'users' },
        { name: 'wanneer', type: 'text' },
        { name: 'wat', type: 'text' },
      ],
    },
  ],
}

// Handtekening-blok: akkoord + naam + getekende handtekening (canvas → data-URL) + tijdstip.
function signatureGroup(name: string, label: string): Field {
  return {
    name,
    label,
    type: 'group',
    fields: [
      { name: 'akkoord', label: 'Akkoord', type: 'checkbox', defaultValue: false },
      { name: 'naam', label: 'Naam', type: 'text' },
      {
        name: 'handtekening',
        label: 'Handtekening (canvas)',
        type: 'textarea',
        admin: { description: 'Data-URL van de getekende handtekening.', hidden: true },
      },
      { name: 'tijdstip', label: 'Tijdstip', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    ],
  }
}
