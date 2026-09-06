import { KantineScreen } from '../../KantineScreen'
import '../../kantine.css'

export const dynamic = 'force-dynamic'

// Het persoonlijke kantinescherm (de tv). Openbare, vaste link per gebruiker: één keer op de
// kantine-tv zetten en hij blijft heel het seizoen kloppen — de inhoud volgt de clubs, ploegen en
// losse wedstrijden die de eigenaar op /kantine koos. Geen login op de tv nodig.
export default async function PersoonlijkKantineSchermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pad = `/kantine/scherm/${encodeURIComponent(id)}`
  return <KantineScreen endpoint={`/api/kantine/scherm/${encodeURIComponent(id)}`} editable={false} castPad={pad} />
}
