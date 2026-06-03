import { SiteHeader, type NavSection } from '@/components/SiteHeader'

// Gedeelde laadstaat: de vaste header + shimmerende placeholders, zodat pagina's niet leeg
// flitsen tijdens het ophalen. Gebruikt door de loading.tsx-bestanden per route.
export function PageSkeleton({ active = null, rows = 6 }: { active?: NavSection; rows?: number }) {
  return (
    <>
      <SiteHeader active={active} />
      <div className="site">
        <div className="skel skel-title" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skel skel-row" />
        ))}
      </div>
    </>
  )
}
