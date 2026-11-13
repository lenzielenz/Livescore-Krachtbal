import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { dateStrBE } from '@/lib/datetime'
import { factuurInstellingen, facturenLijst, mollieActief } from '@/lib/facturatie-server'
import { getPayloadClient } from '@/lib/payload-client'
import { FederatieAlleen } from '../FederatieAlleen'
import { FacturenBeheer } from './FacturenBeheer'
import '../federatie-tools.css'
import '../../wedstrijdblad.css'
import './facturen.css'

export const dynamic = 'force-dynamic'

// Facturatie aan de clubs (lib/facturatie.ts): concepten opmaken uit aansluitingen, boetes en
// scheidsrechterskosten, nakijken en versturen, betalingen boeken (manueel of uit het bankafschrift) en zien
// wat open staat. "Betaald" wordt altijd berekend uit de betalingen.
export default async function FacturenPage() {
  const me = await getAuthUser()
  if (!isFederationLevel(me)) return <FederatieAlleen titel="Facturen" />
  const payload = await getPayloadClient()
  const [rijen, inst] = await Promise.all([facturenLijst(payload, {}, new Date(), 1000), factuurInstellingen(payload)])
  const ontbreekt = [!inst.iban && 'het IBAN', !inst.adres && 'het adres van de federatie', inst.lidgeldSpeler <= 0 && 'het tarief van de aansluiting'].filter(Boolean) as string[]
  return (
    <>
      <SiteHeader active="federatie" />
      <div className="site site-breed">
        <h1 className="page-title">🧾 Facturen</h1>
        <p className="acc-page-intro">
          Maak per club een factuur met wat ze verschuldigd is, kijk ze na en verstuur ze. Betalingen komen binnen via het bankafschrift (de
          gestructureerde mededeling koppelt ze vanzelf){mollieActief() ? ', online, ' : ' '}of manueel.
        </p>
        {ontbreekt.length > 0 && (
          <p className="fa-let">
            Nog in te stellen in het beheerpaneel (Federatie-instellingen → Facturatie aan de clubs): {ontbreekt.join(', ')}.
          </p>
        )}
        <FacturenBeheer rijen={rijen} vandaag={dateStrBE()} />
      </div>
    </>
  )
}
