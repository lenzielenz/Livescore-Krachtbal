import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'

/** Wat iemand zonder federatierechten ziet op een federatietool. */
export function FederatieAlleen({ titel }: { titel: string }) {
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site">
        <h1 className="page-title">{titel}</h1>
        <p className="empty">
          Enkel de federatie heeft toegang tot dit luik. <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
        </p>
      </div>
    </>
  )
}
