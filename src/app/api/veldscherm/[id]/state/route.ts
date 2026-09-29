import { getPublicFieldScreenState } from '@/lib/field-screens-data'
import { getPayloadClient } from '@/lib/payload-client'

// Lichtgewicht pollingdoel voor het veldscherm zelf: enkel of er nu een wedstrijd gekoppeld is.
// Publiek en zonder login — net als /api/veld, en de tv staat ter plaatse. Wijzigt het
// (ont)koppelen, dan herlaadt de serverpagina zichzelf (zie FieldScreenSync.tsx) om de volledige
// staat (koppelcode, dagplanning of het scorebord) opnieuw op te halen.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fieldScreenId = Number(id)
  if (!Number.isFinite(fieldScreenId)) return Response.json({ error: 'Ongeldig veldscherm.' }, { status: 400 })

  const payload = await getPayloadClient()
  const state = await getPublicFieldScreenState(payload, fieldScreenId)
  if (!state) return Response.json({ error: 'Veldscherm niet gevonden.' }, { status: 404 })
  return Response.json({ pairedMatchId: state.pairedMatchId, queuedMatchId: state.queuedMatchId })
}
