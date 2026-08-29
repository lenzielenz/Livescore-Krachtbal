import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { tornooiPronostiekStand } from '@/lib/tornooi-pronostiek'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Pronostiekrangschikking van een hele tornooidag ("Beker van Brugge"): alle categorieën samen,
// gescoord met hetzelfde puntensysteem als de competitie. Publiek — iedereen mag de stand zien.
export default async function GroepPronostiekPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const payload = await getPayloadClient()
  const bestaat = await payload
    .find({ collection: 'tournaments', where: { groep: { equals: naam } }, limit: 1, depth: 0 })
    .catch(() => ({ docs: [] as unknown[] }))
  if (bestaat.docs.length === 0) notFound()

  const stand = await tornooiPronostiekStand(payload, naam).catch(() => [])
  const totaalTips = stand.reduce((a, r) => a + r.predictions, 0)

  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
        <div className="trn-hub-head">
          <h1 className="trn-hub-title">🔮 Pronostiekstand</h1>
          <p className="trn-hub-intro">
            {naam} — alle categorieën samen.{' '}
            {stand.length > 0
              ? `${stand.length} deelnemer${stand.length === 1 ? '' : 's'} · ${totaalTips} tip${totaalTips === 1 ? '' : 's'} gescoord.`
              : 'Zodra de eerste voorspelde wedstrijd afgelopen is, verschijnt hier de stand.'}
          </p>
        </div>

        <div className="trn-balk">
          <div className="trn-balk-rij">
            <Link href={`/tornooi/groep/${encodeURIComponent(naam)}`} className="trn-btn">
              ← Terug naar de tornooidag
            </Link>
            <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/programma`} className="trn-btn">
              📋 Dagprogramma
            </Link>
          </div>
        </div>

        <main className="trn-hub">
          <section className="trn-hub-sec">
            {stand.length === 0 ? (
              <p className="trn-empty">
                Nog geen gescoorde tips. Meespelen doe je bij een categorie: open het schema en geef
                je uitslag door vóór de aftrap.
              </p>
            ) : (
              <>
                <ol className="tp-stand">
                  {stand.map((r, i) => (
                    <li key={r.userId} className={i === 0 ? 'leider' : ''}>
                      <span className="tp-plaats">{i + 1}</span>
                      <span className="tp-naam">{r.name}</span>
                      <span className="tp-detail">
                        {r.predictions} tip{r.predictions === 1 ? '' : 's'}
                        {r.exact > 0 ? ` · ${r.exact}× exact` : ''}
                        {r.closest > 0 ? ` · ${r.closest}× dichtst` : ''}
                      </span>
                      <span className="tp-punten">{r.points}</span>
                    </li>
                  ))}
                </ol>
                <p className="trn-hint">
                  Exact = 10 punten · juiste winnaar én saldo = 6 · juiste winnaar = 3 · nabijheid tot 3 ·
                  dichtst bij = 2 bonus.
                </p>
              </>
            )}
          </section>
        </main>
      </div>
    </>
  )
}
