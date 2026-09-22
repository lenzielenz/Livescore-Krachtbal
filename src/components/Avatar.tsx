import { avatarColor, initialsFor } from '@/lib/avatar'
import './avatar.css'

// Kleine, ronde profielavatar: de echte foto als die er is, anders initialen op een kleur die
// uit de naam volgt (altijd dezelfde kleur voor dezelfde persoon). Puur presentationeel — geen
// hooks — zodat dit zowel server- als client-componenten in kan (live tribune ↔ berichten uit de
// tribune-recap tonen exact dezelfde persoon exact hetzelfde). Wie nooit een foto uploadde, valt
// hier zichtbaar terug op kale initialen — precies het contrast dat laat zien waarom een eigen
// profielfoto de moeite loont.
export function Avatar({ name, photoUrl, size = 28 }: { name: string; photoUrl?: string | null; size?: number }) {
  return (
    <span
      className="av"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ['--av-bg' as string]: avatarColor(name) }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" loading="lazy" />
      ) : (
        <span className="av-init">{initialsFor(name)}</span>
      )}
    </span>
  )
}
