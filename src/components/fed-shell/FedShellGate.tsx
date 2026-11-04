import type { ReactNode } from 'react'

import { hasRole, isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { FedShell } from './FedShell'

// Wie federatieniveau heeft (federatie of admin) krijgt het werkplatform met zijbalk om de pagina
// heen; iedereen anders — clubs, scheidsrechters, supporters, uitgelogde bezoekers, en een beheerder
// in kijkmodus — ziet de pagina precies zoals voorheen. Gebruikt in de layouts van de luiken waar de
// federatie werkt (beheer, federatie, wedstrijdbladen, ongevallen, knipjes, bekerfinale).
export async function FedShellGate({ children }: { children: ReactNode }) {
  const me = (await getAuthUser()) as { name?: unknown; email?: unknown } | null
  if (!me || !isFederationLevel(me)) return <>{children}</>

  const isAdmin = hasRole(me, 'admin')
  const naam = typeof me.name === 'string' && me.name.trim() ? me.name.trim() : typeof me.email === 'string' ? me.email.split('@')[0]! : 'Federatie'
  return (
    <FedShell naam={naam} rolLabel={isAdmin ? 'Beheerder' : 'Federatie'} isAdmin={isAdmin}>
      {children}
    </FedShell>
  )
}
