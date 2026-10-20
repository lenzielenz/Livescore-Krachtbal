# CLAUDE.md

Instructies voor AI-agents (Claude Code) die aan dit project werken. Lees dit
eerst — het bespaart je rondzoeken en voorkomt dat je de kern-invarianten breekt.

## Wat dit is

**Krachtbal Live** — live-score- en wedstrijdstatistiekplatform voor krachtbal
(Vlaamse sport, federatie KVKBF). Het publiek volgt een match live (score, klok,
time-outs, kruisjes); een aantekenaar voert elke worp in via een veldschema. Het
systeem leidt **alle** regels, score en statistieken autonoom af uit de ruwe
worp-events.

Naast de kern (livescore) is het uitgegroeid tot een breed clubplatform: training
& voeding, pronostiek, badges/fan-engagement, tornooien, bekerfinale, scheids­
rechters & vergoedingen, nieuws, en een digitaal wedstrijdblad.

Volledig projectplan + officiële regels: **`PROJECT.md`** en
**`KRACHTBAL-REGLEMENT.md`**. Wat er van dat reglement al dan niet geïmplementeerd
is — per ⚙️ SYSTEEM-regel, met de bewuste afwijkingen — staat in
**`docs/REGELS-CONFORMITEIT.md`**; lees dat vóór je aan de spellogica of de
afgeleide statistiek raakt, en werk het bij als je een regel verandert. Taal van
UI, comments, commits en documentatie is **Nederlands**.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Payload CMS 3** voor admin/backend (collections + globals in `src/`)
- **DB**: Postgres in productie (Railway-service), **SQLite** lokaal — afgeleid uit
  `DATABASE_URL` in `src/payload.config.ts`. Géén losse Drizzle-config; Payload
  beheert het schema.
- **SSE** (Server-Sent Events) voor live push — geen extra realtime-infra
- **pnpm** (zie `packageManager` in `package.json`), Node ≥ 24.14
- Deploy: **GitHub → Railway** (Railpack). Zie `docs/DEPLOY.md`.
- Twee omgevingen, zelfde code: **live** (aantekenmodus uit de settings, nu supporters) en de
  **federatie-testomgeving** (eigen databank, altijd federatiemodus, `PLATFORM_OMGEVING=federatie-test`).
  Zie `src/lib/omgeving.ts` en `docs/TESTOMGEVING.md`. De volledige federatieflow (clubs, registratie,
  kalender, scheidsrechters, referendum) en wie wat mag: `docs/FEDERATIEFLOW.md`.

## Commando's

```bash
pnpm dev               # dev server (http://localhost:3000, admin op /admin)
pnpm build             # productiebuild
pnpm typecheck         # tsc --noEmit   ← draai dit altijd na codewijzigingen
pnpm lint              # eslint
pnpm test:unit         # vitest unit (tests/unit) — snel
pnpm test:int          # vitest integratie (tests/int)
pnpm test:e2e          # playwright (tests/e2e)
pnpm generate:types    # Payload-types regenereren → src/payload-types.ts
pnpm seed              # demo-data
```

Na een wijziging: minstens `pnpm typecheck` + relevante `pnpm test:unit`.
`pnpm test` draait int + e2e (traag); doe dat enkel als het nodig is.

## Kernprincipe: event-sourcing (NIET breken)

Elke worp is een **immutable** record (`throws`-collection). Score, balbezit,
worpteller, kruisjes en **alle** statistieken worden **afgeleid** uit de
worp-events — **nooit apart opgeslagen**. Eén undo = de laatste worp verwijderen;
de staat herberekent vanzelf.

Concreet betekent dit:

- **Bewerk nooit een bestaande `throw`.** Immutability is code-enforced
  (`src/collections/Throws.ts`: `access.update = () => false`). Corrigeren =
  verwijderen + opnieuw aanmaken (undo-flow).
- **Sla geen afgeleide staat op.** Voeg geen "score"- of "balbezit"-velden toe die
  je apart bijwerkt. Leid ze af. Dubbele bron = dubbeltellen = bugs.
- Hetzelfde patroon geldt voor de afgeleide statistiek-/aggregatiemodules in
  `src/lib/`.

## Architectuur in het kort

```
Aantekenaar tikt worp  →  match-engine (mutatie, atomair + lock)
                              │  schrijft immutable Throws/Possessions/MatchEvents
                              ▼
                          Payload + DB  ──poll──►  sse-hub (1 poller per match)
                                                      │  fan-out naar alle kijkers
                                                      ▼
                                          Publiek scorebord / kantine-TV / cast
```

- **`src/lib/match-engine.ts`** — hét hart. Alle mutaties (`startMatch`,
  `recordThrow`, `undoLastThrow`, `finishMatch`, time-outs, lineup…) én de
  state-builders (`buildMatchState`, `buildMatchStats`, `buildTimeline`,
  `buildScoreboards`). Begin hier voor alles wat met de live-match te maken heeft.
- **`src/lib/krachtbal-rules.ts`** — pure regellogica (afstand, zone, worpteller,
  score, balbezit, kruisjes). Puur en getest; geen DB. Wijzig regels hier.
- **`src/lib/sse-hub.ts`** + **`src/lib/match-channel.ts`** — gedeelde SSE-laag:
  **één** poller per sleutel (bv. `match:42`) fan-out naar alle abonnees, plus
  per-IP-cap, rate-limiting en `SSE_HEADERS` (incl. `X-Accel-Buffering: no`).
- **`src/lib/db-lock.ts`** — Postgres advisory lock per wedstrijd (cross-instance),
  bovenop een in-process mutex. No-op op SQLite.
- **`src/collections/*.ts`** — 24 Payload-collections (datamodel). Globals:
  `src/globals/{Season,Settings}.ts`.
- **Live-endpoints**: `src/app/api/match/[id]/{action,state,stream,react}/route.ts`.
- **Schermen** (App Router, `src/app/(frontend)/`): `/live`, `/match/[id]`,
  `/scorekeeper/[id]`, `/kantine`, plus de bredere platform-routes (`/hub`,
  `/training`, `/pronostiek`, `/clubs`, `/federatie`, …).

Uitgebreide kaart: **`docs/ARCHITECTURE.md`**.

## Harde invarianten & valkuilen

Dit project heeft een externe pre-rollout-audit gehad (`AUDIT-2026-06.md`). Respecteer:

1. **Mutaties zijn atomair + gelockt.** `recordThrow`/`undo` enz. lopen onder een
   lock (`db-lock.ts`) — voeg geen mutatiepaden toe die de balbezit-keten buiten
   die bescherming aanpassen.
2. **Score-/mutatie-endpoints vereisen auth.** Publieke schrijftoegang op
   match-/tornooi-acties is een beveiligingsfout. Gebruik de bestaande
   auth-helpers (`src/lib/api-auth.ts`, `auth-user.ts`, `access.ts`).
3. **Finished-guard.** Een afgelopen match (`status: finished`) mag niet meer
   muteerbaar zijn.
4. **SSE schaalt via de gedeelde hub.** Open nooit een eigen `setInterval` dat per
   connectie de DB polt — gebruik `subscribe()` uit `sse-hub.ts`.
5. **GDPR.** Medische data (`collections/Accidents.ts`) is gevoelig: lees-access
   beperken, geen IDOR op PDF's.
6. **Wedstrijdblad-PDF**: WinAnsi-fonts (pdf-lib) kunnen crashen op niet-Latin
   glyphs (bv. ✓). Wees voorzichtig met tekens in `src/lib/submit/`.

## Conventies

- **Collection wijzigen** → daarna `pnpm generate:types`. De **importMap** wordt
  automatisch bijgewerkt door een PostToolUse-hook (`.claude/settings.json`) bij
  edits in `collections/`, `globals/` of `components/admin/`.
- **DB-schema**: productie via migraties (`src/migrations/`, Railway draait
  `payload migrate`). Lokaal (SQLite) maakt dev-push het schema vanzelf aan. Bij
  schemawijzigingen voor prod: genereer een migratie i.p.v. handmatig te editen.
- **Stijl**: Prettier (`.prettierrc.json`) + ESLint (`eslint.config.mjs`). Volg de
  bestaande bestanden (geen puntkomma's, single quotes).
- **Commits**: Nederlands, beschrijvend — *wat verandert er en waarom*, vaak met
  een `(#NNN)`-PR-nummer achteraan. Volg de toon van `git log`.
- **lib-modules** zijn fijnmazig en single-purpose (~100 stuks). Zoek eerst een
  bestaande module voordat je nieuwe logica toevoegt; veel afgeleide stats bestaan
  al (`season-stats`, `team-radar`, `win-probability`, `expected-points`, …).

## Integraties (env)

Optioneel, app draait zonder. Zie `.env.example`:

- **Web Push / VAPID** — push-meldingen (`src/lib/push.ts`, `web-push`).
- **Chromecast** — `NEXT_PUBLIC_CAST_APP_ID`, receiver op `/cast-tv`
  (`docs/CHROMECAST.md`).
- **Media** — clublogo's op een Railway-Volume (`MEDIA_DIR` / `RAILWAY_VOLUME_MOUNT_PATH`).
- **ffmpeg-static** — webm→mp4 voor replay-clips (`serverExternalPackages`).

## Doe NIET

- Geen afgeleide staat (score/balbezit/stats) los opslaan of een `throw` bewerken.
- Geen per-connectie DB-polling voor live updates.
- Geen ongeauthenticeerde mutatie-endpoints.
- Geen secrets committen (`PAYLOAD_SECRET`, VAPID-private, DB-URL).
- `src/payload-types.ts` niet handmatig editen — het is gegenereerd.
