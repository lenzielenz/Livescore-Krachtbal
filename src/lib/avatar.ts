// Kleine, gedeelde avatar-logica (initialen + kleur als er geen profielfoto is) — puur, geen DB.
// Gebruikt door het Avatar-component (client én server: geen hooks nodig) zodat een supporter
// overal waar zijn naam verschijnt (live tribune, berichten uit de tribune) er hetzelfde uitziet.

/** Initialen uit een naam: voor- + achternaam → 2 letters, één woord → 1 letter. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Deterministische, aangename achtergrondkleur voor een initialen-avatar: dezelfde naam geeft
 *  altijd dezelfde kleur, verschillende namen spreiden over het hele kleurenwiel. */
export function avatarColor(name: string): string {
  const hash = Array.from(name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const hue = hash % 360
  return `hsl(${hue}, 58%, 40%)`
}
