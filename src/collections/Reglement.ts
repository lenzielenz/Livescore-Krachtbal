import type { Access, CollectionConfig, Where } from 'payload'

import { isFederationLevel } from '../lib/access'
import { CATEGORY_OPTIONS } from '../lib/categories'
import { REEKS_OPTIONS } from '../lib/reeksen'

// Het reglement als bron van hoe alles werkt (lib/competitieregels.ts):
//  - reglementen: het reglement zelf, in versies. Er is altijd hoogstens één actieve versie.
//  - reglement-verslagen: kleine verslagen met nieuwe of gewijzigde regels, vastgehangen aan een
//    reglementversie. Toevoegen, bewerken, intrekken.
//  - competitieregels: de regels als bouwstenen die het systeem uitvoert (vastspelen, eindronde…).
//    Elke bouwsteen verwijst naar zijn bron: een artikel uit het reglement of een verslag.
//  - eindrondes: wat het systeem uit een eindronde-regel aanmaakte (ploegen + kalender).
// Lezen: iedereen ziet wat gepubliceerd is (actief/archief); concepten enkel de federatie.

const federatie: Access = ({ req }) => isFederationLevel(req.user)
const gepubliceerd = (veld: string, waarden: string[]): Access => ({ req }) =>
  isFederationLevel(req.user) ? true : ({ [veld]: { in: waarden } } as Where)

export const Reglementen: CollectionConfig = {
  slug: 'reglementen',
  labels: { singular: 'Reglement', plural: 'Reglementen' },
  admin: { group: 'Federatie', useAsTitle: 'titel', defaultColumns: ['titel', 'geldigVanaf', 'status'] },
  access: { read: gepubliceerd('status', ['actief', 'archief']), create: federatie, update: federatie, delete: federatie },
  fields: [
    { name: 'titel', label: 'Titel', type: 'text', required: true, admin: { description: 'Bv. "RCVK 2026".' } },
    { name: 'geldigVanaf', label: 'Geldig vanaf', type: 'date', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'concept',
      index: true,
      options: [
        { label: 'Concept (enkel federatie)', value: 'concept' },
        { label: 'Actief — dit geldt', value: 'actief' },
        { label: 'Archief (vorige versie)', value: 'archief' },
      ],
    },
    { name: 'bron', label: 'Officiële bron (URL)', type: 'text' },
    { name: 'inhoud', label: 'Tekst van het reglement (markdown)', type: 'textarea', required: true, admin: { rows: 30 } },
  ],
}

export const ReglementVerslagen: CollectionConfig = {
  slug: 'reglement-verslagen',
  labels: { singular: 'Verslag (reglementswijziging)', plural: 'Verslagen' },
  admin: { group: 'Federatie', useAsTitle: 'titel', defaultColumns: ['titel', 'datum', 'artikel', 'status'] },
  access: { read: gepubliceerd('status', ['actief', 'ingetrokken']), create: federatie, update: federatie, delete: federatie },
  fields: [
    { name: 'titel', label: 'Titel', type: 'text', required: true },
    { name: 'datum', label: 'Datum (vergadering)', type: 'date', required: true },
    { name: 'reglement', label: 'Hoort bij reglement', type: 'relationship', relationTo: 'reglementen', required: true, index: true },
    { name: 'artikel', label: 'Artikel(s)', type: 'text', admin: { description: 'Welk artikel wijzigt of vult het aan, bv. "art. 34".' } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'actief',
      options: [
        { label: 'Van toepassing', value: 'actief' },
        { label: 'Ingetrokken', value: 'ingetrokken' },
      ],
    },
    { name: 'inhoud', label: 'Tekst van het verslag', type: 'textarea', required: true, admin: { rows: 12 } },
  ],
}

export const COMPETITIEREGEL_SOORTEN = [
  { label: 'Vastspelen: zo vaak hoger spelen, daarna vast in de hogere reeks', value: 'vastspelen' },
  { label: 'Eindronde: de besten van een paar reeksen spelen nog eens tegen elkaar', value: 'eindronde' },
] as const

export const Competitieregels: CollectionConfig = {
  slug: 'competitieregels',
  labels: { singular: 'Competitieregel (bouwsteen)', plural: 'Competitieregels' },
  admin: { group: 'Federatie', useAsTitle: 'naam', defaultColumns: ['naam', 'soort', 'actief'] },
  access: { read: () => true, create: federatie, update: federatie, delete: federatie },
  fields: [
    { name: 'naam', label: 'Naam', type: 'text', required: true },
    { name: 'soort', label: 'Soort', type: 'select', required: true, options: [...COMPETITIEREGEL_SOORTEN] },
    { name: 'actief', label: 'Van toepassing', type: 'checkbox', defaultValue: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'reglement', label: 'Bron: reglement', type: 'relationship', relationTo: 'reglementen' },
        { name: 'verslag', label: 'Bron: verslag', type: 'relationship', relationTo: 'reglement-verslagen' },
        { name: 'artikel', label: 'Artikel', type: 'text' },
      ],
    },
    // Vastspelen
    {
      name: 'maxKeerHoger',
      label: 'Hoeveel keer hoger spelen mag (daarna vast)',
      type: 'number',
      min: 1,
      admin: { condition: (_, s) => s?.soort === 'vastspelen' },
    },
    {
      name: 'categorie',
      label: 'Geldt voor categorie',
      type: 'select',
      options: [{ label: 'Alle', value: 'alle' }, ...CATEGORY_OPTIONS],
      defaultValue: 'alle',
      admin: { condition: (_, s) => s?.soort === 'vastspelen' },
    },
    // Eindronde
    {
      name: 'bronReeksen',
      label: 'Reeksen waaruit de eindronde komt',
      type: 'select',
      hasMany: true,
      options: [...REEKS_OPTIONS],
      admin: { condition: (_, s) => s?.soort === 'eindronde' },
    },
    { name: 'topPerReeks', label: 'Hoeveel per reeks gaan door', type: 'number', min: 1, admin: { condition: (_, s) => s?.soort === 'eindronde' } },
    { name: 'eindrondeNaam', label: 'Naam van de eindronde', type: 'text', admin: { condition: (_, s) => s?.soort === 'eindronde' } },
    { name: 'heenEnTerug', label: 'Heen en terug', type: 'checkbox', defaultValue: false, admin: { condition: (_, s) => s?.soort === 'eindronde' } },
    {
      name: 'dagenNaEinde',
      label: 'Eerste speeldag: zoveel dagen na de laatste wedstrijd',
      type: 'number',
      defaultValue: 7,
      min: 1,
      admin: { condition: (_, s) => s?.soort === 'eindronde' },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        // Geen regel zonder bron: het reglement is heilig, dus elke bouwsteen zegt waar hij vandaan komt.
        if (data && !data.reglement && !data.verslag) throw new Error('Kies de bron: een reglement of een verslag.')
        return data
      },
    ],
  },
}

export const Eindrondes: CollectionConfig = {
  slug: 'eindrondes',
  labels: { singular: 'Eindronde', plural: 'Eindrondes' },
  admin: { group: 'Federatie', useAsTitle: 'naam', defaultColumns: ['naam', 'seizoen', 'status'] },
  access: { read: () => true, create: federatie, update: federatie, delete: federatie },
  fields: [
    { name: 'naam', type: 'text', required: true },
    { name: 'seizoen', type: 'text', required: true, index: true },
    { name: 'regel', type: 'relationship', relationTo: 'competitieregels', required: true, index: true },
    { name: 'categorie', type: 'select', options: CATEGORY_OPTIONS, defaultValue: 'senioren' },
    { name: 'ploegen', type: 'relationship', relationTo: 'teams', hasMany: true },
  ],
}
