import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canTraining } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { NutritionPlanner } from '../../../analyse/coach/voeding/NutritionPlanner'
import { TrainingHero } from '../TrainingHero'
import '../training.css'

export const dynamic = 'force-dynamic'

// Sportvoeding-planner binnen het trainingsluik: gegevens + doel → persoonlijk, sportgericht eetplan.
export default async function TrainingVoedingPage() {
  const me = await getAuthUser()
  if (!canTraining(me)) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">Voedingsplan <span className="brand">·</span> op maat</h1>
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
        <TrainingHero active="voeding" />
        <p className="wb-intro">
          Vul je gegevens en je doel in — je krijgt meteen een persoonlijk, sportgericht eetplan:
          calorieën, eiwit/koolhydraten/vet, hydratatie, trainings- vs rustdag en een voorbeelddag op maat.
        </p>
        <NutritionPlanner />
      </div>
    </>
  )
}
