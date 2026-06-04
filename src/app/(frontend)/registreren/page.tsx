import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { RegisterForm } from './RegisterForm'
import '../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

// Publieke supporter-registratie: een gratis account om wedstrijden mee te volgen.
export default async function RegistrerenPage() {
  const payload = await getPayloadClient()
  const clubsRes = await payload
    .find({ collection: 'clubs', sort: 'name', depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as { id: number; name: string }[] }))
  const clubs = clubsRes.docs.map((c) => ({ id: c.id as number, name: c.name as string }))

  return (
    <>
      <SiteHeader active={null} />
      <div className="site">
        <h1 className="page-title">
          <span className="brand">Registreren</span>
        </h1>
        <p className="wb-intro">
          Maak een gratis account aan om krachtbalwedstrijden mee te volgen. Kies (optioneel) je club —
          dan word je overal meteen naar je eigen club gestuurd. Ben je clubmedewerker, scheidsrechter
          of van de federatie? Registreer je gerust ook — een beheerder kent je daarna de juiste rol toe.
        </p>
        <RegisterForm clubs={clubs} />
      </div>
    </>
  )
}
