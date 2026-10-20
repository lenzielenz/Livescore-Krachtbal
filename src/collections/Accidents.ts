import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'
import { formatDateBE } from '@/lib/datetime'

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
    // Bijzondere-categorie (medische) data: NIET elke ingelogde gebruiker (GDPR Art. 9, AUDIT §4).
    // Federatie en scheidsrechters; de staf van de club van de speler (die vult de aangifte aan);
    // de speler zelf en zijn ouders. Doorgeven gebeurt via /api/matchsheet/[id]/blessure.
    read: ({ req }) => {
      if (isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter')) return true
      const ors: Where[] = []
      const club = userClubId(req.user)
      if (club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker')) ors.push({ club: { equals: club } })
      const u = req.user as { player?: unknown; kinderen?: unknown[] } | null
      const idVan = (v: unknown) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : v)
      const eigen = [idVan(u?.player), ...(u?.kinderen ?? []).map(idVan)].filter((x) => x != null)
      if (eigen.length) ors.push({ player: { in: eigen } })
      return ors.length ? { or: ors } : false
    },
    create: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter'),
    // Een club werkt enkel de aangiften van haar eigen leden bij (vroeger: elke club-beheerder elke aangifte).
    update: ({ req }) => {
      if (isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter')) return true
      const club = userClubId(req.user)
      return club != null && hasRole(req.user, 'club-beheerder') ? { club: { equals: club } } : false
    },
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
            const d = datum ? formatDateBE(new Date(datum)) : ''
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
          // De club van het slachtoffer: bepaalt welke club de aangifte ziet en aanvult.
          name: 'club',
          label: 'Club',
          type: 'relationship',
          relationTo: 'clubs',
          index: true,
          access: { update: ({ req }) => isFederationLevel(req.user) },
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
        { name: 'moment', label: 'Moment in de wedstrijd', type: 'text', admin: { description: 'Bv. "2e helft 12:30, stand 10–8".' } },
        { name: 'omstandigheden', label: 'Omstandigheden', type: 'textarea' },
        { name: 'gemeldDoor', label: 'Doorgegeven door', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
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
    {
      // Het dossier: de speler (of ouder) laat de aangifte en het geneeskundig getuigschrift invullen,
      // laadt ze op (collections/OngevalDocumenten.ts) en dient in; de federatie handelt af of stuurt
      // terug met een opmerking. Enkel via /api/ongeval/[id] (lib/ongeval-dossier.ts).
      name: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'gemeld',
      index: true,
      options: [
        { label: 'Documenten te bezorgen', value: 'gemeld' },
        { label: 'Bij de federatie', value: 'ingediend' },
        { label: 'Afgehandeld', value: 'afgehandeld' },
      ],
      access: { update: ({ req }) => isFederationLevel(req.user) },
      admin: { position: 'sidebar' },
    },
    { name: 'ingediendOp', label: 'Ingediend op', type: 'date', admin: { position: 'sidebar', readOnly: true } },
    { name: 'afgehandeldOp', label: 'Afgehandeld op', type: 'date', admin: { position: 'sidebar', readOnly: true } },
    {
      name: 'federatieOpmerking',
      label: 'Opmerking van de federatie',
      type: 'textarea',
      access: { update: ({ req }) => isFederationLevel(req.user) },
      admin: { position: 'sidebar' },
    },
  ],
}
