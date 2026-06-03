import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { fieldIsFederation, hasRole, isFederationLevel, userClubId } from '../lib/access'

export const POSITION_OPTIONS = [
  { label: 'Achter', value: 'achter' },
  { label: 'Vleugel', value: 'vleugel' },
  { label: 'Barage', value: 'barage' },
] as const

export const VERGUNNING_OPTIONS = [
  { label: 'Geen', value: 'geen' },
  { label: 'Aangevraagd', value: 'aangevraagd' },
  { label: 'Geldig', value: 'geldig' },
] as const

export type VergunningStatus = 'geen' | 'aangevraagd' | 'geldig'

// Federatie/admin mogen alle leden bewerken; een club-beheerder enkel die van de eigen club
// (multi-tenant isolatie — AUDIT §4). Verwijderen enkel federatie.
const canWritePlayers: Access = ({ req }) => {
  if (isFederationLevel(req.user)) return true
  if (!hasRole(req.user, 'club-beheerder')) return false
  const clubId = userClubId(req.user)
  return clubId != null ? { 'team.club': { equals: clubId } } : false
}

// Gevoelige ledenvelden (geboortedatum, medisch) niet wereld-leesbaar: enkel interne rollen.
const sensitiveFieldRead: FieldAccess = ({ req }) =>
  isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder', 'scheidsrechter')

export const Players: CollectionConfig = {
  slug: 'players',
  labels: {
    singular: 'Speler',
    plural: 'Spelers',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['shirtNumber', 'name', 'team', 'vergunningsstatus', 'actief'],
    group: 'Beheer',
  },
  access: {
    read: () => true,
    create: canWritePlayers,
    update: canWritePlayers,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      name: 'name',
      label: 'Naam',
      type: 'text',
      required: true,
    },
    {
      name: 'team',
      label: 'Ploeg',
      type: 'relationship',
      relationTo: 'teams',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'shirtNumber',
          label: 'Rugnummer',
          type: 'number',
          required: true,
          min: 0,
          admin: {
            step: 1,
            description: 'Voorkeur-rugnummer. Geen gelijke nummers binnen één ploeg op het blad.',
          },
        },
        {
          name: 'position',
          label: 'Positie',
          type: 'select',
          options: [...POSITION_OPTIONS],
        },
      ],
    },
    {
      // Bepaalt automatisch de leeftijdscategorie (LEEFTIJDSCATEGORIE-SPEC). De berekende
      // categorie wordt afgeleid uit het geboortejaar t.o.v. het peiljaar (fase 2).
      name: 'birthDate',
      label: 'Geboortedatum',
      type: 'date',
      // Persoonsgegeven (vaak minderjarigen): niet publiek leesbaar.
      access: { read: sensitiveFieldRead },
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' },
        description: 'Bepaalt de leeftijdscategorie (peildatum 1 januari).',
      },
    },
    {
      // Read-only weergave: automatisch berekende categorie + peiljaar.
      name: 'berekendeCategorie',
      type: 'ui',
      admin: {
        components: {
          Field: '/components/admin/BerekendeCategorie#BerekendeCategorie',
        },
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'vergunningsstatus',
          label: 'Vergunning',
          type: 'select',
          options: [...VERGUNNING_OPTIONS],
          defaultValue: 'geen',
          // Enkel federatie/admin mag dit zetten (WEDSTRIJDBLAD-PROMPT §Members).
          access: {
            update: fieldIsFederation,
            create: fieldIsFederation,
          },
          admin: {
            description: 'Enkel de federatie/admin zet dit. Groen = geldig.',
            components: {
              Cell: '/components/admin/VergunningBol#VergunningBol',
            },
          },
        },
        {
          name: 'medischAttest',
          label: 'Medisch attest aanwezig',
          type: 'checkbox',
          defaultValue: false,
          access: { read: sensitiveFieldRead },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          // Doktersverbod om één categorie hoger te spelen (LEEFTIJDSCATEGORIE-SPEC §4.2).
          // Met artsenattest aan de federatie gemeld.
          name: 'hogerSpelenVerbod',
          label: 'Doktersverbod hoger spelen',
          type: 'checkbox',
          defaultValue: false,
          access: { read: sensitiveFieldRead },
          admin: {
            description: 'Speler mag dan niet één categorie hoger spelen.',
          },
        },
        {
          name: 'actief',
          label: 'Actief lid',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
}
