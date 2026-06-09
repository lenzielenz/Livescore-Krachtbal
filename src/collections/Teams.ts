import type { CollectionConfig } from 'payload'

import { CATEGORY_OPTIONS } from '../lib/categories'
import { REEKS_OPTIONS, reeksNaam } from '../lib/reeksen'
import { isFederationLevel } from '../lib/access'

export const Teams: CollectionConfig = {
  slug: 'teams',
  labels: {
    singular: 'Ploeg',
    plural: 'Ploegen',
  },
  admin: {
    // Toon naam + reeks als titel (ook in keuzelijsten), zodat gelijknamige ploegen van dezelfde
    // club uit elkaar te houden zijn (bv. "KBC St. Michiels — 1ste Nationale Heren").
    useAsTitle: 'displayTitle',
    defaultColumns: ['name', 'reeks', 'club', 'category'],
    group: 'Beheer',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    // Verwijder de spelers van deze ploeg eerst (anders blokkeert de NOT NULL-FK op players.team).
    beforeDelete: [
      async ({ req, id }) => {
        await req.payload.delete({ collection: 'players', where: { team: { equals: id } }, overrideAccess: true })
      },
    ],
  },
  fields: [
    {
      // Weergavetitel "naam — reeks". Een echte (niet-virtuele) kolom omdat Payload een virtueel
      // veld niet als useAsTitle toelaat; de waarde wordt altijd vers berekend bij het lezen, zodat
      // gelijknamige ploegen overal (ook in keuzelijsten) onderscheiden worden op reeks.
      name: 'displayTitle',
      type: 'text',
      admin: { hidden: true, readOnly: true },
      hooks: {
        afterRead: [
          ({ data }) => {
            const name = (data as { name?: unknown })?.name
            const reeks = (data as { reeks?: unknown })?.reeks
            const nm = typeof name === 'string' && name.trim() ? name : 'Ploeg'
            const r = typeof reeks === 'string' && reeks ? reeksNaam(reeks as Parameters<typeof reeksNaam>[0]) : ''
            return r ? `${nm} — ${r}` : nm
          },
        ],
      },
    },
    {
      name: 'club',
      label: 'Club',
      type: 'relationship',
      relationTo: 'clubs',
      required: true,
    },
    {
      name: 'category',
      label: 'Categorie',
      type: 'select',
      options: CATEGORY_OPTIONS,
      required: true,
    },
    {
      name: 'reeks',
      label: 'Reeks / niveau',
      type: 'select',
      options: [...REEKS_OPTIONS],
      admin: {
        description: 'Competitiereeks (KVKBF) waarin deze ploeg speelt.',
      },
    },
    {
      name: 'thuisUur',
      label: 'Vast thuisuur (HH:MM)',
      type: 'text',
      admin: {
        description: 'Vast aanvangsuur wanneer deze ploeg thuis speelt in deze reeks (bv. 11:30).',
        placeholder: '11:30',
      },
    },
    {
      name: 'name',
      label: 'Ploegnaam',
      type: 'text',
      required: true,
      admin: {
        description: 'Bv. "KV Roeselare U14". Het logo komt van de club.',
      },
    },
    {
      // Tactisch profiel "hoe spelen wij als ploeg": door de coach ingegeven via het
      // ploegrapport (/analyse/ploeg). Wordt naast de gemeten worpdata gelegd om gerichte
      // strategie-aanbevelingen te maken. Eén JSON-veld (shape: src/lib/speelstijl.ts).
      name: 'speelstijl',
      label: 'Speelstijl (tactisch profiel)',
      type: 'json',
      admin: {
        description: 'Ingegeven via het ploegrapport. Voedt de strategie-aanbevelingen.',
      },
    },
    {
      // Onthouden "vaste opstelling": de favoriete spelers van deze ploeg (komma-gescheiden
      // speler-ids). Wordt bij een volgende wedstrijd automatisch voorgesteld; de coach kan
      // nog steeds aanpassen. Beheerd via de opstelling-pagina.
      name: 'vasteOpstellingIds',
      label: 'Vaste opstelling (favoriete spelers)',
      type: 'text',
      admin: { hidden: true, description: 'Komma-gescheiden speler-ids. Beheerd via /opstelling.' },
    },
    {
      // Verouderd: het logo hoort nu bij de Club. Verborgen gehouden (niet verwijderd) zodat
      // bestaande databases geen kolom-migratie/rename-prompt nodig hebben.
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { hidden: true },
    },
  ],
}
