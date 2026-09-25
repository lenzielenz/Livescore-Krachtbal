'use client'

import Link from 'next/link'

import { TeamLogo } from '@/components/TeamLogo'
import { isPlaceholder, canoniekeClubNaam } from '@/lib/erelijst'
import type { ClubLogoMeta } from '@/lib/club-logo-lookup'

// Clubnaam als link naar het detailoverzicht (/erelijst/club/[naam]), met — indien een match
// gevonden werd tegen een échte Club-record — het clublogo ervoor. Zonder match (of bij een
// placeholder-waarde als "Geen kampioenen") gewoon platte tekst. Toont de letterlijke naam zoals
// in dat archiefrecord genoteerd (historisch correct), maar linkt altijd naar de canonieke
// clubpagina — zo komt "Robland St. Michiels" uit op dezelfde, samengevoegde pagina als
// "KBC St. Michiels" (zie club-aliases-data.ts).
export function ClubNaam({ naam, logos }: { naam: string; logos?: Record<string, ClubLogoMeta> }) {
  if (isPlaceholder(naam)) return <>{naam}</>
  const meta = logos?.[naam]
  return (
    <Link href={`/erelijst/club/${encodeURIComponent(canoniekeClubNaam(naam))}`} className="erl-entity-link">
      {meta && (
        <TeamLogo name={naam} logoUrl={meta.logoUrl} logoFit={meta.logoFit} side="home" size="20px" ringColor={meta.colorPrimary} />
      )}
      <span>{naam}</span>
    </Link>
  )
}

// Spelernaam (referendumlaureaat) als link naar diens eigen overzicht van alle referendumprijzen
// door de jaren heen — zelfde principe als ClubNaam, maar zonder logo (spelers hebben er geen).
export function SpelerNaam({ naam }: { naam: string }) {
  if (isPlaceholder(naam)) return <>{naam}</>
  return (
    <Link href={`/erelijst/speler/${encodeURIComponent(naam)}`} className="erl-entity-link erl-entity-link-tekst">
      {naam}
    </Link>
  )
}
