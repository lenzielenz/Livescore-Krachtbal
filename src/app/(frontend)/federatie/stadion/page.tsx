import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { rem } from '@/lib/virtueel-analyse'
import { laadOverzicht } from '@/lib/virtueel-meting-overzicht'
import './stadion.css'

export const dynamic = 'force-dynamic'

// Hoe vlot loopt het virtuele stadion bij de bezoekers? De meter in elke browser (virtueel/[slug]/
// meter.ts) verzamelt onzichtbaar; hier staat de analyse erop (lib/virtueel-analyse.ts), telkens
// opnieuw berekend op de metingen van de gekozen periode: eerst de knelpunten met advies, dan de
// cijfers per plek, per versie, per dag en per grafische kaart. Enkel voor de federatie.

const PERIODES = [1, 7, 14, 30]
const ERNST = { hoog: 'Dringend', middel: 'Aandacht', info: 'Info' } as const

const fpsKlasse = (fps: number) => (fps >= 55 ? 'goed' : fps >= 45 ? 'matig' : 'slecht')

export default async function StadionPrestatiesPage({ searchParams }: { searchParams: Promise<{ dagen?: string }> }) {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) {
    return (
      <>
        <SiteHeader active="federatie" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Vlotheid stadion</span></h1>
          <p className="empty">
            Enkel de federatie/admin heeft toegang tot dit luik.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { dagen: dagenParam } = await searchParams
  const payload = await getPayloadClient()
  const { dagen, samenvatting: s, analyse } = await laadOverzicht(payload, Number(dagenParam) || 14)

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site vs-prestaties">
        <h1 className="page-title"><span className="brand">Vlotheid stadion</span></h1>
        <p className="profile-lead">
          Elke bezoeker van het virtuele stadion meet onzichtbaar hoe vlot het loopt. Hieronder de analyse van de laatste {dagen} {dagen === 1 ? 'dag' : 'dagen'}, telkens vers berekend.
        </p>

        <nav className="vs-periode" aria-label="Periode">
          {PERIODES.map((d) => (
            <Link key={d} href={`/federatie/stadion?dagen=${d}`} className={d === dagen ? 'actief' : undefined}>
              {d === 1 ? 'Vandaag' : `${d} dagen`}
            </Link>
          ))}
          <a href={`/api/virtueel/meting?dagen=${dagen}&ruw=1`}>Ruwe data (JSON)</a>
        </nav>

        <div className="vs-kerncijfers">
          <div><b className={fpsKlasse(s.fps)}>{s.fps || '—'}</b><span>beelden/s</span></div>
          <div><b>{s.schokkenPerMinuut}</b><span>schokken/min</span></div>
          <div><b>{s.sessies}</b><span>bezoeken</span></div>
          <div><b>{s.minuten}</b><span>minuten gemeten</span></div>
          <div><b>{s.laden.eersteBeeldMediaan ? `${Math.round(s.laden.eersteBeeldMediaan / 100) / 10} s` : '—'}</b><span>tot eerste beeld</span></div>
        </div>

        <h2>Knelpunten en advies</h2>
        {analyse.length === 0 ? (
          <p className="empty">Nog geen metingen in deze periode.</p>
        ) : (
          <ul className="vs-knelpunten">
            {analyse.map((k, i) => (
              <li key={i} className={k.ernst}>
                <span className="vs-ernst">{ERNST[k.ernst]}</span>
                <h3>{k.titel}</h3>
                <p>{k.uitleg}</p>
                <p className="vs-advies">→ {k.advies}</p>
              </li>
            ))}
          </ul>
        )}

        {s.plekken.length > 0 && (
          <>
            <h2>Per plek <small>(de traagste eerst)</small></h2>
            <div className="vs-tabel">
              <table>
                <thead>
                  <tr><th>Plek</th><th>b/s</th><th>p95</th><th>schokken/min</th><th>haperingen/min</th><th>opdrachten</th><th>driehoeken</th><th>processor</th><th>rem</th><th>min</th></tr>
                </thead>
                <tbody>
                  {s.plekken.map((p) => (
                    <tr key={p.plek}>
                      <td>{p.plek}</td>
                      <td className={fpsKlasse(p.fps)}>{p.fps}</td>
                      <td>{p.p95} ms</td>
                      <td>{p.schokkenPerMinuut}</td>
                      <td>{p.haperingenPerMinuut}</td>
                      <td>{p.calls}</td>
                      <td>{Math.round(p.tris / 1000)}k</td>
                      <td>{p.cpu ? `${p.cpu} ms` : '—'}</td>
                      <td>{rem(p) === 'onbekend' ? '—' : rem(p)}</td>
                      <td>{p.minuten}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {s.versies.length > 0 && (
          <>
            <h2>Per versie van de site</h2>
            <div className="vs-tabel">
              <table>
                <thead><tr><th>Versie</th><th>van</th><th>tot</th><th>b/s</th><th>schokken/min</th><th>bezoeken</th><th>min</th></tr></thead>
                <tbody>
                  {s.versies.map((v) => (
                    <tr key={v.versie}>
                      <td><code>{v.versie}</code></td><td>{v.van}</td><td>{v.tot}</td>
                      <td className={fpsKlasse(v.fps)}>{v.fps}</td><td>{v.schokkenPerMinuut}</td><td>{v.sessies}</td><td>{v.minuten}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {s.dagen.length > 1 && (
          <>
            <h2>Per dag</h2>
            <div className="vs-tabel">
              <table>
                <thead><tr><th>Dag</th><th>b/s</th><th>schokken/min</th><th>bezoeken</th><th>min</th></tr></thead>
                <tbody>
                  {s.dagen.map((d) => (
                    <tr key={d.dag}>
                      <td>{d.dag}</td><td className={fpsKlasse(d.fps)}>{d.fps}</td><td>{d.schokkenPerMinuut}</td><td>{d.sessies}</td><td>{d.minuten}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {s.toestellen.length > 0 && (
          <>
            <h2>Per grafische kaart <small>(de traagste eerst)</small></h2>
            <div className="vs-tabel">
              <table>
                <thead><tr><th>Grafische kaart</th><th>b/s</th><th>schokken/min</th><th>bezoeken</th><th>zwak toestel</th><th>min</th></tr></thead>
                <tbody>
                  {s.toestellen.slice(0, 30).map((t) => (
                    <tr key={t.gpu}>
                      <td>{t.gpu}</td><td className={fpsKlasse(t.fps)}>{t.fps}</td><td>{t.schokkenPerMinuut}</td><td>{t.sessies}</td><td>{t.licht}</td><td>{t.minuten}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  )
}
