import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canTraining } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { TrainingHero } from './TrainingHero'
import './training.css'

export const dynamic = 'force-dynamic'

// Trainings-startpagina: het vertrekpunt van het trainingsluik, met de tools eronder.
const TOOLS = [
  {
    href: '/beheer/training/kalender',
    icon: '📅',
    title: 'Trainingskalender + jaarplan',
    desc: 'Je trainingen én wedstrijden in één kalender, met een jaarplan over het seizoen — zie in één oogopslag hoe druk elke maand is.',
  },
  {
    href: '/beheer/training/oefeningen',
    icon: '💪',
    title: 'Oefeningen & sjablonen',
    desc: 'Blader door de oefeningenbibliotheek (systeem + club-eigen drills) en gebruik kant-en-klare sessiesjablonen als startpunt voor elke training.',
  },
  {
    href: '/beheer/training/plan',
    icon: '🧠',
    title: 'Trainingsplan op maat',
    desc: 'Laat de data een gepersonaliseerd, periodiek plan opstellen — per ploeg of per speler, met focuspunten, doelen en concrete oefeningen.',
  },
  {
    href: '/beheer/training/spelers',
    icon: '👤',
    title: 'Spelerdossier',
    desc: 'Open het trainingsdossier van een speler: meetwaarden, doelen, aanwezigheidsgeschiedenis en evolutie in één overzicht.',
  },
  {
    href: '/beheer/training/progressie',
    icon: '📈',
    title: 'Progressie',
    desc: 'Meet sprintsnelheid over 18 m (vooruit/achteruit) en werpafstand per aanloop (4/9/18 m), en volg de evolutie per speler met grafieken.',
  },
  {
    href: '/beheer/training/aanwezigheid',
    icon: '✅',
    title: 'Aanwezigheid',
    desc: 'Hou per training bij wie er was (en hoeveel), hoe lang jullie trainden en hoe het weer was.',
  },
  {
    href: '/beheer/training/trends',
    icon: '📊',
    title: 'Belasting & opkomsttrends',
    desc: 'Wie traint regelmatig, wie dreigt af te haken? Zie de opkomstfrequentie en trainingsbelasting per speler in één tabel, met maandelijks verloop.',
  },
  {
    href: '/beheer/training/voeding',
    icon: '🥗',
    title: 'Voedingsplan op maat',
    desc: 'Vul je gegevens en doel in en krijg een sportgericht eetplan: calorieën, eiwit/koolhydraten/vet, hydratatie, trainings- vs rustdag en een voorbeelddag.',
  },
] as const

export default async function TrainingHubPage() {
  const me = await getAuthUser()
  const canView = canTraining(me)

  if (!canView) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">
            Training <span className="brand">·</span> overzicht
          </h1>
          <p className="empty">
            Enkel voor admin/federatie of club-beheerders.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <TrainingHero active="start" />
        <p className="wb-intro">
          Het vertrekpunt voor je trainingen. Kies hieronder wat je wil doen.
        </p>
        <div className="tr-hub">
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="tr-hub-card">
              <span className="tr-hub-ico" aria-hidden>{t.icon}</span>
              <span className="tr-hub-body">
                <span className="tr-hub-title">{t.title}</span>
                <span className="tr-hub-desc">{t.desc}</span>
              </span>
              <span className="tr-hub-arrow" aria-hidden>→</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
