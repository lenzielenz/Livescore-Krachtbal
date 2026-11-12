import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// De opvolging van wat er bij de federatie binnenkomt (lib/dossiers.ts, /federatie/aanvragen): wie
// behandelt een aanvraag, op wie wachten we, tegen wanneer, en de notities erbij. Een dossier is een
// LAAG over een bestaande aanvraag (verplaatsingsaanvraag, registratie, klacht, boete, ongeval,
// medische kaart, afgelasting, inschrijving): de aanvraag zelf en haar status blijven in hun eigen
// collection — of ze afgehandeld is, leidt het bord daar uit af, nooit hieruit. Enkel een vrije taak
// (bron 'taak') bestaat alleen hier, met een eigen titel en 'afgerondOp'.

export const DOSSIER_BRONNEN = [
  { label: 'Verplaatsingsaanvraag', value: 'verplaatsing' },
  { label: 'Registratie van een lid', value: 'registratie' },
  { label: 'Klacht over een wedstrijdblad', value: 'klacht' },
  { label: 'Boete', value: 'boete' },
  { label: 'Ongevalsaangifte', value: 'ongeval' },
  { label: 'Medische kaart', value: 'kaart' },
  { label: 'Afgelasting', value: 'afgelasting' },
  { label: 'Inschrijving van een club', value: 'inschrijving' },
  { label: 'Scheidsrechtersrapport', value: 'rapport' },
  { label: 'Uitlening van een jeugdspeler', value: 'uitlening' },
  { label: 'Vrije taak', value: 'taak' },
] as const

export const DOSSIER_WACHT_OP = [
  { label: 'De club', value: 'club' },
  { label: 'De scheidsrechter', value: 'scheidsrechter' },
  { label: 'De speler of ouder', value: 'speler' },
  { label: 'Iemand extern (verzekering, gemeente, …)', value: 'extern' },
] as const

export const Dossiers: CollectionConfig = {
  slug: 'dossiers',
  labels: { singular: 'Dossier', plural: 'Dossiers (opvolging)' },
  admin: {
    useAsTitle: 'titel',
    defaultColumns: ['titel', 'bron', 'behandelaar', 'wachtOp', 'deadline', 'updatedAt'],
    group: 'Federatie',
    description: 'Opvolging van aanvragen en taken op het bord /federatie/aanvragen. De aanvraag zelf staat in haar eigen collection.',
  },
  access: {
    read: ({ req }) => isFederationLevel(req.user),
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'bron', label: 'Soort', type: 'select', required: true, index: true, options: [...DOSSIER_BRONNEN] },
        {
          name: 'bronId',
          label: 'Id van de aanvraag',
          type: 'number',
          index: true,
          admin: { description: 'Het id in de collection van die soort. Leeg voor een vrije taak.' },
        },
      ],
    },
    { name: 'titel', label: 'Titel', type: 'text', admin: { description: 'Voor een vrije taak; bij een aanvraag toont het bord de aanvraag zelf.' } },
    { name: 'omschrijving', label: 'Omschrijving', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'behandelaar', label: 'Behandelaar', type: 'relationship', relationTo: 'users', index: true },
        { name: 'deadline', label: 'Tegen', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'wachtOp', label: 'Wacht op', type: 'select', options: [...DOSSIER_WACHT_OP] },
        { name: 'wachtOpTekst', label: 'Waarop precies', type: 'text' },
      ],
    },
    {
      name: 'notities',
      label: 'Notities',
      type: 'array',
      fields: [
        { name: 'door', label: 'Door', type: 'relationship', relationTo: 'users' },
        { name: 'op', label: 'Op', type: 'date' },
        { name: 'tekst', label: 'Tekst', type: 'textarea', required: true },
      ],
    },
    { name: 'afgerondOp', label: 'Afgerond op', type: 'date', admin: { description: 'Enkel voor een vrije taak.', position: 'sidebar' } },
    { name: 'aangemaaktDoor', label: 'Aangemaakt door', type: 'relationship', relationTo: 'users', admin: { position: 'sidebar', readOnly: true } },
  ],
}
