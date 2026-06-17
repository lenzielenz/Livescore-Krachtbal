# Roadmap — Krachtbal Live naar een nieuw niveau (zonder AI)

Vier richtingen, geverifieerd tegen de huidige code (juni 2026). Per richting: wat
er **al** is, wat ontbreekt, het plan, en welke bestanden je raakt. Effort is
relatief (S/M/L), niet in uren.

> Vertrekpunt: `AUDIT-2026-06.md` schetste het pad naar nationale uitrol. Een deel
> is intussen opgelost — deze roadmap gaat uit van de **actuele** stand, niet de audit.

## Samenvatting & aanbevolen volgorde

| Fase | Thema | Waarom nu | Effort | Risico |
|---|---|---|---|---|
| **1** | Hardening van de kern | Correctheid — beschermt de live-match | S–M | Laag |
| **2** | Data-moat publiek tonen | Grootste zichtbare sprong voor fans/spelers | M | Laag* |
| **3** | Realtime op schaal (Redis) | Voorwaarde vóór je horizontaal schaalt | M–L | Middel |
| **4** | Officieel federatie-record | Strategische moat; deels extern afhankelijk | S–M | Laag |

\* mits de privacy-keuze (zie Fase 2) goed gezet wordt.

**Korte versie:** Fase 1 is klein en fixt een echte bug (dubbele worp bij retry).
Fase 2 is de grote, laag-risico "wow" voor je publiek — je toont gewoon wat je al
berekent. Fase 3 is pas nodig wanneer je écht meerdere instances draait. Fase 4 is
bijna af; wat rest hangt deels van de KVKBF af.

---

## Fase 1 — Hardening van de kern (S–M, laag risico)

### 1a. Idempotente worp-registratie *(de belangrijkste)*
**Staat:** `SimpleScorekeeper` (standaardmodus voor echte wedstrijden) is al
offline-bestendig: lokale queue in `localStorage`, optimistische UI, auto-retry bij
herverbinding, "📴 Offline"-banner. Maar `recordThrow` dedupliceert **niet**.
**Gat:** valt de verbinding weg ná het opslaan maar vóór het antwoord, dan stuurt de
retry dezelfde worp opnieuw → **dubbele worp** in de event-stream → foute score.
**Plan:** client genereert een `clientThrowId` (UUID) per worp; server slaat die op
de `throws`-collection op met een unieke index en negeert een al-bestaande id
(idempotent). Queue stuurt dezelfde id bij retry.
**Raakt:** `src/lib/match-engine.ts` (`recordThrow`), `src/collections/Throws.ts`
(nieuw veld + unique index + migratie), `SimpleScorekeeper.tsx`,
`api/match/[id]/action/route.ts`.

### 1b. Offline-pariteit voor de volledige Scorekeeper
**Staat:** de veldschema-`Scorekeeper` (analyse/demo) heeft géén offline-queue; bij
netwerkuitval gaat de worp verloren met een foutmelding.
**Plan:** dezelfde queue/optimistische-UI/banner als `SimpleScorekeeper` hergebruiken.
**Raakt:** `src/app/(frontend)/scorekeeper/[id]/Scorekeeper.tsx` (+ gedeelde queue-hook).

### 1c. Scheidsrechter bevestigt de eindscore
(Zie ook Fase 4 — klein maar strategisch, past hier qua omvang.)
**Staat:** de scheidsrechter geeft akkoord om te **starten**, maar tekent de
**eindscore** niet expliciet af.
**Plan:** veld "eindscore bevestigd" (checkbox + naam + tijdstip) in de aftekenflow.
**Raakt:** `src/collections/MatchSheets.ts`, `api/matchsheet/[matchId]/referee`,
`aftekenen/[matchId]/AftekenenPanel.tsx`.

---

## Fase 2 — Data-moat publiek tonen (M, laag risico)

Je grootste onderscheidende kracht. Je **berékent** al enorm veel, maar het zit
**allemaal achter de coach/admin-login** (`/analyse/*`). Publiek zien bezoekers enkel
het live-scorebord, de tijdlijn en de basisstand — geen shot map, geen speler- of
ploegprofiel. Dit is grotendeels *publiceren wat al bestaat*, geen nieuwe wiskunde.

### Reeds berekend, nu nog verborgen
`season-stats`, `season-trend`, `team-radar`, `radar-stats`, `expected-points` (xP),
`attack-patterns`, `player-danger` (gevaarzones), `player-movers`, `matchup`
(head-to-head), `team-report`, `speelstijl`, `championship`.

### Plan (in volgorde van impact)
1. **Publiek speler-profiel** `/spelers/[id]`: seizoensstats + shot map + gevaarzone
   + vormtrend. (Bouwt op `buildSeasonStats`, `buildPlayerDanger`, `MatchStats`.)
2. **Publiek ploeg-profiel** `/ploegen/[id]`: agg-stats, topscorers, zoneverdeling,
   meerjaren-trend, speelstijl-badge. (Bouwt op `buildTeamReport`, `season-trend`.)
3. **Shot map + kerncijfers op de publieke matchpagina** `/match/[id]` (nu enkel in
   `/analyse`). (`MatchStats` hergebruiken.)
4. **Publieke seizoensranglijst**: topscorers, conversie, xP-overperformers.
5. **Championship-status** op `/rangschikking` (wiskundig kampioen / punten nodig).

### ⚠️ Privacy-keuze vooraf (blokkerend)
De audit (§4) flagde dat **geboortedata van (jeugd)spelers** wereld-leesbaar waren.
Voor publieke profielen: beslis expliciet **welke velden publiek mogen** (naam +
sportstats wél; geboortedatum/PII niet), en pas de read-access op `Players` aan.
Overweeg een opt-out voor jeugd. Dit zetten we vast vóór we iets publiceren.
**Raakt:** `src/collections/Players.ts` (access), nieuwe routes onder
`src/app/(frontend)/{spelers,ploegen}/`, `src/lib/access.ts`.

---

## Fase 3 — Realtime op schaal met Redis (M–L, middel risico)

**Nodig wanneer:** je meer dan één app-instance draait (drukke competitieweekends,
horizontale schaal op Railway). Bij één instance werkt alles correct — dit is een
**voorwaarde vóór** opschalen, geen acute bug.

**Staat:** álle live-engagement-state is per-instance in het geheugen
(`src/lib/match-channel.ts`): emoji-reacties, viewer-count, shoutouts, voorspel- en
MVP-stemmen. Ook de per-IP-cap en rate-limit (`src/lib/sse-hub.ts`).

**Wat breekt bij 2+ instances:**
- Emoji- en viewer-tellers **splitsen** — niemand ziet het echte totaal.
- Shoutouts verschijnen enkel op de instance waar ze binnenkwamen.
- MVP-/voorspelstemmen: **lost-update race** (read-modify-write naar DB) → stemmen
  verdwijnen.
- Per-IP-limieten gelden per instance → zwakkere bescherming.

**Plan:**
1. Redis-service (Railway) + één `ioredis`-singleton (`src/lib/redis.ts`).
2. Engagement-state naar Redis met **atomic** counters: `INCR`/`HINCRBY` voor
   reacties/stemmen, `LPUSH`+`LTRIM` voor shoutouts, `SETEX`+TTL-heartbeat voor
   viewer-count. Eén Lua-script per teller voor atomiciteit.
3. Per-IP-cap + rate-limit naar Redis (`INCR`+`EXPIRE`).
4. *(Optioneel)* één gedeelde score-poller per cluster i.p.v. per instance.
5. Load-test met 2 instances (`scripts/loadtest.ts` bestaat al).

**Raakt:** `src/lib/match-channel.ts`, `src/lib/sse-hub.ts`,
`api/match/[id]/{stream,react,state}`, tornooi-streams. Fallback naar in-memory
houden wanneer Redis niet geconfigureerd is (lokaal/dev).

---

## Fase 4 — Officieel KVKBF-record (S–M, laag risico — deels extern)

**Staat:** verrassend ver. Alle audit-§5-PDF-gaten zijn opgelost: per-helft-scores,
scorers (rugnummer + naam), **ingebedde handtekeningen**, opgeslagen +
herexporteerbare PDF, immutabiliteit na `ingediend`, audit-trail (`createdBy` op
worpen, `overrideLog` op het blad).

**Wat nog rest:**
1. **Eindscore-bevestiging door de scheidsrechter** — zie Fase 1c.
2. **Federatie-API-integratie**: `src/lib/submit/federation.ts` is nu een **stub**
   (`FEDERATION_UPLOAD_URL` + token). Vereist een echt KVKBF-endpoint → **hangt af
   van de federatie**. Alternatief: e-mail+PDF formaliseren als officieel kanaal.
3. **Per-veld wijzigingsaudit na indienen** (versioning/snapshots) — nu enkel
   status-overgangen in `overrideLog`.
4. *(Optioneel)* **aantekenaar-handtekening** (integriteit van de scorers-data).
5. **Extreme-PDF-testcases** (zeer hoge scores, lange wissel-/sanctielijsten).

**Raakt:** `src/collections/MatchSheets.ts`, `src/lib/submit/{index,pdf,federation}.ts`,
`api/matchsheet/[matchId]/*`.

---

## Wat ik bewust NIET aanraad

- **AI in het platform** — expliciet niet gewenst, en niet nodig: de hefbomen
  hierboven zijn groter.
- **Nieuwe statistiek-wiskunde bouwen** vóór je de bestaande publiek toont (Fase 2).
- **Redis introduceren** zolang je op één instance draait — voeg complexiteit toe
  zonder baat.
