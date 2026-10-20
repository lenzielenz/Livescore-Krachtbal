import { cookies } from 'next/headers'

import { SiteHeader } from '@/components/SiteHeader'
import { DemoStapKnop } from '@/components/DemoRolWissel'
import { getAuthUser } from '@/lib/auth-user'
import { draaiboek } from '@/lib/demoruimte/draaiboek'
import { demoWedstrijden } from '@/lib/demoruimte/klaarzetten'
import { DEMO_ROLLEN } from '@/lib/demoruimte/rollen'
import { codeNodig, demoToegang, TOEGANG_COOKIE } from '@/lib/demoruimte/toegang'
import { isDemoOmgeving } from '@/lib/omgeving'
import { getPayloadClient } from '@/lib/payload-client'
import { CodeInvoer, Klaarzetten, ReferendumReset, RolKiezer } from './DemoBediening'
import './demoruimte.css'

export const dynamic = 'force-dynamic'

// De demoruimte (docs/DEMORUIMTE.md): het draaiboek om alles voor te stellen. Bovenaan de knop
// die de demowereld klaarzet, dan de rollen (één tik = inloggen als), dan de hoofdstukken van de
// presentatie, elk met de schermen in de juiste volgorde.
export default async function DemoruimtePage() {
  if (!isDemoOmgeving()) {
    const url = (process.env.DEMO_URL ?? '').trim()
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title">🎬 Demoruimte</h1>
          <p className="empty">
            De demoruimte draait in een aparte omgeving met een eigen demodatabank, zodat een presentatie nooit iets aan de echte gegevens raakt.
            {url ? (
              <>
                {' '}
                <a href={`${url.replace(/\/$/, '')}/demoruimte`}>Naar de demoruimte →</a>
              </>
            ) : (
              ' Ze is hier nog niet ingesteld (zie docs/DEMORUIMTE.md).'
            )}
          </p>
        </div>
      </>
    )
  }
  const jar = await cookies()
  if (!demoToegang(jar.get(TOEGANG_COOKIE)?.value)) {
    return (
      <>
        <SiteHeader />
        <div className="site">
          <h1 className="page-title">🎬 Demoruimte</h1>
          <CodeInvoer />
        </div>
      </>
    )
  }
  const payload = await getPayloadClient()
  const ids = await demoWedstrijden(payload).catch(() => ({ hoofd: null, dames: null, live: null, afgelopen: null, afgelast: null }))
  const klaar = ids.hoofd != null
  const me = await getAuthUser().catch(() => null)
  const huidig = DEMO_ROLLEN.find((r) => String((me as { email?: unknown } | null)?.email ?? '') === `demo-${r.sleutel}@demo.krachtbal.be`)?.sleutel ?? null
  const icoon = (rol: string) => DEMO_ROLLEN.find((r) => r.sleutel === rol)?.icoon ?? '👤'
  const label = (rol: string) => DEMO_ROLLEN.find((r) => r.sleutel === rol)?.label ?? 'Niet ingelogd'
  return (
    <>
      <SiteHeader />
      <div className="site site-breed dr">
        <header className="dr-kop">
          <div>
            <h1 className="page-title">🎬 Demoruimte</h1>
            <p className="acc-page-intro">
              Alles wat het platform kan, in één verhaal. Klik een stap: je wisselt meteen van rol en het juiste scherm opent. Bovenaan elke pagina wissel je ook van rol of keer je terug naar dit
              draaiboek.
            </p>
          </div>
          <Klaarzetten klaar={klaar} />
        </header>

        {!klaar && <p className="dr-melding">Er staat nog geen demo klaar (of ze is van een andere dag). Zet ze eerst klaar — liefst vlak voor de presentatie, dan staan de wedstrijden van vandaag juist.</p>}

        <section className="dr-blok">
          <h2>Wie ben je?</h2>
          <RolKiezer huidig={huidig} rollen={DEMO_ROLLEN.map((r) => ({ sleutel: r.sleutel, label: r.label, naam: r.naam, icoon: r.icoon, start: r.start }))} />
        </section>

        <ol className="dr-hoofdstukken">
          {draaiboek(ids).map((h, i) => (
            <li key={h.sleutel} className="dr-hoofdstuk">
              <div className="dr-h-kop">
                <span className="dr-nr">{i + 1}</span>
                <h2>
                  {h.icoon} {h.titel}
                </h2>
              </div>
              <p className="dr-verhaal">{h.verhaal}</p>
              <div className="dr-stappen">
                {h.stappen.map((s) => (
                  <DemoStapKnop key={s.tekst} rol={s.rol} href={klaar ? s.href : null} icoon={icoon(s.rol)} tekst={`${s.tekst} · als ${label(s.rol)}`} />
                ))}
              </div>
              {h.sleutel === 'referendum' && klaar && <ReferendumReset />}
            </li>
          ))}
        </ol>
        {codeNodig() ? null : <p className="dr-voet">Tip: zet DEMO_TOEGANGSCODE op de demo-omgeving, dan vraagt deze pagina eerst een code.</p>}
      </div>
    </>
  )
}
