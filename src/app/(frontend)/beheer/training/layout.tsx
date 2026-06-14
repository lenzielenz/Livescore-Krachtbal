import React from 'react'

import '../../analyse/analyse-theme.css'

// Het trainingsluik draagt dezelfde clublook als de analyse (rood + grijs) i.p.v. het
// standaard antraciet-/mintthema. Eén wrapper overschrijft de ontwerp-tokens; CSS-variabelen
// erven enkel naar binnen, dus buiten /beheer/training blijft alles ongewijzigd.
export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return <div className="analyse-theme">{children}</div>
}
