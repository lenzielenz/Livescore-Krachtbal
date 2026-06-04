// SSE-load-test voor de live-laag (AUDIT follow-up: "measure, don't guess").
//
// Opent N gelijktijdige SSE-verbindingen naar één wedstrijdstream en meet: verbindingstijd,
// tijd-tot-eerste-frame, ontvangen events en fouten. Optioneel vuurt het ook supporter-reacties
// af om de geaggregeerde 'reactions'-flush + rate limiting te testen.
//
// Gebruik (server moet draaien):
//   pnpm loadtest --url http://localhost:3000 --match 1 --viewers 500 --seconds 20 --react
//
// Dependency-vrij: gebruikt de globale fetch (Node 18+) en parseert SSE zelf. ONTWIKKEL-tool.

type Args = { url: string; match: number; viewers: number; seconds: number; react: boolean }

type Stats = { opened: number; errors: number; updates: number; viewersSeen: number; reactionEvents: number; firstFrameMs: number[] }

function parseArgs(argv: string[]): Args {
  const get = (flag: string, def?: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def
  }
  return {
    url: get('--url', 'http://localhost:3000')!.replace(/\/$/, ''),
    match: Number(get('--match', '1')),
    seconds: Number(get('--seconds', '15')),
    viewers: Number(get('--viewers', '200')),
    react: argv.includes('--react'),
  }
}

// Eén SSE-"kijker": leest de stream tot abort en telt de events per type.
async function runViewer(url: string, signal: AbortSignal, stats: Stats) {
  const t0 = Date.now()
  let gotFirst = false
  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'text/event-stream' }, signal })
  } catch {
    stats.errors++
    return
  }
  if (!res.ok || !res.body) {
    stats.errors++
    return
  }
  stats.opened++
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const ev = /event:\s*(\w+)/.exec(frame)?.[1]
        if (ev === 'update') {
          stats.updates++
          if (!gotFirst) {
            gotFirst = true
            stats.firstFrameMs.push(Date.now() - t0)
          }
        } else if (ev === 'viewers') {
          const m = /data:\s*(\{.*\})/.exec(frame)
          if (m) stats.viewersSeen = Math.max(stats.viewersSeen, JSON.parse(m[1]).count ?? 0)
        } else if (ev === 'reactions') {
          stats.reactionEvents++
        }
      }
    }
  } catch {
    /* abort of verbinding gesloten — normaal einde */
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const streamUrl = `${args.url}/api/match/${args.match}/stream`
  // eslint-disable-next-line no-console
  console.log(`Load-test: ${args.viewers} kijkers op ${streamUrl} gedurende ${args.seconds}s${args.react ? ' (+reacties)' : ''}`)

  const stats: Stats = { opened: 0, errors: 0, updates: 0, viewersSeen: 0, reactionEvents: 0, firstFrameMs: [] }
  const ac = new AbortController()
  const start = Date.now()

  const viewers: Promise<void>[] = []
  for (let i = 0; i < args.viewers; i++) {
    viewers.push(runViewer(streamUrl, ac.signal, stats))
    if (i % 50 === 0) await new Promise((r) => setTimeout(r, 20)) // gespreid openen
  }

  let reactTimer: ReturnType<typeof setInterval> | undefined
  if (args.react) {
    const emojis = ['clap', 'fire', 'heart', 'goal', 'wow']
    reactTimer = setInterval(() => {
      for (let i = 0; i < 30; i++) {
        fetch(`${args.url}/api/match/${args.match}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji: emojis[i % emojis.length], count: 1 }),
        }).catch(() => {})
      }
    }, 500)
  }

  await new Promise((r) => setTimeout(r, args.seconds * 1000))
  if (reactTimer) clearInterval(reactTimer)
  ac.abort()
  await Promise.allSettled(viewers)

  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, n) => s + n, 0) / a.length) : 0)
  const p95 = (a: number[]) => {
    if (!a.length) return 0
    const s = [...a].sort((x, y) => x - y)
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
  }
  const log = (m: string) => {
    // eslint-disable-next-line no-console
    console.log(m)
  }
  log('\n── Resultaat ──')
  log(`Verbindingen geopend   : ${stats.opened}/${args.viewers}`)
  log(`Fouten                 : ${stats.errors}`)
  log(`'update'-events        : ${stats.updates}`)
  log(`Max viewer-count gezien: ${stats.viewersSeen}`)
  log(`'reactions'-flushes    : ${stats.reactionEvents}`)
  log(`Tijd-tot-1e-frame      : avg ${avg(stats.firstFrameMs)}ms · p95 ${p95(stats.firstFrameMs)}ms`)
  log(`Totale duur            : ${Math.round((Date.now() - start) / 1000)}s`)
  log('\nLet op: dit meet de SSE-fan-out + rate limit. Voor échte schaal: draai tegen een')
  log('Railway-achtige Postgres en kijk of de DB-pool stabiel blijft (één gedeelde poller per match).')
  process.exit(0)
}

void main()
