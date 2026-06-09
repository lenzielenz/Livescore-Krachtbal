import type { CollectionConfig } from 'payload'

// Eén wedstrijd in een tornooischema. De stand is event-sourced: `goals[]` bevat elke gescoorde
// worp (nek = 1, rug = 2), de stand wordt afgeleid, undo = laatste goal verwijderen. `winnerTo` en
// `loserTo` (JSON-coördinaten naar een ander slot) sturen de doorschuiving aan; ze worden bij het
// aanmaken berekend door src/lib/tournament.ts.
export const TournamentMatches: CollectionConfig = {
  slug: 'tournament-matches',
  labels: { singular: 'Tornooiwedstrijd', plural: 'Tornooiwedstrijden' },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'tournament', 'home', 'away', 'status'],
    group: 'Wedstrijden',
    hidden: true, // beheerd via het /tornooi-scherm, niet handmatig in de admin
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'tournament', label: 'Tornooi', type: 'relationship', relationTo: 'tournaments', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'round', label: 'Ronde', type: 'number', required: true },
        { name: 'position', label: 'Positie', type: 'number', required: true },
        {
          name: 'bracket',
          label: 'Schema',
          type: 'select',
          options: [
            { label: 'Hoofdschema', value: 'main' },
            { label: 'Kleine finale', value: 'third' },
          ],
          defaultValue: 'main',
          required: true,
        },
        { name: 'label', label: 'Label', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'home', label: 'Thuis', type: 'text', admin: { description: 'Leeg = nog te bepalen.' } },
        { name: 'away', label: 'Uit', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Te spelen', value: 'pending' },
            { label: 'Bezig', value: 'live' },
            { label: 'Afgelopen', value: 'finished' },
          ],
          defaultValue: 'pending',
          required: true,
        },
        {
          name: 'winner',
          label: 'Winnaar',
          type: 'select',
          options: [
            { label: 'Thuis', value: 'home' },
            { label: 'Uit', value: 'away' },
          ],
        },
      ],
    },
    {
      // Event-sourced score: lijst van { side, points (1/2), half, clock, ts }.
      name: 'goals',
      label: 'Doelpunten',
      type: 'json',
      defaultValue: [],
    },
    // Tellers per ploeg: kruisjes (rechtstreeks buiten) en aangevraagde minuten (time-outs).
    { name: 'crosses', label: 'Kruisjes', type: 'json', defaultValue: { home: 0, away: 0 } },
    { name: 'timeouts', label: 'Time-outs', type: 'json', defaultValue: { home: 0, away: 0 } },
    // Scheidsrechter-minuten (gestopte tijd) — zoals op het gewone aantekenblad.
    { name: 'refereeStops', label: 'Scheidsrechter-minuten', type: 'number', defaultValue: 0, min: 0 },
    // Doorschuif-coördinaten (berekend bij aanmaken).
    { name: 'winnerTo', type: 'json', admin: { hidden: true } },
    { name: 'loserTo', type: 'json', admin: { hidden: true } },
    {
      label: 'Klokstaat',
      type: 'collapsible',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'currentHalf', label: 'Helft', type: 'number', defaultValue: 1, min: 1, max: 2 },
            { name: 'clockSeconds', label: 'Klok (sec)', type: 'number', defaultValue: 0, min: 0 },
            { name: 'clockRunning', label: 'Klok loopt', type: 'checkbox', defaultValue: false },
          ],
        },
        { name: 'clockUpdatedAt', label: 'Klok bijgewerkt op', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } } },
      ],
    },
  ],
}
