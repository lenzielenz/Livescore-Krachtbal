import { getPayloadClient } from './payload-client'

interface Args {
  id: number
  status: string
  prevStatus: string | null
  analyseOnly: boolean
  isDemo: boolean
}

/**
 * Verwittigt geabonneerde supporters met een push wanneer een (gewone) wedstrijd LIVE gaat of
 * AFGELOPEN is. Fire-and-forget en volledig losgekoppeld van de DB-transactie van de match-actie:
 * een trage of mislukte push mag het aantekenen nooit vertragen of breken.
 */
export function notifyMatchStatusChange(args: Args): void {
  // setTimeout(…, 0): draait ná de huidige operatie, met een verse payload-context (zonder req,
  // dus zonder de lopende transactie), zodat het opbouwen en versturen erbuiten valt.
  setTimeout(() => {
    void run(args).catch(() => {})
  }, 0)
}

async function run({ id, status, prevStatus, analyseOnly, isDemo }: Args): Promise<void> {
  if (analyseOnly || isDemo) return // privé-analyses en demo's verwittigen niemand
  if (status === prevStatus) return
  if (status !== 'live' && status !== 'finished') return

  const payload = await getPayloadClient()
  const { pushConfigured, sendPushToAll } = await import('./push')
  if (!pushConfigured()) return // geen sleutels → niets te doen (geen lege query's)
  const { buildMatchState } = await import('./match-engine')

  const state = await buildMatchState(payload, id).catch(() => null)
  if (!state) return
  const home = state.teams.home.name
  const away = state.teams.away.name
  const tag = `match-${id}` // nieuwere melding van dezelfde match vervangt de vorige

  const notif =
    status === 'live'
      ? { title: '🟢 Match begonnen', body: `${home} – ${away} is live!`, url: `/match/${id}`, tag }
      : { title: '🏁 Eindstand', body: `${home} ${state.score.home}–${state.score.away} ${away}`, url: `/match/${id}`, tag }

  await sendPushToAll(payload, notif)
}
