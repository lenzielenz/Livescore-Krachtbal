import type { GlobalConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Het lopende seizoen bepaalt het peiljaar voor de leeftijdscategorie-berekening.
// Bron: LEEFTIJDSCATEGORIE-SPEC.md §2. De competitie loopt van september (jaar N) tot
// de bekerfinales (voorjaar N+1); de peildatum is 1 januari van jaar N+1.
// DECISION: één globaal seizoen-record (geen per-jaar-collectie) — de administratie zet
// het lopende seizoen; alle categorieën schuiven automatisch mee. Oude wedstrijdbladen
// bewaren hun toen-geldige categorie apart (zie MatchSheets, fase 4).
export const Season: GlobalConfig = {
  slug: 'season',
  label: 'Seizoen',
  admin: {
    group: 'Federatie',
  },
  access: {
    read: () => true,
    update: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      name: 'startYear',
      label: 'Startjaar seizoen (september van jaar N)',
      type: 'number',
      required: true,
      min: 2000,
      max: 2100,
      admin: {
        step: 1,
        description:
          'Het jaar waarin september valt. Peiljaar P = startjaar + 1. Bv. seizoen 2025–2026 → startjaar 2025, peiljaar 2026.',
      },
    },
  ],
}
