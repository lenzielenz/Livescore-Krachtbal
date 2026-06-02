import Link from 'next/link'

import { CATEGORY_OPTIONS } from '@/lib/categories'
import { NewTournament } from './NewTournament'
import '../tornooi.css'

export const dynamic = 'force-dynamic'

// Aanmaakscherm: aantal ploegen → alle gegevens invullen → loting (manueel of toggle).
export default function NieuwTornooiPage() {
  return (
    <div className="trn-page">
      <header className="trn-top">
        <Link href="/tornooi" className="trn-home">
          <span className="brand">Krachtbal</span> Live · Nieuw tornooi
        </Link>
        <Link href="/tornooi" className="trn-toplink">← Terug</Link>
      </header>
      <NewTournament categories={CATEGORY_OPTIONS} />
    </div>
  )
}
