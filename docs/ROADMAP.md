# Roadmap — Krachtbal Live naar een nieuw niveau (zonder AI)

Vier richtingen, geverifieerd tegen de huidige code (juni 2026). Per richting: wat
er **al** is, wat ontbreekt, het plan, en welke bestanden je raakt. Effort is
relatief (S/M/L), niet in uren.

> Vertrekpunt: `AUDIT-2026-06.md` schetste het pad naar nationale uitrol. Een deel
> is intussen opgelost — deze roadmap gaat uit van de **actuele** stand, niet de audit.

## Samenvatting & aanbevolen volgorde

| Fase | Thema | Effort | Risico | Status |
|---|---|---|---|---|
| **1** | Hardening van de kern | S–M | Laag | ✅ gemerged |
| **2** | Data-moat publiek tonen | M | Laag* | ✅ gemerged |
| **3** | Realtime op schaal (Redis) | M–L | Middel | ⏸ uitgesteld tot je opschaalt |
| **4** | Officieel federatie-record | S–M | Laag | ◐ deels (eindscore-bevestiging gemerged) |

\* mits de privacy-keuze (zie Fase 2) goed gezet wordt.

**Voortgang (juni 2026):** Fase 1 (idempotente acties), Fase 2 (publieke speler-/
ploegprofielen + shot map) en Fase 4-kern (scheidsrechter bevestigt de eindstand)
zijn gebouwd, getest en gemerged. **Fase 3** is bewust uitgesteld tot er meer dan
één app-instance draait (zie de Fase 3-sectie voor het runbook). Resterend in
**Fase 4**: federatie-API (vereist een KVKBF-endpoint), per-veld versioning, en de
eindscore-bevestiging mee in de PDF.

---

## Fase 1 — Hardening van de kern (S–M, laag risico)

### 1a. Idempotente worp-registratie — ✅ gebouwd (anders dan gepland)
**Staat:** klaar, maar niet via een `clientThrowId` op de worp. De dedup zit één laag
hoger en dekt daardoor **elke** actie, niet enkel een worp: elke actie uit de
wachtrij draagt een vaste `opId` (`use-action-queue.ts`), en
`api/match/[id]/action/route.ts` geeft bij een al verwerkte `opId` exact hetzelfde
antwoord terug zonder de actie opnieuw toe te passen (collection `processed-ops`).
Een heruitgezonden worp, undo, time-out of wissel telt dus nooit dubbel.
**Daarom geen `clientThrowId` meer nodig** — dat zou een tweede, smallere dedup
naast deze zijn.

### 1b. Offline-pariteit voor de volledige Scorekeeper — ✅ gebouwd (aug 2026)
**Staat:** klaar. De wachtrij uit `SimpleScorekeeper` is naar een gedeelde hook
getild (`src/lib/use-action-queue.ts`: localStorage, volgorde-behoud, auto-nasturen,
vaste opId per actie) en het veldschema (`Scorekeeper.tsx`) gebruikt ze ook: offline
= de worp wordt bewaard + amberkleurige banner, en na herverbinding exact één keer
toegepast (dedup via `processed-ops`). Unit-tests: `tests/unit/use-action-queue.unit.spec.ts`.

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

**Voortgang (aug 2026):** 1 (`/spelers/[id]`), 2 (`/ploegen/[id]`) en 3 (shot map op
`/match/[id]`) staan publiek. 4 bestaat voor de jeugd (`/superster`) en staat nu ook
per reeks onder de rangschikking (topscorers uit `buildSuperstars`). 5 is gebouwd:
`clinchStatus` + `titelBoodschap` tonen boven de tabel of de leider al wiskundig
kampioen is of hoeveel zeges ze nog nodig heeft, met 🏆 op de eerste rij; verder
van de meet een titelkans uit een simulatie van de rest van het seizoen (`titelKansen`).
Blijft over: een volledige seizoensranglijst met conversie en xP-overperformers.

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

> **Status: bewust uitgesteld** (beslissing juni 2026) zolang de app op **één**
> instance draait. Dan verandert deze fase functioneel niets en zou ze enkel
> ongeteste, dormante code aan de live-kern toevoegen. Pak ze op zodra je horizontaal
> opschaalt (2+ Railway-instances). Onderstaande is het runbook voor dat moment.

**Staat:** álle live-engagement-state is per-instance in het geheugen. Concreet:
- `src/lib/match-channel.ts` → de `channels`-Map per match met: `reactions`/`totals`
  (emoji), `viewerKeys` (viewer-count), `shoutouts` (ringbuffer), `pollVotes`,
  `mvpVotes`, plus per-instance timers (`poll`, `flush`, debounced saves).
- `src/lib/sse-hub.ts` → `hubs` (score-poller per match — correct maar dubbel werk
  bij 2 instances), `perIp` (verbindingscap), `buckets` (rate-limit).

**Wat breekt bij 2+ instances:**
- Emoji- en viewer-tellers **splitsen** — niemand ziet het echte totaal.
- Shoutouts verschijnen enkel op de instance waar ze binnenkwamen.
- MVP-/voorspelstemmen: **lost-update race** (read-modify-write naar DB) → stemmen
  verdwijnen.
- Per-IP-cap + rate-limit gelden per instance → zwakkere bescherming.

**Runbook (wanneer je opschaalt):**
1. Railway: voeg een **Redis-service** toe → zet `REDIS_URL` in de app-omgeving.
2. `pnpm add ioredis` + één lazy singleton `src/lib/redis.ts` die **null** teruggeeft
   als `REDIS_URL` ontbreekt (→ strikte in-memory fallback, huidige werking blijft).
3. **Pub/sub fan-out**: publiceer elke broadcast (reacties/shoutouts/score/viewers)
   op een Redis-kanaal `match:<id>`; elke instance abonneert en her-broadcast remote
   events naar z'n lokale SSE-abonnees (met een loop-guard tegen her-publiceren).
4. **Atomic aggregaten** (alleen als Redis aan): `HINCRBY` voor reacties/poll/MVP,
   `LPUSH`+`LTRIM` voor shoutouts, `SETEX`+TTL-heartbeat voor viewer-count;
   periodiek naar de DB flushen zoals nu. Vervangt de read-modify-write-race.
5. Per-IP-cap + rate-limit (`sse-hub.ts`) naar Redis `INCR`+`EXPIRE`.
6. *(Optioneel)* leader-election zodat slechts één instance per match de DB pollt.
7. **Valideer**: `pnpm loadtest --url … --match 1 --viewers 500 --react` tegen 2
   instances; controleer dat tellers/viewers/shoutouts consistent zijn over instances.

**Veiligheidsmodel:** alle Redis-paden achter `if (redis) { … }` met de bestaande
in-memory code als `else` — zonder `REDIS_URL` blijft de live-kern ongewijzigd.

**Raakt:** `src/lib/match-channel.ts`, `src/lib/sse-hub.ts`,
`api/match/[id]/{stream,react,state}`, tornooi-streams. **Niet** te mergen zonder
een 2-instance load-test (kan niet in CI/dev gevalideerd worden).

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
