// Foto-opdrachten voor de tornooidag: een speelse prikkel bij het insturen van foto's.
// De opdracht wisselt telkens de supporter er één volbracht heeft (na elke geslaagde upload
// schuift de lijst één plek door). De startpositie is willekeurig per toestel, zodat elke
// gsm op het veld met een ándere opdracht begint — samen dekken de supporters zo de hele lijst.

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

/** Willekeurige startpositie: elke gsm/browser krijgt zo een eigen eerste opdracht. */
export function willekeurigeStart(rnd: () => number = Math.random): number {
  return Math.floor(rnd() * FOTO_OPDRACHTEN.length) % FOTO_OPDRACHTEN.length
}

/** De opdracht op een positie (cycled door de lijst). */
export function opdrachtOp(index: number): string {
  const n = FOTO_OPDRACHTEN.length
  return FOTO_OPDRACHTEN[((index % n) + n) % n]
}
