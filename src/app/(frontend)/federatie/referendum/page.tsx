import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { PRIJZEN, type Competitie } from '@/lib/referendum'
import { rondeVan, uitslagVan, type Uitslag } from '@/lib/referendum-server'
import { seasonFromDate } from '@/lib/seasons'
import { FederatieAlleen } from '../../beheer/FederatieAlleen'
import { RondeBeheer } from './RondeBeheer'
import '../../referendum/referendum.css'

export const dynamic = 'force-dynamic'

// Referendum beheren: ronde aanmaken, openen, sluiten; tussenstand en uitslag; bekendmaken zet de
// winnaars in de Erelijst. Stemmen zelf blijven geheim: hier staat enkel de optelling.
export default async function ReferendumBeheerPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Referendum" />

  const payload = await getPayloadClient()
  const rondes = await payload.find({ collection: 'referendum-rondes', sort: '-seizoen', depth: 0, limit: 20, overrideAccess: true })
  const huidig = rondes.docs[0] ? rondeVan(rondes.docs[0] as unknown as Record<string, unknown>) : null
  const uitslag: Uitslag | null = huidig && huidig.status !== 'voorbereiding' ? await uitslagVan(payload, huidig) : null

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title">🏅 Referendum</h1>
        <p className="acc-page-intro">
          Spelers uit {huidig?.reeksHeren ?? '1NAH'} en {huidig?.reeksDames ?? '1NAD'} met minstens {huidig?.minWedstrijden ?? 5} gespeelde
          wedstrijden stemmen op <Link href="/referendum">/referendum</Link>: 5 tot 1 punt aan vijf spelers van hun competitie, niet
          van de eigen club. De belofte is de beste jonger dan {huidig?.maxLeeftijdBelofte ?? 21} jaar.
        </p>
        <RondeBeheer
          ronde={huidig ? { id: huidig.id, seizoen: huidig.seizoen, status: huidig.status } : null}
          voorstelSeizoen={seasonFromDate(new Date())}
        />

        {uitslag && (
          <section style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: '1.05rem' }}>{huidig?.status === 'open' ? 'Tussenstand' : 'Uitslag'}</h2>
            <div className="rf-uitslag">
              {(['heren', 'dames'] as Competitie[]).flatMap((c) =>
                (['jaar', 'belofte'] as const).map((soort) => (
                  <div key={`${c}-${soort}`} className="rf-kaart">
                    <h3>{PRIJZEN[c][soort]}</h3>
                    <p className="rf-seizoen">
                      {uitslag[c].stemmers} van {uitslag[c].stemgerechtigd} stemgerechtigden stemden
                    </p>
                    {uitslag[c][soort].length === 0 ? (
                      <p className="rf-seizoen">Nog geen punten.</p>
                    ) : (
                      <table className="rf-tabel">
                        <tbody>
                          {uitslag[c][soort].slice(0, 10).map((r, i) => (
                            <tr key={r.id}>
                              <td>{i + 1}.</td>
                              <td>
                                {r.naam} <span className="rf-seizoen">· {r.clubNaam}</span>
                              </td>
                              <td className="rf-num" title={`5p ×${r.perPunt[5]}, 4p ×${r.perPunt[4]}`}>
                                {r.totaal}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )),
              )}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
