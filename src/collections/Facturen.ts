import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

// Facturen van de federatie aan de clubs (lib/facturatie.ts, lib/facturatie-server.ts). Een concept bewerkt de
// federatie nog; bij het versturen krijgt de factuur een doorlopend nummer en een gestructureerde mededeling,
// en daarna verandert ze niet meer (rechtzetten = annuleren en een nieuwe maken). Of ze betaald is, staat hier
// NIET: dat volgt uit de betalingen (collection "betalingen"). Alles schrijft server-side.

const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user)) return true
  const club = userClubId(req.user)
  // De club ziet haar verstuurde (en geannuleerde) facturen, nooit een concept.
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker')
    ? { and: [{ club: { equals: club } }, { status: { not_equals: 'concept' } }] }
    : false
}

export const Facturen: CollectionConfig = {
  slug: 'facturen',
  labels: { singular: 'Factuur', plural: 'Facturen' },
  admin: { group: 'Federatie', useAsTitle: 'nummer', defaultColumns: ['nummer', 'club', 'totaal', 'status', 'datum'] },
  access: {
    read: lezen,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', required: true, index: true },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'concept',
      index: true,
      options: [
        { label: 'Concept', value: 'concept' },
        { label: 'Verstuurd', value: 'verstuurd' },
        { label: 'Geannuleerd', value: 'geannuleerd' },
      ],
    },
    { name: 'nummer', label: 'Nummer', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'Doorlopend, bij het versturen.' } },
    { name: 'jaar', label: 'Jaar', type: 'number', admin: { readOnly: true } },
    { name: 'volgnr', label: 'Volgnummer', type: 'number', admin: { readOnly: true } },
    { name: 'ogm', label: 'Gestructureerde mededeling', type: 'text', unique: true, index: true, admin: { readOnly: true } },
    { name: 'seizoen', label: 'Seizoen', type: 'text' },
    { name: 'datum', label: 'Factuurdatum', type: 'date', admin: { readOnly: true } },
    { name: 'vervaldatum', label: 'Vervaldatum', type: 'date', admin: { readOnly: true } },
    {
      // De lijnen als momentopname: [{ soort, omschrijving, aantal, eenheidsprijs, sleutels[] }]. Een verstuurde
      // factuur verandert niet; `sleutels` zeggen wat gefactureerd werd (nooit twee keer).
      name: 'lijnen',
      label: 'Lijnen',
      type: 'json',
      admin: { readOnly: true },
    },
    { name: 'totaal', label: 'Totaal (€)', type: 'number', admin: { readOnly: true } },
    { name: 'opmerking', label: 'Opmerking op de factuur', type: 'textarea' },
    { name: 'gemaaktDoor', label: 'Gemaakt door', type: 'relationship', relationTo: 'users' },
    { name: 'verstuurdOp', label: 'Verstuurd op', type: 'date', admin: { readOnly: true } },
    { name: 'geannuleerdOp', label: 'Geannuleerd op', type: 'date', admin: { readOnly: true } },
    { name: 'annuleerReden', label: 'Reden van annulering', type: 'text' },
  ],
}
