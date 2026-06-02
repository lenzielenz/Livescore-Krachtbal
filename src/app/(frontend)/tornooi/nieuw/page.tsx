import { SiteHeader } from '@/components/SiteHeader'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { NewTournament } from './NewTournament'
import '../tornooi.css'

export const dynamic = 'force-dynamic'

// Aanmaakscherm: aantal ploegen → alle gegevens invullen → loting (manueel of toggle).
export default function NieuwTornooiPage() {
  return (
    <>
      <SiteHeader active="tornooi" />
      <div className="trn-page">
        <NewTournament categories={CATEGORY_OPTIONS} />
      </div>
    </>
  )
}
