// SSE-load-test voor de live-laag (AUDIT follow-up: "measure, don't guess").
//
// Opent N gelijktijdige SSE-verbindingen naar één wedstrijdstream en meet: verbindingstijd,
// tijd-tot-eerste-frame, ontvangen events en fouten. Optioneel vuurt het ook supporter-reacties
// af om de geaggregeerde 'reactions'-flush + rate limiting te testen.
//
// Gebruik (server moet draaien):
//   pnpm loadtest --url http://localhost:3000 --match 1 --viewers 500 --seconds 20 --react
//
// Vereist Node 22+ (globale EventSource + fetch). Dit is een ONTWIKKEL-tool, geen prod-code.

type Args = { url: string; match: number; viewers: number; seconds: number; react: boolean }

function parseArgs(argv: string[]): Args {
  const get = (flag: string, def?: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def
  }
  return {
    url: get('--url', 'http://localhost:3000')!.replace(/\/$/, ''),
    match: Number(get('--match', '1')),
    viewers: Number(get('--viewers', '200')),
    seconds: Number(get('--seconds', '15')),
    react: argv.includes('--react'),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const ES = (globalThis as { EventSource?: typeof EventSource }).EventSource
  if (!ES) {
    console.error('Geen globale EventSource — gebruik Node 22+ (jij draait Node 24, dus dit zou moeten werken).')
    process.exit(1)
  }
  const streamUrl = `${args.url}/api/match/${args.match}/stream`
  console.log(`Load-test: ${args.viewers} kijkers op ${streamUrl} gedurende ${args.seconds}s${args.react ? ' (+reacties)' : ''}`)

  const sources: EventSource[] = []
  let opened = 0
  let errors = 0
  let updates = 0
  let viewersSeen = 0
  let reactionEvents = 0
  const start = Date.now()
  const firstFrameMs: number[] = []

  for (let i = 0; i < args.viewers; i++) {
    const t0 = Date.now()
    let gotFirst = false
    const es = new ES(streamUrl)
    es.onopen = () => {
      opened++
    }
    es.addEventListener('update', () => {
      updates++
      if (!gotFirst) {
        gotFirst = true
        firstFrameMs.push(Date.now() - t0)
      }
    })
    es.addEventListener('viewers', (e) => {
      viewersSeen = Math.max(viewersSeen, JSON.parse((e as MessageEvent).data).count ?? 0)
    })
    es.addEventListener('reactions', () => {
      reactionEvents++
    })
    es.onerror = () => {
      errors++
    }
    sources.push(es)
    if (i % 50 === 0) await new Promise((r) => setTimeout(r, 20)) // gespreid openen
  }

  if (args.react) {
    const emojis = ['clap', 'fire', 'heart', 'goal', 'wow']
    const reactTimer = setInterval(() => {
      // simuleer 30 supporters die tegelijk tikken (test aggregatie + rate limit)
      for (let i = 0; i < 30; i++) {
        const emoji = emojis[i % emojis.length]
        fetch(`${args.url}/api/match/${args.match}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji, count: 1 }),
        }).catch(() => {})
      }
    }, 500)
    setTimeout(() => clearInterval(reactTimer), args.seconds * 1000)
  }

  await new Promise((r) => setTimeout(r, args.seconds * 1000))
  for (const es of sources) es.close()

  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, n) => s + n, 0) / a.length) : 0)
  const p95 = (a: number[]) => {
    if (!a.length) return 0
    const s = [...a].sort((x, y) => x - y)
    return s[Math.floor(s.length * 0.95)]
  }
  console.log('\n── Resultaat ──')
  console.log(`Verbindingen geopend : ${opened}/${args.viewers}`)
  console.log(`Fouten               : ${errors}`)
  console.log(`'update'-events       : ${updates}`)
  console.log(`Max viewer-count gezien: ${viewersSeen}`)
  console.log(`'reactions'-flushes   : ${reactionEvents}`)
  console.log(`Tijd-tot-1e-frame    : avg ${avg(firstFrameMs)}ms · p95 ${p95(firstFrameMs)}ms`)
  console.log(`Totale duur          : ${Math.round((Date.now() - start) / 1000)}s`)
  console.log('\nLet op: dit meet de SSE-fan-out + rate limit. Voor échte schaal: draai dit tegen een')
  console.log('Railway-achtige Postgres en kijk of de DB-pool stabiel blijft (één gedeelde poller per match).')
  process.exit(0)
}

void main()
