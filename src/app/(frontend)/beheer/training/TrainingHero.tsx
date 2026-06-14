import { TeamLogo } from '@/components/TeamLogo'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { TrainingNav, type TrainingTab } from './TrainingNav'

// Trainingsslogans — eentje per dag (deterministisch), zodat het luik leeft maar rustig blijft.
const SLOGANS = [
  'Elke training telt — word elke week een beetje sterker.',
  'Kampioenen worden gemaakt op training, niet op wedstrijddag.',
  'Meet, train, herhaal — vooruitgang die je kan zien.',
  'Harder werken dan gisteren, slimmer dan de tegenstander.',
  'Kleine stappen, elke week — zo bouw je een topploeg.',
  'Discipline op training wint de match van zondag.',
]

function slogan(): string {
  const d = new Date()
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000)
  return SLOGANS[dayOfYear % SLOGANS.length]
}

// Gebrande trainingskop: clublogo + naam + dagelijkse slogan, met de subnav eronder.
export async function TrainingHero({ active }: { active: TrainingTab }) {
  const me = await getAuthUser()
  const clubId = userClubId(me)
  let clubName: string | null = null
  let logoUrl: string | null = null
  let color: string | null = null
  if (clubId != null) {
    const club = await getPayloadClient()
      .then((p) => p.findByID({ collection: 'clubs', id: clubId as number, depth: 1 }))
      .catch(() => null)
    if (club) {
      clubName = (club as { name?: string }).name ?? null
      logoUrl = clubLogoUrl({ club })
      color = ((club as { colorPrimary?: string }).colorPrimary as string) ?? null
    }
  }

  return (
    <>
      <div className="tr-hero">
        <TeamLogo name={clubName ?? 'Training'} logoUrl={logoUrl} logoFit={null} size="lg" ringColor={color ?? undefined} />
        <div className="tr-hero-id">
          <span className="tr-hero-kicker">🏋️ Training</span>
          <h1 className="tr-hero-name">{clubName ?? 'Training'}</h1>
          <p className="tr-hero-slogan">{slogan()}</p>
        </div>
      </div>
      <TrainingNav active={active} />
    </>
  )
}
