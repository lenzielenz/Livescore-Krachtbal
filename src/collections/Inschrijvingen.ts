import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'
import { REEKS_OPTIONS } from '../lib/reeksen'

// Inschrijving van ploegen voor een nieuw seizoen (lib/inschrijving.ts). De federatie opent een
// ronde met een deadline en de speelweekends; elke club schrijft vóór de deadline haar ploegen in
// per reeks, met haar voorkeuren (thuisdag/uur, koppelploegen, velden, weekends dat het terrein niet
// vrij is). Daarna verwerkt de federatie de inschrijvingen (ploegen bijgewerkt/aangemaakt) en maakt ze
// de kalender (lib/kalender-planner.ts). Schrijven enkel via de routes.

export const InschrijvingsRondes: CollectionConfig = {
  slug: 'inschrijvingsrondes',
  labels: { singular: 'Inschrijvingsronde', plural: 'Inschrijvingsrondes' },
  admin: { group: 'Federatie', useAsTitle: 'seizoen', defaultColumns: ['seizoen', 'deadline', 'status'] },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'seizoen', label: 'Seizoen', type: 'text', required: true, admin: { placeholder: '2027-2028' } },
    { name: 'deadline', label: 'Inschrijven tot', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'open',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Gesloten', value: 'gesloten' },
      ],
    },
    { name: 'eersteWeekend', label: 'Eerste speelweekend (zaterdag)', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'laatsteWeekend', label: 'Laatste speelweekend (zaterdag)', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
    {
      name: 'vrijeWeekends',
      label: 'Weekends zonder competitie',
      type: 'array',
      admin: { description: 'Feestdagen, beker, tornooien: daar plant de kalender niets.' },
      fields: [
        { name: 'weekend', label: 'Zaterdag', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'reden', label: 'Reden', type: 'text' },
      ],
    },
    { name: 'toelichting', label: 'Toelichting voor de clubs', type: 'textarea' },
  ],
}

const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user)) return true
  const club = userClubId(req.user)
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker') ? { club: { equals: club } } : false
}

export const Inschrijvingen: CollectionConfig = {
  slug: 'inschrijvingen',
  labels: { singular: 'Inschrijving', plural: 'Inschrijvingen' },
  admin: { group: 'Federatie', defaultColumns: ['club', 'ronde', 'status', 'ingediendOp'] },
  access: {
    read: lezen,
    create: () => false,
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'ronde', label: 'Ronde', type: 'relationship', relationTo: 'inschrijvingsrondes', required: true, index: true },
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', required: true, index: true },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'concept',
      options: [
        { label: 'Concept', value: 'concept' },
        { label: 'Ingediend', value: 'ingediend' },
        { label: 'Verwerkt door de federatie', value: 'verwerkt' },
      ],
    },
    { name: 'ingediendOp', label: 'Ingediend op', type: 'date', admin: { readOnly: true } },
    {
      name: 'ploegen',
      label: 'Ploegen',
      type: 'array',
      fields: [
        { name: 'team', label: 'Bestaande ploeg', type: 'relationship', relationTo: 'teams' },
        { name: 'naam', label: 'Ploegnaam', type: 'text', required: true },
        { name: 'reeks', label: 'Reeks', type: 'select', required: true, options: [...REEKS_OPTIONS] },
        {
          name: 'thuisdag',
          label: 'Thuisdag',
          type: 'select',
          options: [
            { label: 'Zaterdag', value: 'za' },
            { label: 'Zondag', value: 'zo' },
          ],
        },
        { name: 'thuisUur', label: 'Thuisuur', type: 'text' },
        { name: 'koppelMet', label: 'Koppelen met (ploegnaam)', type: 'text' },
        { name: 'opmerking', label: 'Opmerking', type: 'text' },
      ],
    },
    { name: 'aantalVelden', label: 'Aantal velden', type: 'number', defaultValue: 1, min: 1, max: 4 },
    {
      name: 'onbeschikbaar',
      label: 'Terrein niet vrij',
      type: 'array',
      fields: [
        { name: 'weekend', label: 'Weekend (zaterdag)', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'reden', label: 'Reden', type: 'text' },
        { name: 'hard', label: 'Kan echt niet', type: 'checkbox', defaultValue: true },
      ],
    },
    { name: 'wensen', label: 'Andere wensen', type: 'textarea' },
  ],
}
