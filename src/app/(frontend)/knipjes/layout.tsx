import type { ReactNode } from 'react'

import { FedShellGate } from '@/components/fed-shell/FedShellGate'

// Federatieniveau krijgt hier het werkplatform (zijbalk); iedereen anders ziet de pagina ongewijzigd.
export default function Layout({ children }: { children: ReactNode }) {
  return <FedShellGate>{children}</FedShellGate>
}
