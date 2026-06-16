// ── Ingebouwde voedingsdatabank ──────────────────────────────────────────────────────────────
// Een curated lijst veelgebruikte (vooral generieke) voedingsmiddelen met voedingswaarde per 100 g
// en een typische portie. Vult Open Food Facts aan met "gewone" producten (rauw vlees, gekookte rijst,
// vers fruit…) die daar minder goed in zitten. Volledig offline doorzoekbaar — geen API/key nodig.

export interface LocalFood {
  name: string
  /** Per 100 g. */
  kcal: number
  p: number
  c: number
  f: number
  /** Typische portie in gram. */
  serving: number
  /** Extra zoekwoorden (synoniemen). */
  alias?: string
}

// Compacte bron: [naam, kcal, eiwit, koolh, vet, portie(g), alias?]
type Row = [string, number, number, number, number, number, string?]
const RAW: Row[] = [
  // ── Granen, brood, aardappel ──
  ['Volkorenbrood', 247, 9, 41, 3, 35], ['Wit brood', 265, 8, 49, 3, 35], ['Bruin brood', 250, 9, 43, 3, 35],
  ['Beschuit', 390, 11, 73, 5, 10], ['Croissant', 406, 8, 46, 21, 50], ['Havermout (droog)', 370, 13, 60, 7, 40, 'oats'],
  ['Muesli', 360, 9, 60, 8, 45], ['Granola', 450, 9, 64, 16, 45], ['Cornflakes', 357, 7, 84, 1, 30],
  ['Rijst (gekookt)', 130, 2.7, 28, 0.3, 150], ['Rijst (droog)', 360, 7, 79, 1, 75],
  ['Pasta (gekookt)', 158, 6, 31, 1, 180, 'spaghetti'], ['Pasta (droog)', 360, 12, 72, 2, 80],
  ['Volkoren pasta (gekookt)', 150, 6, 28, 1.5, 180], ['Aardappel (gekookt)', 87, 2, 20, 0.1, 200, 'patat aardappelen'],
  ['Frieten', 312, 3.4, 41, 15, 150, 'friet patat'], ['Couscous (gekookt)', 112, 3.8, 23, 0.2, 180],
  ['Quinoa (gekookt)', 120, 4.4, 21, 1.9, 150], ['Bulgur (gekookt)', 83, 3, 19, 0.2, 150],
  ['Wrap / tortilla', 310, 8, 50, 8, 60], ['Pita', 275, 9, 55, 1, 60], ['Volkoren crackers', 410, 10, 70, 9, 10],
  ['Rijstwafel', 387, 8, 81, 3, 10],
  // ── Vlees & gevogelte ──
  ['Kipfilet (rauw)', 110, 23, 0, 1.5, 120, 'kip'], ['Kipfilet (gebakken)', 165, 31, 0, 3.6, 120, 'kip'],
  ['Kalkoenfilet', 110, 24, 0, 1, 120], ['Rundsbiefstuk', 158, 26, 0, 6, 150, 'biefstuk steak'],
  ['Rundergehakt (rauw)', 250, 18, 0, 20, 100, 'gehakt'], ['Mager rundergehakt', 170, 20, 0, 10, 100, 'gehakt'],
  ['Varkenshaasje', 143, 21, 0, 6, 120], ['Spek', 540, 12, 1, 53, 20, 'bacon'], ['Hamburger', 250, 17, 3, 19, 100],
  ['Braadworst', 300, 13, 2, 27, 80, 'worst'], ['Salami', 380, 22, 1, 32, 20], ['Gekookte ham', 110, 18, 1, 3.5, 30, 'ham'],
  ['Kipworst', 170, 14, 2, 11, 80],
  // ── Vis ──
  ['Zalm (rauw)', 208, 20, 0, 13, 125], ['Zalm (gebakken)', 230, 25, 0, 14, 125], ['Tonijn (in water)', 116, 26, 0, 1, 100],
  ['Tonijn (in olie)', 190, 25, 0, 9, 100], ['Kabeljauw', 82, 18, 0, 0.7, 130, 'witvis'], ['Garnalen', 99, 24, 0.2, 0.3, 100],
  ['Mosselen', 86, 12, 4, 2, 150], ['Vissticks', 220, 12, 19, 11, 90], ['Haring', 210, 18, 0, 15, 100],
  ['Makreel', 205, 19, 0, 14, 100],
  // ── Zuivel & eieren ──
  ['Ei (gekookt)', 155, 13, 1.1, 11, 50, 'eieren'], ['Eiwit', 52, 11, 0.7, 0.2, 33], ['Volle melk', 64, 3.4, 4.7, 3.6, 250],
  ['Halfvolle melk', 47, 3.5, 4.8, 1.6, 250, 'melk'], ['Magere melk', 35, 3.5, 5, 0.1, 250],
  ['Sojadrink', 42, 3.3, 2.5, 1.8, 250, 'soja'], ['Yoghurt (naturel)', 61, 3.5, 4.7, 3.3, 150],
  ['Magere yoghurt', 42, 4, 6, 0.1, 150], ['Griekse yoghurt', 97, 9, 4, 5, 150], ['Magere kwark', 70, 12, 4, 0.2, 250, 'kwark'],
  ['Hüttenkäse', 98, 11, 3.4, 4.3, 100, 'cottage cheese'], ['Gouda kaas', 356, 25, 0, 28, 30, 'kaas'],
  ['Mozzarella', 250, 18, 1, 19, 30], ['Feta', 264, 14, 4, 21, 30], ['Parmezaan', 392, 36, 4, 25, 10],
  ['Smeerkaas light', 175, 12, 6, 11, 20], ['Boter', 717, 0.9, 0.1, 81, 10], ['Roomkaas', 342, 6, 4, 34, 20],
  ['Slagroom', 340, 2, 3, 36, 30],
  // ── Groenten ──
  ['Broccoli', 34, 2.8, 7, 0.4, 150], ['Wortel', 41, 0.9, 10, 0.2, 100], ['Tomaat', 18, 0.9, 3.9, 0.2, 100],
  ['Komkommer', 15, 0.7, 3.6, 0.1, 100], ['Sla', 15, 1.4, 2.9, 0.2, 50], ['Spinazie', 23, 2.9, 3.6, 0.4, 100],
  ['Paprika', 31, 1, 6, 0.3, 100], ['Courgette', 17, 1.2, 3.1, 0.3, 150], ['Bloemkool', 25, 1.9, 5, 0.3, 150],
  ['Champignons', 22, 3.1, 3.3, 0.3, 100], ['Erwten', 81, 5, 14, 0.4, 100], ['Maïs', 86, 3.3, 19, 1.2, 100],
  ['Ui', 40, 1.1, 9, 0.1, 50], ['Avocado', 160, 2, 9, 15, 70], ['Zoete aardappel (gekookt)', 90, 2, 21, 0.1, 150],
  ['Sperziebonen', 31, 1.8, 7, 0.2, 150, 'bonen'], ['Aubergine', 25, 1, 6, 0.2, 150], ['Pompoen', 26, 1, 6.5, 0.1, 150],
  // ── Fruit ──
  ['Appel', 52, 0.3, 14, 0.2, 120], ['Banaan', 89, 1.1, 23, 0.3, 120], ['Sinaasappel', 47, 0.9, 12, 0.1, 130, 'appelsien'],
  ['Druiven', 69, 0.7, 18, 0.2, 100], ['Aardbeien', 32, 0.7, 8, 0.3, 150], ['Blauwe bessen', 57, 0.7, 14, 0.3, 100, 'bosbessen'],
  ['Peer', 57, 0.4, 15, 0.1, 150], ['Kiwi', 61, 1.1, 15, 0.5, 75], ['Mango', 60, 0.8, 15, 0.4, 150],
  ['Ananas', 50, 0.5, 13, 0.1, 150], ['Watermeloen', 30, 0.6, 8, 0.2, 200, 'meloen'], ['Mandarijn', 53, 0.8, 13, 0.3, 80],
  ['Perzik', 39, 0.9, 10, 0.3, 120], ['Rozijnen', 299, 3, 79, 0.5, 30], ['Dadels', 282, 2.5, 75, 0.4, 30],
  // ── Peulvruchten, noten, zaden ──
  ['Linzen (gekookt)', 116, 9, 20, 0.4, 150], ['Kikkererwten (gekookt)', 164, 9, 27, 2.6, 150],
  ['Kidneybonen (gekookt)', 127, 9, 22, 0.5, 150, 'bonen'], ['Tofu', 144, 17, 3, 9, 100], ['Tempeh', 192, 20, 8, 11, 100],
  ['Hummus', 177, 5, 14, 11, 30], ['Pindakaas', 588, 25, 20, 50, 20], ['Amandelen', 579, 21, 22, 50, 25, 'noten'],
  ['Walnoten', 654, 15, 14, 65, 25, 'noten'], ['Cashewnoten', 553, 18, 30, 44, 25, 'noten'], ['Pinda’s', 567, 26, 16, 49, 25],
  ['Chiazaad', 486, 17, 42, 31, 15], ['Lijnzaad', 534, 18, 29, 42, 15], ['Zonnebloempitten', 584, 21, 20, 51, 15],
  // ── Vetten, olie, sauzen ──
  ['Olijfolie', 884, 0, 0, 100, 10, 'olie'], ['Zonnebloemolie', 884, 0, 0, 100, 10, 'olie'], ['Mayonaise', 680, 1, 1, 75, 15],
  ['Ketchup', 112, 1, 26, 0.1, 15], ['Pesto', 450, 5, 6, 45, 15], ['Sojasaus', 60, 8, 6, 0, 10], ['Vinaigrette', 450, 1, 5, 47, 15],
  // ── Dranken ──
  ['Cola', 42, 0, 11, 0, 330, 'frisdrank'], ['Cola zero', 0.3, 0, 0, 0, 330, 'light'], ['Sinaasappelsap', 45, 0.7, 10, 0.2, 250, 'fruitsap'],
  ['Appelsap', 46, 0.1, 11, 0.1, 250], ['Pils', 43, 0.5, 3.6, 0, 250, 'bier pintje'], ['Rode wijn', 85, 0.1, 2.6, 0, 150, 'wijn'],
  ['Energy drink', 45, 0, 11, 0, 250], ['Sportdrank (isotoon)', 26, 0, 6, 0, 500], ['Koffie (zwart)', 2, 0.1, 0, 0, 200],
  ['Thee', 1, 0, 0.2, 0, 200], ['Smoothie', 60, 1, 13, 0.5, 250],
  // ── Snacks & zoet ──
  ['Melkchocolade', 535, 8, 59, 30, 25, 'chocolade'], ['Pure chocolade', 546, 5, 46, 35, 25, 'chocolade'], ['Chips', 536, 7, 50, 34, 30],
  ['Koekjes', 480, 6, 65, 22, 15], ['Speculoos', 480, 6, 70, 19, 15], ['Pannenkoek', 227, 6, 28, 10, 80],
  ['Vanille-ijs', 207, 3.5, 24, 11, 100, 'ijs'], ['Cake', 380, 5, 53, 16, 60], ['Donut', 452, 5, 51, 25, 60],
  ['Snoep (gummies)', 343, 7, 78, 0.2, 30], ['Mueslireep', 420, 7, 65, 14, 30],
  // ── Kant-en-klaar & fastfood ──
  ['Pizza margherita', 266, 11, 33, 10, 300, 'pizza'], ['Pizza salami', 290, 12, 32, 13, 300, 'pizza'],
  ['Fastfood hamburger', 295, 17, 30, 12, 150], ['Cheeseburger', 303, 16, 28, 14, 120], ['Kapsalon', 200, 9, 15, 12, 400],
  ['Loempia', 200, 5, 25, 9, 80], ['Spaghetti bolognese', 130, 6, 16, 4, 350], ['Lasagne', 135, 7, 12, 6, 350],
  ['Sushi', 150, 5, 30, 1, 150], ['Durum / kebab', 215, 12, 20, 9, 300, 'kebab'], ['Groentesoep', 35, 1.5, 5, 1, 250, 'soep'],
  ['Quiche', 280, 9, 18, 19, 150],
  // ── Sportvoeding ──
  ['Whey eiwitpoeder', 380, 80, 8, 6, 30, 'proteine shake'], ['Eiwitshake (klaar)', 60, 10, 3, 1, 250, 'proteine'],
  ['Maltodextrine', 380, 0, 95, 0, 30], ['Energy gel', 250, 0, 62, 0, 40], ['Eiwitreep', 350, 20, 40, 10, 50, 'proteine reep'],
]

export const FOOD_DB: LocalFood[] = RAW.map(([name, kcal, p, c, f, serving, alias]) => ({ name, kcal, p, c, f, serving, alias }))

/** Zoek in de ingebouwde databank (op naam/synoniem). Treffers die vooraan beginnen staan bovenaan. */
export function searchLocalFoods(term: string, limit = 12): LocalFood[] {
  const q = term.trim().toLowerCase()
  if (q.length < 2) return []
  const scored: { f: LocalFood; score: number }[] = []
  for (const f of FOOD_DB) {
    const n = f.name.toLowerCase()
    const a = f.alias?.toLowerCase() ?? ''
    let score = 0
    if (n.startsWith(q)) score = 3
    else if (n.includes(q)) score = 2
    else if (a.includes(q)) score = 1
    if (score > 0) scored.push({ f, score })
  }
  scored.sort((x, y) => y.score - x.score || x.f.name.localeCompare(y.f.name))
  return scored.slice(0, limit).map((s) => s.f)
}
