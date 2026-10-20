import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { federatieStatistieken, type Telling } from '@/lib/federatie-statistieken'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../../beheer/FederatieAlleen'
import { ClubTabel } from './ClubTabel'
import '../../beheer/federatie-tools.css'
import './statistieken.css'

export const dynamic = 'force-dynamic'

const pct = (deel: number, geheel: number) => (geheel ? `${Math.round((deel / geheel) * 100)}%` : '—')

function Tegel({ waarde, label, sub }: { waarde: number | string; label: string; sub?: string }) {
  return (
    <div className="st-tegel">
      <span className="st-waarde">{waarde}</span>
      <span className="st-label">{label}</span>
      {sub && <span className="st-sub">{sub}</span>}
    </div>
  )
}

/** Horizontale staafjes in één kleur; het getal staat er altijd naast (nooit kleur alleen). */
function Staven({ titel, lijst, eenheid = '' }: { titel: string; lijst: Telling[]; eenheid?: string }) {
  const max = Math.max(1, ...lijst.map((t) => t.aantal))
  return (
    <section className="st-kaart">
      <h2>{titel}</h2>
      {lijst.length === 0 ? (
        <p className="st-sub">Nog geen gegevens.</p>
      ) : (
        <ul className="st-staven">
          {lijst.map((t) => (
            <li key={t.label} title={`${t.label}: ${t.aantal}${eenheid}`}>
              <span className="st-staaf-label">{t.label}</span>
              <span className="st-staaf-baan">
                <span className="st-staaf" style={{ width: `${(t.aantal / max) * 100}%` }} />
              </span>
              <span className="st-staaf-waarde">{t.aantal}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Inzicht in de hele organisatie: leden (jeugd, meisjes, jongens), ploegen, wedstrijden en forfaits,
// scheidsrechters, blessures, en per club. Alles afgeleid (lib/federatie-statistieken.ts).
export default async function StatistiekenPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Statistieken" />
  const s = await federatieStatistieken(await getPayloadClient())
  const l = s.leden

  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">📊 Statistieken</h1>
        <p className="acc-page-intro">Seizoen {s.seizoen}. Alles komt rechtstreeks uit de leden, ploegen, wedstrijden en wedstrijdbladen.</p>

        <h2 className="st-kop">Leden</h2>
        <div className="st-tegels">
          <Tegel waarde={l.totaal} label="leden" sub={`${l.spelers} spelers · ${l.gewoneLeden} gewone leden`} />
          <Tegel waarde={l.speelgerechtigd} label="mogen spelen" sub={pct(l.speelgerechtigd, l.spelers) + ' van de spelers'} />
          <Tegel waarde={l.jeugd} label="jeugd" sub={`${pct(l.jeugd, l.totaal)} · ${l.senioren} senioren`} />
          <Tegel waarde={l.meisjes} label="meisjes / dames" sub={pct(l.meisjes, l.totaal)} />
          <Tegel waarde={l.jongens} label="jongens / heren" sub={pct(l.jongens, l.totaal)} />
          <Tegel waarde={l.metLogin} label="met eigen login" sub={pct(l.metLogin, l.totaal)} />
          <Tegel waarde={l.keuringVerlopen} label="keuring verlopen" sub={`${l.keuringVerlooptBinnen30} verlopen binnen 30 dagen`} />
          {(l.geslachtOnbekend > 0 || l.leeftijdOnbekend > 0) && (
            <Tegel waarde={l.geslachtOnbekend + l.leeftijdOnbekend} label="onvolledig" sub={`${l.geslachtOnbekend} zonder geslacht · ${l.leeftijdOnbekend} zonder geboortedatum`} />
          )}
        </div>
        <div className="st-rooster">
          <Staven titel="Leden per leeftijdscategorie" lijst={l.perCategorie} />
          <Staven titel="Registratie" lijst={l.registratie} />
        </div>

        <h2 className="st-kop">Competitie</h2>
        <div className="st-tegels">
          <Tegel waarde={s.ploegen.totaal} label="ploegen" />
          <Tegel waarde={s.wedstrijden.gespeeld} label="wedstrijden gespeeld" sub={`${s.wedstrijden.gepland} nog gepland`} />
          <Tegel waarde={s.wedstrijden.forfaits} label="forfaits" sub={`${pct(s.wedstrijden.forfaits, s.wedstrijden.gespeeld)} van de gespeelde · ${s.wedstrijden.dubbelForfait} dubbel`} />
          <Tegel waarde={s.wedstrijden.zonderScheidsrechter} label="gepland zonder scheidsrechter" />
        </div>
        <div className="st-rooster">
          <Staven titel="Ploegen per reeks" lijst={s.ploegen.perReeks} />
          <Staven
            titel="Forfaits per club"
            lijst={s.clubs.filter((c) => c.forfaits > 0).map((c) => ({ label: c.naam, aantal: c.forfaits })).sort((a, b) => b.aantal - a.aantal)}
          />
        </div>

        <h2 className="st-kop">Scheidsrechters</h2>
        <div className="st-tegels">
          <Tegel waarde={s.scheidsrechters.totaal} label="scheidsrechters" />
          {s.scheidsrechters.perType
            .filter((t) => t.label !== 'scheidsrechter')
            .map((t) => (
              <Tegel key={t.label} waarde={t.aantal} label={t.label + 's'} />
            ))}
        </div>
        <div className="st-rooster">
          <Staven titel="Toegewezen wedstrijden per scheidsrechter (dit seizoen)" lijst={s.scheidsrechters.inzet} />
        </div>

        <h2 className="st-kop">Blessures &amp; ongevallen</h2>
        <div className="st-tegels">
          <Tegel waarde={s.ongevallen.totaal} label="blessures doorgegeven" sub={`${s.ongevallen.jeugd} jeugd · ${s.ongevallen.senioren} senioren`} />
          {s.ongevallen.perStatus.map((t) => (
            <Tegel key={t.label} waarde={t.aantal} label={t.label.toLowerCase()} />
          ))}
          <Tegel waarde={pct(s.ongevallen.totaal, s.wedstrijden.gespeeld)} label="per gespeelde wedstrijd" />
        </div>
        <div className="st-rooster">
          <Staven titel="Blessures per maand" lijst={s.ongevallen.perMaand} />
          <Staven titel="Blessures per categorie" lijst={s.ongevallen.perCategorie} />
          <Staven
            titel="Blessures per club"
            lijst={s.clubs.filter((c) => c.ongevallen > 0).map((c) => ({ label: c.naam, aantal: c.ongevallen })).sort((a, b) => b.aantal - a.aantal)}
          />
        </div>

        <h2 className="st-kop">Per club</h2>
        <ClubTabel clubs={s.clubs} />
      </div>
    </>
  )
}
