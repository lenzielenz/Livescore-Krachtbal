import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { clubColorsFrom } from '@/lib/club-colors'
import { getPayloadClient } from '@/lib/payload-client'
import { RAD_SEGMENTS } from '@/lib/pronostiek-rad'
import { loadRadState } from '@/lib/pronostiek-rad-server'
import { Wheel } from './Wheel'
import './rad.css'
import '../../club/voorspel/voorspel.css'

export const dynamic = 'force-dynamic'

type Power = { mult: number; remaining: number; wonAt: string }

const fmt = (v: number) => `×${Number.isInteger(v) ? v : String(v).replace('.', ',')}`
const MEDAL = ['🥇', '🥈', '🥉']

// Bonusrad (Las Vegas) — de top 3 van vorig weekend draaien aan een rad met vermenigvuldigers. Wat
// je draait, win je als 3 persoonlijke boosters voor je volgende voorspellingen. Het rad draagt je
// clublogo en -kleuren. Beheerders/federatie mogen altijd draaien (testmodus).
export default async function RadPage() {
  const payload = await getPayloadClient()
  const me = await getAuthUser()
  const myId = me ? Number((me as { id?: number }).id) : null
  const canTest = isFederationLevel(me)
  const state = await loadRadState(payload)

  const power = ((me as { pronostiekPower?: Power | null } | null)?.pronostiekPower) ?? null
  const myRank = state.top3.find((w) => w.userId === myId)?.rank ?? null
  const eligible = canTest || myRank != null
  const spunThisWeek = power != null && power.wonAt === state.weekendStartIso
  const showWheel = eligible && (canTest || !spunThisWeek)
  const remaining = power && Number(power.remaining) > 0 ? Number(power.remaining) : 0

  // Clublogo + clubkleuren: het rad voelt als jóuw club.
  const cid = userClubId(me)
  const clubId = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null
  let clubLogoUrl: string | null = null
  let clubColors: { primary: string; secondary: string } | null = null
  let clubName = 'je club'
  if (clubId) {
    const c = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)
    if (c) {
      clubLogoUrl = (c as { logoUrl?: string | null }).logoUrl || null
      clubColors = clubColorsFrom((c as { colorPrimary?: unknown }).colorPrimary, (c as { colorSecondary?: unknown }).colorSecondary)
      clubName = (c as { name?: string }).name || 'je club'
    }
  }

  return (
    <>
      <SiteHeader active="stand" />
      <div className="site">
        <h1 className="page-title">🎰 <span className="brand">Bonusrad</span></h1>
        <p className="vs-intro">
          De <strong>top 3</strong> van de pronostiek van vorig weekend draaien aan het rad. Je wint een <strong>vermenigvuldiger</strong> die je
          op je volgende <strong>3 voorspellingen</strong> kan gebruiken — jij kiest welke wedstrijden. <Link href="/pronostiek" style={{ color: 'var(--accent)' }}>Naar de stand</Link>.
        </p>

        {canTest && (
          <p className="rad-test">🧪 Testmodus (beheerder): jij mag altijd draaien. Opnieuw draaien overschrijft je vorige booster.</p>
        )}

        {state.top3.length > 0 && (
          <div className="rad-podium">
            {state.top3.map((w) => (
              <span key={w.userId} className={`rad-pod${w.userId === myId ? ' me' : ''}`}>
                <span className="rad-pod-m">{MEDAL[w.rank - 1]}</span>
                <span className="rad-pod-n">{w.name}{w.userId === myId ? ' (jij)' : ''}</span>
              </span>
            ))}
          </div>
        )}

        {showWheel ? (
          <Wheel segments={[...RAD_SEGMENTS]} clubLogoUrl={clubLogoUrl} clubColors={clubColors} clubName={clubName} tokens={remaining} />
        ) : remaining > 0 ? (
          <div className="rad-card">
            <h2>🎟️ Je booster staat klaar</h2>
            <p>Je hebt <b>{remaining}</b> booster(s) van <b>{fmt(power!.mult)}</b>. Gebruik ze bij het voorspellen op een livewedstrijd — jij kiest op welke. <Link href="/" style={{ color: 'var(--accent)' }}>Voorspel mee →</Link></p>
          </div>
        ) : eligible ? (
          <div className="rad-card">
            <h2>Je boosters zijn op</h2>
            <p>Je gebruikte je boosters van deze week. Eindig opnieuw bij de top 3 om volgende week weer te mogen draaien.</p>
          </div>
        ) : (
          <div className="rad-card">
            <h2>Speel mee voor het rad</h2>
            <p>Enkel de <strong>top 3</strong> van het weekend mag aan het rad draaien. Voorspel mee en knok je naar de top! <Link href="/" style={{ color: 'var(--accent)' }}>Voorspel mee →</Link></p>
          </div>
        )}
      </div>
    </>
  )
}
