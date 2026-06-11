import React from 'react'

import './analyse-theme.css'

// De volledige analyse-zone draagt de clubkleuren van Sint-Michiels (rood + grijs).
// Eén wrapper rond álle analyse-pagina's (en subpagina's) overschrijft de ontwerp-tokens;
// omdat CSS-variabelen enkel naar binnen erven, blijft alles BUITEN /analyse onveranderd
// het standaard antraciet-thema. Verlaat je de analyse, dan is alles weer als vanouds.
export default function AnalyseLayout({ children }: { children: React.ReactNode }) {
  return <div className="analyse-theme">{children}</div>
}
