import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

const idVan = (v: unknown) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : v)

// Uitlenen van jeugdspelers (RCVK item 45): "Clubs kunnen jeugdspelers voor de duur van één competitie
// uitlenen aan een andere club. Daartoe moet een overeenkomst, ondertekend door de beide clubs,
// overgemaakt worden aan de federatie. De overeenkomst vermeldt minstens naam, adres, leeftijd,
// categorie van de speler en de specifieke competitie waar de overeenkomst geldig is. De speler blijft
// lid van zijn/haar oorspronkelijke club."
//
// Eén record = één overeenkomst. De uitlenende club stelt ze op en tekent; de ontvangende club tekent;
// de federatie bevestigt. Pas dan staat de speler op de selectielijst van de ploeg die hem leent
// (lib/matchsheet-data.ts). De speler zelf (club, ploeg) verandert niet. Alles via lib/uitlening.ts.
//
// Lezen: de federatie, de staf van beide clubs, en de speler zelf (of zijn ouder).
export const Uitleningen: CollectionConfig = {
  slug: 'uitleningen',
  labels: { singular: 'Uitlening', plural: 'Uitleningen' },
  admin: {
    group: 'Federatie',
    defaultColumns: ['speler', 'vanClub', 'naarPloeg', 'seizoen', 'status'],
    hidden: ({ user }) => !isFederationLevel(user),
  },
  access: {
    read: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const ors: Where[] = []
      const club = userClubId(req.user)
      if (club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker')) {
        ors.push({ vanClub: { equals: club } }, { naarClub: { equals: club } })
      }
      const u = req.user as { player?: unknown; kinderen?: unknown[] } | null
      const eigen = [idVan(u?.player), ...(u?.kinderen ?? []).map(idVan)].filter((x) => x != null)
      if (eigen.length) ors.push({ speler: { in: eigen } })
      return ors.length ? { or: ors } : false
    },
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'speler', label: 'Speler', type: 'relationship', relationTo: 'players', required: true, index: true },
    { name: 'vanClub', label: 'Uitlenende club', type: 'relationship', relationTo: 'clubs', required: true, index: true },
    { name: 'naarClub', label: 'Ontvangende club', type: 'relationship', relationTo: 'clubs', required: true, index: true },
    { name: 'naarPloeg', label: 'Ploeg (competitie)', type: 'relationship', relationTo: 'teams', required: true, index: true },
    { name: 'seizoen', label: 'Seizoen', type: 'text', required: true, index: true },
    // Wat de overeenkomst minstens vermeldt (item 45), vastgelegd op het moment van opstellen.
    { name: 'spelerNaam', label: 'Naam', type: 'text', required: true },
    { name: 'adres', label: 'Adres', type: 'text', required: true },
    { name: 'geboortedatum', label: 'Geboortedatum', type: 'date' },
    { name: 'categorie', label: 'Categorie', type: 'text' },
    { name: 'competitie', label: 'Competitie', type: 'text' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'wacht_ontvanger',
      index: true,
      options: [
        { label: 'Wacht op de handtekening van de ontvangende club', value: 'wacht_ontvanger' },
        { label: 'Bij de federatie', value: 'wacht_federatie' },
        { label: 'Bevestigd', value: 'bevestigd' },
        { label: 'Geweigerd', value: 'geweigerd' },
        { label: 'Ingetrokken', value: 'ingetrokken' },
      ],
    },
    {
      name: 'tekenVan',
      label: 'Handtekening uitlenende club',
      type: 'group',
      fields: [
        { name: 'door', type: 'relationship', relationTo: 'users' },
        { name: 'naam', type: 'text' },
        { name: 'op', type: 'date' },
      ],
    },
    {
      name: 'tekenNaar',
      label: 'Handtekening ontvangende club',
      type: 'group',
      fields: [
        { name: 'door', type: 'relationship', relationTo: 'users' },
        { name: 'naam', type: 'text' },
        { name: 'op', type: 'date' },
      ],
    },
    { name: 'behandeldDoor', label: 'Behandeld door (federatie)', type: 'relationship', relationTo: 'users' },
    { name: 'behandeldOp', label: 'Behandeld op', type: 'date' },
    { name: 'toelichting', label: 'Toelichting', type: 'textarea' },
  ],
}
