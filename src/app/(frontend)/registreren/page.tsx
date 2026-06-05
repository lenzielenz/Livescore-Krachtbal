import { SiteHeader } from '@/components/SiteHeader'
import { dedupeKey } from '@/lib/dedupe'
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
  // Geen dubbele clubs tonen: groepeer op genormaliseerde naam en hou de meest leesbare
  // schrijfwijze (meeste spaties, dan langste).
  const byKey = new Map<string, { id: number; name: string }>()
  for (const c of clubsRes.docs) {
    const name = String(c.name ?? '')
    if (!name) continue
    const k = dedupeKey(name)
    const ex = byKey.get(k)
    const better = !ex || name.split(' ').length > ex.name.split(' ').length || (name.split(' ').length === ex.name.split(' ').length && name.length > ex.name.length)
    if (better) byKey.set(k, { id: c.id as number, name })
  }
  const clubs = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))

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
