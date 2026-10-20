import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

// Boetes aan clubs (lib/boetes.ts). Het reglement in dit project bevat de bedragen niet: de
// federatie zet zelf de boetelijst op (BoeteSoorten — bedrag, en of het systeem ze voorstelt bij een
// forfait, een laattijdig ingediend blad of een latere aftrap door de club). Het systeem maakt dan
// VOORSTELLEN; pas als de federatie een voorstel oplegt, ziet de club het. De club meldt een betaling
// of betwist; de federatie bevestigt, handhaaft of vernietigt.

export const BOETE_TRIGGERS = [
  { label: 'Geen (enkel manueel)', value: 'geen' },
  { label: 'Forfait (afwezige ploeg)', value: 'forfait' },
  { label: 'Wedstrijdblad niet tijdig ingediend', value: 'blad_te_laat' },
  { label: 'Aftrap later door de club (file, ziekte)', value: 'te_laat' },
] as const

export const BOETE_STATUSSEN = [
  { label: 'Voorstel (enkel federatie)', value: 'voorstel' },
  { label: 'Opgelegd', value: 'opgelegd' },
  { label: 'Betaling gemeld door club', value: 'betaling_gemeld' },
  { label: 'Betaald', value: 'betaald' },
  { label: 'Betwist door club', value: 'betwist' },
  { label: 'Vernietigd', value: 'vernietigd' },
] as const

export const BoeteSoorten: CollectionConfig = {
  slug: 'boete-soorten',
  labels: { singular: 'Boetesoort', plural: 'Boetelijst' },
  admin: { group: 'Federatie', useAsTitle: 'naam', defaultColumns: ['naam', 'bedrag', 'trigger', 'actief'] },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'naam', label: 'Omschrijving', type: 'text', required: true },
    { name: 'artikel', label: 'Reglementsartikel', type: 'text', admin: { description: 'Bv. "Huishoudelijk reglement art. 12" — staat bij de boete op het overzicht van de club.' } },
    { name: 'bedrag', label: 'Bedrag (€)', type: 'number', required: true, min: 0 },
    {
      name: 'trigger',
      label: 'Automatisch voorstellen bij',
      type: 'select',
      defaultValue: 'geen',
      options: [...BOETE_TRIGGERS],
      admin: { description: 'Het systeem maakt een VOORSTEL; de federatie beslist altijd zelf of het opgelegd wordt.' },
    },
    {
      name: 'termijnDagen',
      label: 'Termijn (dagen)',
      type: 'number',
      min: 0,
      admin: { description: 'Voor "blad niet tijdig ingediend": zoveel dagen na de wedstrijd. Voor "aftrap later": vanaf hoeveel minuten (leeg = elke vertraging).' },
    },
    { name: 'actief', label: 'Actief', type: 'checkbox', defaultValue: true },
  ],
}

const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user)) return true
  const club = userClubId(req.user)
  // De club ziet haar opgelegde boetes — nooit de voorstellen (die zijn nog geen beslissing).
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker')
    ? { and: [{ club: { equals: club } }, { status: { not_equals: 'voorstel' } }] }
    : false
}

export const Boetes: CollectionConfig = {
  slug: 'boetes',
  labels: { singular: 'Boete', plural: 'Boetes' },
  admin: { group: 'Federatie', defaultColumns: ['club', 'omschrijving', 'bedrag', 'status', 'createdAt'] },
  access: {
    read: lezen,
    create: () => false,
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', required: true, index: true },
    { name: 'soort', label: 'Soort', type: 'relationship', relationTo: 'boete-soorten' },
    { name: 'match', label: 'Wedstrijd', type: 'relationship', relationTo: 'matches', index: true },
    { name: 'omschrijving', label: 'Omschrijving', type: 'text', required: true },
    { name: 'bedrag', label: 'Bedrag (€)', type: 'number', required: true, min: 0, admin: { description: 'Vastgezet bij het voorstel: een latere wijziging van de boetelijst raakt deze boete niet.' } },
    { name: 'status', label: 'Status', type: 'select', defaultValue: 'voorstel', options: [...BOETE_STATUSSEN], index: true },
    { name: 'bron', label: 'Bron', type: 'select', defaultValue: 'manueel', options: [{ label: 'Automatisch voorstel', value: 'automatisch' }, { label: 'Manueel', value: 'manueel' }] },
    {
      name: 'sleutel',
      label: 'Sleutel',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Voorkomt dat hetzelfde automatische voorstel twee keer gemaakt wordt.' },
    },
    { name: 'opgelegdOp', label: 'Opgelegd op', type: 'date', admin: { readOnly: true } },
    { name: 'betalingGemeldOp', label: 'Betaling gemeld op', type: 'date', admin: { readOnly: true } },
    { name: 'betaaldOp', label: 'Betaald op', type: 'date', admin: { readOnly: true } },
    { name: 'clubOpmerking', label: 'Opmerking van de club (betwisting / betaling)', type: 'textarea' },
    { name: 'federatieOpmerking', label: 'Opmerking van de federatie', type: 'textarea' },
  ],
}
