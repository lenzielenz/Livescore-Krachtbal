import Link from 'next/link'

import { getAuthUser } from '@/lib/auth-user'
import { DEMO_ROLLEN } from '@/lib/demoruimte/rollen'
import { DemoRolWissel } from './DemoRolWissel'

// De band bovenaan elke pagina in de demoruimte: wie je nu bent, wissel van rol, terug naar het draaiboek.
export async function DemoRolBand() {
  const me = await getAuthUser().catch(() => null)
  const email = String((me as { email?: unknown } | null)?.email ?? '')
  const rol = DEMO_ROLLEN.find((r) => email === `demo-${r.sleutel}@demo.krachtbal.be`) ?? null
  return (
    <div className="test-omgeving-band demo-band" role="note">
      <span>
        🎬 <b>Demoruimte</b>
        <span className="test-omgeving-uitleg"> · aparte demodatabank — niets hier raakt de live site</span>
      </span>
      <span className="demo-band-acties">
        <span className="demo-band-als">Kijk als</span>
        <DemoRolWissel huidig={rol?.sleutel ?? (me ? null : 'publiek')} />
        <Link href="/demoruimte" className="test-omgeving-link">
          📖 Draaiboek
        </Link>
      </span>
    </div>
  )
}
