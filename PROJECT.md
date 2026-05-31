# Krachtbal Live — Projectplan

Live-score en wedstrijdstatistiekplatform voor krachtbal. Het publiek volgt de match live (score, tijd, time-outs, kruisjes); een aantekenaar voert de wedstrijd in via een veldschema waarop elke worp wordt aangetikt. Het systeem leidt autonoom alle regels, score en statistieken af uit de ruwe worp-invoer.

## Stack

- **Next.js** (App Router) + **Payload CMS** voor admin/backend
- **Drizzle ORM** op **SQLite** (Railway Volume), zoals LenzieLenz
- **SSE** (Server-Sent Events) voor live push naar publiek — geen extra infra
- **GitHub** → **Railway** auto-deploy (Railpack, Node 22)

## Kernprincipe: event-sourcing

Elke worp is een immutable record (`Throws`). Score, balbezit, worpteller, kruisjes en alle statistieken worden **afgeleid** uit de worp-events — nooit apart opgeslagen. Zelfde patroon als ContentPosts/PublishAttempts in LenzieLenz. Eén undo = laatste worp-record verwijderen, staat herberekent vanzelf.

## Officiële regels die het systeem kent (bron: KVKBF reglement 01072025)

### Veldmaten (op schaal in het veldschema)
- Lengte 26m, inclusief beide doelgebieden 46m; breedte 14m
- Doelgebied: min. 10m lang (15m nieuwe terreinen)
- Vrijeworplijn: 4m vóór elke doellijn (dichtste werppunt naar doel)
- Middellijn verdeelt veld in twee gelijke helften
- Achterlijn op 1m van afsluiting

### Spel & score
- 2 ploegen × 4 veldspelers + max. 4 wissels + coach
- Speelduur: 2×25 min (U18/U20/senioren), 2×20 min (U12/U14/U16). Klok telt OP vanaf 0:00, pauzeert bij time-out/dode tijd
- Doelpunt: bal raakt grond in doelgebied van tegenstander na reglementaire worp
- **Rugworp-doelpunt telt DUBBEL (+2); nekworp +1**
- Aantal worpen is dynamisch naar opzetpunt:
  - Opzet vanaf eigen helft: 3 worpen (4 bij jeugd)
  - Opzet op tegenhelft: 2 worpen (3 bij jeugd)
- Tweede worp (na opzet eigen helft) moet middellijn raken/overschrijden, anders opzet tegenpartij

### Time-outs
- 2 per ploeg per helft (1 min). Scheidsrechter-onderbreking stopt klok maar telt niet mee in quotum. Beide in tijdlijn.

### Kruisjes (rechtstreeks buiten op laatste worp)
- Alleen de **laatste worp** (doelworp) die rechtstreeks buiten gaat zonder aanraking telt
- Per ploeg. Bij 3e → inworp vervangen door vrije worp voor tegenstander → reset naar 0

### Uitkomsten van een worp (afgeleid uit tikpositie)
- Tik in doelgebied = doelpunt (afstand + zone bewaard)
- Dubbele tik = gevangen → spel draait om, vangpunt = vertrek voor tegenploeg richting ander doel
- Buiten zijlijn = balverlies, tegenploeg herstart vanuit midden, geen kruisje
- Buiten achter doellijn, niemand raakte aan = kruisje, tegenploeg herstart vanaf doellijn (systeem vraagt: aangeraakt? zo ja → geen kruisje)

## Invoer-flow (aantekenaar)

1. **Match aanmaken**: ploegen, categorie (→ balgewicht, worpaantal, speelduur), spelers + rugnummers
2. **Wedstrijdveld**: veldschema op schaal, klok, stand, tellers
3. **Start**: klok starten + opzettende ploeg aanduiden
4. **Per worp**: speler (rugnummer) → eventueel rugworp-toggle → plek tikken (1× grond / 2× gevangen)
5. Systeem leidt autonoom af: afstand (hemelsbreed), zone (links/midden/rechts), worpteller, scoren/punten, balbezit-omkering, kruisjes, stand
6. **Undo**: laatste worp terugnemen (vangnet, geen bevestiging vooraf)

## Datamodel (Payload collections)

- **Teams**: naam, logo, categorie
- **Players**: naam, team, positie (achter/vleugel/barage), rugnummer
- **Matches**: thuis/uit, datum, categorie, status (scheduled/live/finished), helft, klokstaat
- **Throws** (immutable): match, possessionId, speler, team, worpnummer, type (nek/rug), uitkomst (goal/caught/out_side/out_back), landingspunt (x,y), afstand, zone, periode, gameClock
- **Possessions**: match, team, opzetpunt, startTijd, einduitkomst
- **MatchEvents**: time-outs, scheidsrechter-onderbrekingen, helft start/eind (voor tijdlijn)

## Schermen

- `/` of `/live` — publiek scorebord (SSE): score, tijd + helft, time-outs, kruisjes, event-tijdlijn
- `/match/[id]` — publieke matchdetail + statistieken (FotMob-stijl: vergelijkende balken + shot map per speler)
- `/studio/...` — Payload admin: matches/teams/spelers beheren
- `/scorekeeper/[id]` — tablet-vriendelijk invoerscherm met veldschema

## Bouwvolgorde (fasen)

1. Project-setup: Next.js + Payload + Drizzle/SQLite, Railway-deploy werkend
2. Collections + schema (Teams, Players, Matches, Throws, Possessions, MatchEvents)
3. Regellogica-module (`lib/krachtbal-rules.ts`): afstand, zone, worpteller, score, balbezit, kruisjes — puur en getest
4. Scorekeeper-veldscherm: veldschema op schaal, tik-invoer, undo, klok
5. SSE-stream + publiek scorebord
6. Statistiekpagina: aggregaties per speler, shot map
7. Wedstrijdblad-export (geldig digitaal aantekenblad)

## Statistieken (jouw onderscheidende kracht)

Per speler bevraagbaar: aantal worpen, verdeling 1e/2e/laatste, grond vs gevangen ratio, gemiddelde + max worpafstand, doelpunten (nek/rug), zoneverdeling links/midden/rechts. Geen bestaande krachtbaltool biedt dit — de federatie registreert enkel doelpunten, scorernummer, time-outs en kruisjes op papier.
