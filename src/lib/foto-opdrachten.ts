// Foto-opdrachten voor de tornooidag: een speelse prikkel bij het insturen van foto's.
// De opdracht wisselt telkens de supporter er één volbracht heeft (na elke geslaagde upload
// schuift de lijst één plek door). De startpositie hangt af van de tornooidag, zodat niet
// elk evenement met exact dezelfde opdracht begint.

export const FOTO_OPDRACHTEN: readonly string[] = [
  '📸 Foto met het scorebord',
  '🤝 Foto met een tegenstander',
  '👕 Foto in het tenue van de tegenstander',
  '🏐 Foto met de wedstrijdbal',
  '📣 Foto van de luidste supporters',
  '🧑‍⚖️ Foto met de scheidsrechter',
  '🌭 Foto van je kantine-bestelling',
  '👟 Foto van de modderigste schoenen',
  '🎉 Foto van de mooiste viering',
  '👶 Foto met de jongste supporter van de dag',
  '🧤 Foto van de beste vangst (actie!)',
  '☀️ Foto van het hele veld in één beeld',
] as const

/** Deterministische startpositie per tornooidag (zelfde dag = zelfde eerste opdracht). */
export function startIndexVoor(groep: string): number {
  let h = 0
  for (const c of groep) h = (h * 31 + c.charCodeAt(0)) % 997
  return h % FOTO_OPDRACHTEN.length
}

/** De opdracht op een positie (cycled door de lijst). */
export function opdrachtOp(index: number): string {
  const n = FOTO_OPDRACHTEN.length
  return FOTO_OPDRACHTEN[((index % n) + n) % n]
}
