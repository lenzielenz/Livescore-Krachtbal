// ── Video-analyse: matchvideo koppelen aan de worp-tijdlijn ────────────────────────────────────
// Elke worp/doelpunt kent zijn helft + wedstrijdklok (zie Throws.period/gameClock). Eén ijkpunt per
// helft — "op welke seconde in de video begint deze helft?" — volstaat dan om van elk moment naar
// de juiste videopositie te springen, en omgekeerd. Puur & los testbaar; de speler-UI leeft in
// VideoAnalyse.tsx.

/** IJking: op welke seconde in de video staat de aftrap van elke helft? */
export interface VideoSync {
  /** Videoseconde waarop helft 1 op 0:00 staat. */
  offsetH1: number
  /** Idem voor helft 2. `null` = nog niet geijkt → we schatten door (zie momentToVideo). */
  offsetH2: number | null
}

export interface MatchMoment {
  half: number
  gameClock: number
}

export const EMPTY_SYNC: VideoSync = { offsetH1: 0, offsetH2: null }

/** Leest een (mogelijk onvolledige) opgeslagen ijking veilig uit. */
export function readSync(raw: unknown): VideoSync {
  const o = (raw ?? {}) as { offsetH1?: unknown; offsetH2?: unknown }
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return { offsetH1: Math.max(0, num(o.offsetH1) ?? 0), offsetH2: num(o.offsetH2) }
}

/** Videoseconde van een wedstrijdmoment. Zonder geijkte 2e helft rekenen we door alsof de video
 *  ononderbroken loopt (aftrap H2 = aftrap H1 + één helft speeltijd) — meestal een goede schatting
 *  die de gebruiker met één klik kan corrigeren. */
export function momentToVideo(m: MatchMoment, sync: VideoSync, halfSeconds: number): number {
  const start = m.half >= 2 ? (sync.offsetH2 ?? sync.offsetH1 + halfSeconds) : sync.offsetH1
  return Math.max(0, start + Math.max(0, m.gameClock))
}

/** Omgekeerd: bij welk wedstrijdmoment hoort deze videopositie? (Voor het meelopend markeren.) */
export function videoToMoment(videoSeconds: number, sync: VideoSync, halfSeconds: number): MatchMoment {
  const startH2 = sync.offsetH2 ?? sync.offsetH1 + halfSeconds
  if (videoSeconds >= startH2) return { half: 2, gameClock: Math.max(0, videoSeconds - startH2) }
  return { half: 1, gameClock: Math.max(0, videoSeconds - sync.offsetH1) }
}

/** Het moment dat "nu" bezig is: het laatste moment dat al gepasseerd is op deze videopositie.
 *  `lead` = seconden vóór het moment waarop we het al oplichten (aanloop naar de actie). */
export function activeMomentIndex<T extends MatchMoment>(
  moments: T[],
  videoSeconds: number,
  sync: VideoSync,
  halfSeconds: number,
  lead = 4,
): number {
  let best = -1
  for (let i = 0; i < moments.length; i++) {
    if (momentToVideo(moments[i], sync, halfSeconds) - lead <= videoSeconds) best = i
    else break
  }
  return best
}

// ── Bron van de video ─────────────────────────────────────────────────────────────────────────
// Een direct videobestand kunnen we in een <video> spelen → exact en soepel springen (currentTime).
// YouTube kan enkel via een iframe met ?start= (springen = de speler herladen). Andere hosts laten
// zich meestal niet insluiten → nette uitlink.

export type VideoSource =
  | { kind: 'file'; src: string }
  | { kind: 'youtube'; id: string }
  | { kind: 'link'; href: string }
  | null

const FILE_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const m = u.pathname.match(/^\/(embed|live|shorts|v)\/([^/?]+)/)
    if (m) return m[2]
  }
  return null
}

export function parseVideoSource(raw: string | null | undefined): VideoSource {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  // Eigen opgeslagen clip of een pad op deze site: altijd een echt bestand.
  if (trimmed.startsWith('/')) return { kind: 'file', src: trimmed }
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  // Enkel http(s) naar een echte host. Zonder dit zou `new URL('https://' + 'typfout')` slagen en
  // zouden we een los woord als geldige video-link bewaren.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (!host.includes('.') && host !== 'localhost') return null

  const yt = youtubeId(u)
  if (yt && /^[\w-]{6,}$/.test(yt)) return { kind: 'youtube', id: yt }
  if (FILE_EXT.test(u.pathname)) return { kind: 'file', src: u.toString() }
  return { kind: 'link', href: u.toString() }
}

/** Insluit-URL voor YouTube die op een bepaalde seconde begint. */
export function youtubeEmbedAt(id: string, startSeconds: number): string {
  const s = Math.max(0, Math.floor(startSeconds))
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&start=${s}&autoplay=1`
}

/** mm:ss (of h:mm:ss vanaf een uur) — voor de momentenlijst en de videopositie. */
export function fmtVideoTime(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
