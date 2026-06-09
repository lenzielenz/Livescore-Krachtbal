import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { fieldIsFederation, hasRole, isFederationLevel, userClubId } from '../lib/access'
import { analyseEntityFields } from '../lib/analyse-fields'

export const POSITION_OPTIONS = [
  { label: 'Achter', value: 'achter' },
  { label: 'Vleugel links', value: 'vleugel-links' },
  { label: 'Vleugel rechts', value: 'vleugel-rechts' },
  { label: 'Barage', value: 'barage' },
  // Legacy: bestaande spelers zonder aangeduide kant (re-set naar links/rechts waar mogelijk).
  { label: 'Vleugel (kant onbekend)', value: 'vleugel' },
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
  hooks: {
    // De club is enkel een hulpfilter voor de ploegkeuze; de PLOEG is de bron van waarheid.
    // Sync de club daarom altijd met de club van de gekozen ploeg. Zonder dit weigert de
    // filterOptions-validatie van het team-veld élke save zodra club ≠ club-van-de-ploeg
    // (bv. na een club-wissel zonder ploeg-wissel) → "400 / niets kan bewaard worden".
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        if (!data) return data
        const rawTeam = data.team ?? (originalDoc as { team?: unknown } | undefined)?.team
        const teamId = rawTeam && typeof rawTeam === 'object' ? (rawTeam as { id?: unknown }).id : rawTeam
        if (teamId == null || !Number.isFinite(Number(teamId))) return data
        const team = await req.payload
          .findByID({ collection: 'teams', id: Number(teamId), depth: 0 })
          .catch(() => null)
        const rawClub = team?.club
        const clubId = rawClub && typeof rawClub === 'object' ? (rawClub as { id?: unknown }).id : rawClub
        if (clubId != null && Number.isFinite(Number(clubId))) data.club = Number(clubId)
        return data
      },
    ],
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
      // Kies eerst de club; daaronder kies je de ploeg (gefilterd op die club). De club wordt ook
      // gebruikt om de juiste ploegen te tonen — bv. wanneer dezelfde club meerdere ploegen heeft.
      name: 'club',
      label: 'Club',
      type: 'relationship',
      relationTo: 'clubs',
      // Niet verplicht in de DB (zo blijven bestaande spelers geldig), maar in de praktijk kies je
      // ze eerst: zonder club toont de ploegkeuze niets, dus je wordt er vanzelf naartoe geleid.
      admin: { description: 'Kies eerst de club. Daaronder verschijnen enkel de ploegen van die club.' },
    },
    {
      name: 'team',
      label: 'Ploeg / reeks',
      type: 'relationship',
      relationTo: 'teams',
      required: true,
      // Toon de ploegen van de gekozen club; de ploegnaam toont ook de reeks (Teams.displayTitle)
      // zodat gelijknamige ploegen te onderscheiden zijn. Geen club gekozen → toon álle ploegen
      // (zodat de lijst nooit leeg is en je altijd een ploeg kan kiezen).
      filterOptions: ({ data, siblingData }) => {
        const raw = (siblingData as { club?: unknown })?.club ?? (data as { club?: unknown })?.club
        const id = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : raw
        // '' zou via Number('') === 0 een onmogelijke filter (club=0) opleveren → lege lijst.
        const clubId = id != null && id !== '' ? Number(id) : NaN
        // Analyse-speler → enkel analyse-ploegen tonen; competitie-speler → analyse-ploegen verbergen.
        const isAnalyse = Boolean((siblingData as { analyseOnly?: boolean })?.analyseOnly ?? (data as { analyseOnly?: boolean })?.analyseOnly)
        const analyseClause = { analyseOnly: isAnalyse ? { equals: true } : { not_equals: true } }
        return Number.isFinite(clubId) && clubId > 0 ? { and: [{ club: { equals: clubId } }, analyseClause] } : analyseClause
      },
      admin: { description: 'Kies eerst een club hierboven om de lijst te beperken. De reeks staat bij de ploegnaam.' },
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
    ...analyseEntityFields,
  ],
}
