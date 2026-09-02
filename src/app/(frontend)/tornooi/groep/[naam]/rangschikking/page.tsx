import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { getPayloadClient } from '@/lib/payload-client'
import { loadGroepData } from '@/lib/tornooi-groep'
import { standenVanDag } from '@/lib/tornooi-rangschikking'
import '../../../tornooi.css'

export const dynamic = 'force-dynamic'

// Alle rangschikkingen van een tornooidag onder elkaar — één pagina voor de hele dag.
//
// Op een tornooidag lopen er meerdere categorieën door elkaar. Wie de stand van "zijn" reeks wou
// zien, moest die eerst opzoeken en aanklikken, en voor de volgende weer terug. Publiek: dit is
// precies wat supporters zoeken.
export default async function GroepRangschikkingPage({ params }: { params: Promise<{ naam: string }> }) {
  const { naam: ruw } = await params
  const naam = decodeURIComponent(ruw).trim()
  if (!naam) notFound()

  const payload = await getPayloadClient()
  const data = await loadGroepData(payload, naam)
  if (!data) notFound()

  const standen = standenVanDag(
    data.reeksen.map((r) => ({ id: r.id, naam: r.naam, format: r.format, champion: r.champion })),
    data.matches.map((m) => ({
      tournamentId: m.tournamentId,
      home: m.home,
      away: m.away,
      status: m.status,
      winner: m.winner,
      score: m.score,
    })),
  )

  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
        <div className="trn-hub-head">
          <Link href={`/tornooi/groep/${encodeURIComponent(naam)}`} className="trn-basis">
            ← <span className="trn-basis-naam">{naam}</span>
          </Link>
          <h1 className="trn-hub-title">📊 Rangschikking · {naam}</h1>
          <p className="trn-hub-intro">
            De stand van elke categorie van deze tornooidag, live bijgewerkt terwijl er gespeeld wordt.
          </p>
        </div>

        <div className="trn-actions">
          <Link href={`/tornooi/groep/${encodeURIComponent(naam)}/programma`} className="trn-btn">
            📋 Dagprogramma
          </Link>
        </div>

        {standen.length === 0 ? (
          <p className="trn-empty">Nog geen categorieën op deze tornooidag.</p>
        ) : (
          standen.map((r) => (
            <section key={r.id} className="trn-rr-stand tg-stand">
              <h2 className="trn-col-title">
                <Link href={`/tornooi/${r.id}`} className="tg-stand-link">{r.naam}</Link>
                {r.champion && <span className="tg-stand-kamp">🏆 {r.champion}</span>}
              </h2>

              {r.beker ? (
                // Een bekerschema heeft geen tabel: daar telt enkel wie doorstoot.
                <p className="trn-hint">
                  Bekerschema — geen rangschikking. {r.champion ? `Gewonnen door ${r.champion}.` : 'Bekijk het schema bij de categorie.'}
                </p>
              ) : r.stand.length === 0 ? (
                <p className="trn-hint">Nog geen ploegen bekend.</p>
              ) : (
                <>
                  <table className="trn-table">
                    <thead>
                      <tr><th>#</th><th className="l">Ploeg</th><th>G</th><th>W</th><th>GL</th><th>V</th><th>Saldo</th><th>Ptn</th></tr>
                    </thead>
                    <tbody>
                      {r.stand.map((s, i) => (
                        <tr key={s.team} className={i === 0 && r.champion === s.team ? 'leader' : ''}>
                          <td>{i + 1}</td>
                          <td className="l">
                            <span className="trn-rr-team">
                              {data.logos[s.team] && (
                                <TeamLogo name={s.team} logoUrl={data.logos[s.team]} logoFit={data.fits[s.team] ?? null} size="xs" ringColor={data.kleuren[s.team]} />
                              )}
                              {s.team}
                            </span>
                          </td>
                          <td>{s.played}</td>
                          <td>{s.won}</td>
                          <td>{s.drawn}</td>
                          <td>{s.lost}</td>
                          <td>{s.gf}–{s.ga}</td>
                          <td className="pts">{s.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!r.gespeeld && <p className="trn-hint">Nog niets gespeeld — iedereen staat op nul.</p>}
                </>
              )}
            </section>
          ))
        )}

        <p className="trn-rr-legend">Winst 4 · gelijkspel 3 · verlies 2 punten</p>
      </div>
    </>
  )
}
