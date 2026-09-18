import type { Access, CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'
import { FUNCTIE_OPTIONS, functieDef } from '../lib/function-grants'

// Fijnmazige toekenning: geef één specifieke functie (veldscherm, kantinescherm, vergoedingen, ...)
// aan één specifieke gebruiker, zonder die gebruiker de volledige rol (club-medewerker,
// scheidsrechter, federatie) te geven. Zie lib/function-grants.ts voor de functie-lijst en hoe dit
// in de bestaande rolcontroles wordt meegenomen (hasFunctionGrant).
//
// Enkel federatie/admin beheert dit — vandaar geen "eigen club"-lees-toegang zoals bij
// FieldScreens: dit is een federatie-tool, geen clubtool. Beheren gebeurt op /beheer/rechten (een
// gewone frontend-pagina, zoals /beheer/leden en /beheer/planning — zie BackToSite.tsx voor de
// reden waarom dit geen custom Payload-adminview is).
const fedOnly: Access = ({ req }) => isFederationLevel(req.user)

export const FunctionGrants: CollectionConfig = {
  slug: 'function-grants',
  labels: { singular: 'Functietoekenning', plural: 'Functietoekenningen' },
  admin: {
    useAsTitle: 'functie',
    defaultColumns: ['user', 'functie', 'club', 'createdAt'],
    group: 'Beheer',
    description: 'Geef één functie (veldscherm, kantinescherm, ...) aan één gebruiker, los van zijn rol. Beheer via "Mijn club" → Rechten (federatie) op /beheer/rechten.',
  },
  access: {
    read: fedOnly,
    create: fedOnly,
    update: fedOnly,
    delete: fedOnly,
  },
  fields: [
    { name: 'user', label: 'Gebruiker', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'functie',
      label: 'Functie',
      type: 'select',
      required: true,
      options: FUNCTIE_OPTIONS,
      index: true,
    },
    {
      name: 'club',
      label: 'Club',
      type: 'relationship',
      relationTo: 'clubs',
      index: true,
      admin: { description: 'Verplicht voor clubgebonden functies (veldscherm, kantinescherm, ...) — leeg voor scheidsrechter-/federatiefuncties.' },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const def = functieDef(String(data.functie ?? ''))
        // Clubgebonden functie zonder club is een halve toekenning (voor welke club precies?);
        // een club-onafhankelijke functie (scheidsrechter/federatie) hoort er net geen te hebben,
        // anders lijkt de toekenning ten onrechte tot één club beperkt.
        if (def?.clubGebonden && !data.club) {
          throw new Error('Kies een club voor deze functie.')
        }
        if (def && !def.clubGebonden) {
          data.club = null
        }
        return data
      },
    ],
    beforeChange: [
      async ({ data, req, operation }) => {
        // Geen twee identieke toekenningen (zelfde gebruiker + functie + club) — stil ontdubbelen
        // i.p.v. een foutmelding, want de kans dat iemand per ongeluk tweemaal dezelfde combinatie
        // aanmaakt is de normale weg waarop dit zou gebeuren (dubbel klikken, twee tabbladen).
        if (operation !== 'create' || !data) return data
        const existing = await req.payload.find({
          collection: 'function-grants',
          where: {
            and: [
              { user: { equals: data.user } },
              { functie: { equals: data.functie } },
              data.club ? { club: { equals: data.club } } : { club: { exists: false } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (existing.totalDocs > 0) {
          throw new Error('Deze functie staat al toegekend aan deze gebruiker (voor deze club).')
        }
        return data
      },
    ],
  },
}
