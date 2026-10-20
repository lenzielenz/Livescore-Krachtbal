import type { Payload } from 'payload'

import { OngevalDossierKaart } from '@/components/OngevalDossierKaart'
import { dossiers } from '@/lib/ongeval-dossier'
import '../wedstrijdblad.css'

// "Mijn blessures" op /profiel: de ongevalsdossiers van de speler zelf en (voor een ouder) van zijn
// kinderen. Hier haalt hij de documenten op, laadt ze ingevuld terug op en dient in (lib/ongeval-dossier.ts).
export async function MijnOngevallen({ payload, playerIds }: { payload: Payload; playerIds: number[] }) {
  if (!playerIds.length) return null
  const lijst = await dossiers(payload, { player: { in: playerIds } }, 20)
  if (!lijst.length) return null
  const open = lijst.filter((d) => d.status === 'gemeld').length
  return (
    <section className="wb-card" id="ongevallen" style={{ marginBottom: 16 }}>
      <h2>🚑 Blessures &amp; ongevalsaangifte</h2>
      <p className="wb-sub">
        {open
          ? `Voor ${open === 1 ? 'één blessure' : `${open} blessures`} moeten de documenten nog naar de federatie.`
          : 'Alle documenten zijn bezorgd.'}
      </p>
      <div className="od-lijst">
        {lijst.map((d) => (
          <OngevalDossierKaart key={d.id} d={d} rol="speler" />
        ))}
      </div>
    </section>
  )
}
