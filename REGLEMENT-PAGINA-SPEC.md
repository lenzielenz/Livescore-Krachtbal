# Aanvulling — Publieke reglementpagina

> Voeg toe aan de specificatie. Hoort bij `PROJECT.md`, `KRACHTBAL-REGLEMENT.md` en `WEDSTRIJDBLAD-PROMPT.md`.

## Doel

Het volledige krachtbalreglement is raadpleegbaar als publieke pagina op het platform zelf. Dezelfde tekst dient drie doelen tegelijk:
1. **Referentie voor de regellogica** (zoals nu in de codebase).
2. **Publiek raadpleegbaar** voor scheidsrechters, coaches, spelers en bezoekers.
3. **SEO/AI-vindbaarheid** — het reglement is nergens anders goed doorzoekbaar online; dit maakt het platform de natuurlijke vindplaats.

## Kernprincipe: één bron van waarheid

`KRACHTBAL-REGLEMENT.md` is de **canonieke bron**. De publieke pagina rendert exact diezelfde markdown — niet een tweede, los onderhouden kopie. Zo lopen de regels die het systeem afdwingt en de regels die het publiek leest nooit uiteen.

Praktisch: importeer/lees de markdown-file at build time (of via een Payload-collectie die uit dezelfde bron wordt gevoed) en render hem als HTML. Eén edit aan het reglement = automatisch bijgewerkt op de pagina én in de referentie.

## Te bouwen

- **Route**: `/reglement` (NL). Later eventueel taalvarianten.
- **Rendering**: markdown → HTML met nette typografie; behoud de hoofdstuk/sectiestructuur.
- **Inhoudsopgave**: automatisch gegenereerd uit de koppen, met ankerlinks (sticky zijbalk of bovenaan op mobiel).
- **Zoekfunctie/filter** binnen de pagina (client-side volstaat) — handig voor scheidsrechters die snel één item zoeken.
- **PDF-download**: link naar het officiële RCVK-PDF als brondocument + bronvermelding (KVKBF, geldig vanaf 01/07/2025).
- **Diepe links**: elke sectie een eigen anchor, zodat je vanuit andere delen van de app (bv. een betwiste spelsituatie in het wedstrijdblad) rechtstreeks naar de relevante regel kunt linken.

## Koppeling met de rest van het platform

Waar het systeem een regel afdwingt of een waarschuwing toont (bv. "speler buiten toegelaten categorie", "3e rechtstreeks buiten = vrije worp"), link naar het corresponderende anker op `/reglement`. Zo wordt de uitleg-bij-de-regel altijd consistent met de officiële tekst.

## SEO (volgens LenzieLenz-aanpak)

- Schema.org `Article` of `WebPage` + `BreadcrumbList`.
- Markdown-mirror / `llms.txt`-vermelding zodat AI-crawlers het reglement kunnen citeren.
- Duidelijke bronvermelding + datum van de reglementsversie (belangrijk: regels wijzigen jaarlijks per 1 juli).

## Onderhoud

Reglement wordt jaarlijks per 1 juli aangepast door de KVKBF. Bouw het zo dat een update = de markdown-file vervangen door de nieuwe versie, met een zichtbare "geldig vanaf"-datum op de pagina. Overweeg een vers-veld zodat oudere versies raadpleegbaar blijven.
