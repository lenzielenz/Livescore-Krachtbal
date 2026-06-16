import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { sanitizeTracker } from '@/lib/calorie-tracker'
import { sanitizeNutritionProfile } from '@/lib/nutrition-plan'
import { AnalyseNav } from '../../AnalyseNav'
import { NutritionPlanner } from './NutritionPlanner'
import '../../analyse.css'

export const dynamic = 'force-dynamic'

// Sportvoeding-advies in de coach-app: vul je gegevens + doel in en krijg een persoonlijk,
// sportgericht eetplan (calorieën, eiwit/koolhydraten/vet, hydratatie, maaltijdverdeling, tips).
export default async function VoedingPage() {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Voedingsadvies</span></h1>
          <p className="empty">Je hebt geen toegang tot de coach-app. <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link></p>
        </div>
      </>
    )
  }

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="coach" />
        <div className="an-head-bar">
          <h1 className="page-title">🥗 <span className="brand">Voedingsadvies</span></h1>
          <Link className="sk-demo-cta" href="/analyse/coach">← Coach-dashboard</Link>
        </div>
        <p className="an-lead">Vul je gegevens en je doel in — je krijgt meteen een persoonlijk, sportgericht eetplan: hoeveel calorieën, eiwit, koolhydraten en vet, hoeveel water, en hoe je het over de dag verdeelt. Bewaar het bij je profiel zodat het de volgende keer al ingevuld staat.</p>
        <NutritionPlanner
          initial={sanitizeNutritionProfile((me as { nutritionProfile?: unknown }).nutritionProfile)}
          tracker={sanitizeTracker((me as { nutritionTracker?: unknown }).nutritionTracker)}
          canSave
        />
      </div>
    </>
  )
}
