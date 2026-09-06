import { KantineScreen } from '../../../KantineScreen'
import '../../../kantine.css'

export const dynamic = 'force-dynamic'

// Eén welbepaald kantinescherm van een gebruiker. Een club heeft er vlot meerdere — kantine,
// bestuurszaal, jeugdterrein — en elk krijgt hier zijn eigen vaste link. Openbaar leesbaar: de tv
// logt niet in. Zonder profiel in het pad (../[id]) toont hij gewoon het eerste scherm, zodat een
// tv die al hangt blijft werken.
export default async function KantineProfielSchermPage({
  params,
}: {
  params: Promise<{ id: string; profiel: string }>
}) {
  const { id, profiel } = await params
  const pad = `/kantine/scherm/${encodeURIComponent(id)}/${encodeURIComponent(profiel)}`
  return (
    <KantineScreen
      endpoint={`/api/kantine/scherm/${encodeURIComponent(id)}?p=${encodeURIComponent(profiel)}`}
      editable={false}
      castPad={pad}
    />
  )
}
