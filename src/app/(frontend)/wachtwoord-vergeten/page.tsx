import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import '../inloggen/inloggen.css'

export const dynamic = 'force-dynamic'

// Wachtwoord vergeten: wat je nu moet doen.
//
// Er gaat geen herstelmail de deur uit — een beheerder maakt de link aan en geeft ze door. Deze
// pagina bestaat om dat te zéggen: zonder haar klikt iemand op "wachtwoord vergeten?" en komt
// hij op een doodlopende straat, of blijft hij wachten op een mail die nooit komt.
export default function WachtwoordVergetenPage() {
  return (
    <>
      <SiteHeader active={null} />
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand">Wachtwoord</span> vergeten
          </div>
          <p className="login-sub">Geen paniek — dit is zo geregeld</p>

          <ol className="pw-stappen">
            <li>
              Vraag een <strong>herstellink</strong> aan bij je clubverantwoordelijke of bij de
              federatie. Zeg erbij met welk e-mailadres je account staat.
            </li>
            <li>
              Je krijgt een link doorgestuurd (bv. via WhatsApp). Die is <strong>één dag</strong>{' '}
              geldig en werkt <strong>één keer</strong>.
            </li>
            <li>Via die link kies je zelf een nieuw wachtwoord. Niemand anders ziet het.</li>
          </ol>

          <p className="pw-hint">
            Weet je niet meer welk e-mailadres je gebruikte? Je clubverantwoordelijke kan dat
            opzoeken.
          </p>

          <p className="login-foot">
            <Link href="/inloggen">← Terug naar inloggen</Link>
          </p>
        </div>
      </div>
    </>
  )
}
