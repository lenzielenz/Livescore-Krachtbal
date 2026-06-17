import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canTraining } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { sanitizeNutritionProfile } from '@/lib/nutrition-plan'
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

  const profile = sanitizeNutritionProfile((me as { nutritionProfile?: unknown } | null)?.nutritionProfile)

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <TrainingHero active="voeding" />
        <p className="wb-intro">
          Vul je gegevens en doel in → meteen een persoonlijk eetplan op maat, bewaard bij je profiel.
        </p>
        <NutritionPlanner initial={profile} canSave />
      </div>
    </>
  )
}
