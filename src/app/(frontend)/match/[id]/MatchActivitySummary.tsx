import { Avatar } from '@/components/Avatar'
import './match-activity-summary.css'

type Shout = { id: number; name: string; text: string; at: number; photoUrl?: string | null }
type Photo = { id: number; url: string; authorName: string; at: number; kind?: 'photo' | 'video' }

const REACTIONS = [
  ['clap', '👏', 'Applaus'],
  ['fire', '🔥', 'Vuur'],
  ['heart', '❤️', 'Hartjes'],
  ['goal', '⚽', 'Goal'],
  ['wow', '😮', 'Wow'],
  ['rocket', '🚀', 'Rugworp'],
] as const

export function MatchActivitySummary({
  reactions,
  shouts,
  photos,
}: {
  reactions: Record<string, number>
  shouts: Shout[]
  photos: Photo[]
}) {
  const reactionTotal = Object.values(reactions).reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0)
  const stills = photos.filter((p) => p.kind !== 'video')
  const clips = photos.filter((p) => p.kind === 'video')
  const total = reactionTotal + shouts.length + photos.length
  if (total === 0) return null

  return (
    <section className="match-activity" aria-labelledby="match-activity-title">
      <div className="match-activity-head">
        <div>
          <span className="match-activity-kicker">DE BELEVING</span>
          <h2 id="match-activity-title">Zoveel leefde deze wedstrijd</h2>
        </div>
        <strong className="match-activity-total">{total}<small>momenten</small></strong>
      </div>

      <div className="match-activity-stats">
        <div><strong>{reactionTotal}</strong><span>reacties</span></div>
        <div><strong>{shouts.length}</strong><span>berichten</span></div>
        <div><strong>{photos.length}</strong><span>momenten</span></div>
      </div>

      {reactionTotal > 0 && (
        <div className="match-activity-reactions" aria-label="Reacties per soort">
          {REACTIONS.map(([key, glyph, label]) => {
            const count = Math.max(0, Number(reactions[key]) || 0)
            return count ? <span key={key} title={label}><b>{glyph}</b>{count}</span> : null
          })}
        </div>
      )}

      {stills.length > 0 && (
        <div className="match-activity-block">
          <h3>Foto’s uit de tribune</h3>
          <div className="match-activity-photos">
            {stills.map((photo) => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="match-activity-photo">
                {/* Dynamische Payload-upload; de originele foto mag op ware grootte openen. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={`Supporterfoto van ${photo.authorName}`} loading="lazy" />
                <span>{photo.authorName}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {clips.length > 0 && (
        <div className="match-activity-block">
          <h3>Video’s uit de tribune</h3>
          <div className="match-activity-photos">
            {clips.map((clip) => (
              <a key={clip.id} href={clip.url} target="_blank" rel="noreferrer" className="match-activity-photo match-activity-video">
                <video src={clip.url} muted playsInline preload="metadata" />
                <span className="match-activity-play" aria-hidden>▶</span>
                <span>{clip.authorName}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {shouts.length > 0 && (
        <div className="match-activity-block">
          <h3>Berichten uit de tribune</h3>
          <div className="match-activity-shouts">
            {[...shouts].sort((a, b) => a.at - b.at).map((shout) => (
              <blockquote key={shout.id}>
                <p>{shout.text}</p>
                <footer>
                  <Avatar name={shout.name} photoUrl={shout.photoUrl} size={22} />
                  <span>{shout.name}</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
