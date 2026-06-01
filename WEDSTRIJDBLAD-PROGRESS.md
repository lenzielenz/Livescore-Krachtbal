# WEDSTRIJDBLAD-PROGRESS.md

Voortgang van de **wedstrijdblad-laag** bovenop het live-score platform.
Bron-specs: [WEDSTRIJDBLAD-PROMPT.md](WEDSTRIJDBLAD-PROMPT.md), [LEEFTIJDSCATEGORIE-SPEC.md](LEEFTIJDSCATEGORIE-SPEC.md), [REGLEMENT-PAGINA-SPEC.md](REGLEMENT-PAGINA-SPEC.md).

## Beslissingen (met Robin bevestigd)

- **Federatie-upload**: geen echte API → bij indienen PDF mailen naar beide clubs + federatie; gebouwd als **adapter-stub** zodat een echte API later inplugbaar is.
- **Handtekening**: akkoord + timestamp + **getekende naam op canvas** (geen externe e-signing).
- **Hosting**: zelfde Railway-service + domein als het live-score platform (één app).
- **Knipjes type B (sancties)**: **configureerbaar met defaults**; drempel als federatie-instelling. Echte boetelijst-cijfers vult Robin later in.
- **Categorie-naamgeving**: codebase gebruikt `senioren` (niet `senior` zoals de spec); de leeftijdsladder volgt de codebase.

## Fasen

| # | Fase | Status |
|---|------|--------|
| 1 | Season-global + Members-velden op Players + vergunningsbol | ✅ |
| 2 | Categorie-logica (eigenCategorie/magSpelen) + tests + tonen op lid | ✅ |
| 3 | Rollen & rechten (4 nieuwe rollen + access-control) | ✅ |
| 4 | MatchSheets state-machine + override-log + Officials | ✅ |
| 5 | Opstelling-flow (laatst-gekende voorstel + selectiefilters) | ✅ |
| 6 | Scheidsrechter-flow (vrijgave-timing, keuring-checklist, wedstrijdklaar) | ✅ |
| 7 | Post-match (canvas-handtekeningen + PDF + Resend e-mail + federatie-adapter stub) | ✅ |
| 8 | Knipjes type B + dashboards + /reglement-pagina | ✅ |

Alle 8 fasen gebouwd. `pnpm typecheck` ✓, `pnpm test:unit` ✓ (68 tests), `pnpm build` ✓.

## Wat waar staat (kernbestanden)

- **Logica (getest):** `src/lib/age-categories.ts`, `src/lib/lineup.ts`, `src/lib/matchsheet-workflow.ts`, `src/lib/sanctions.ts`, `src/lib/access.ts`.
- **Collecties/globals:** `Players` (uitgebreid), `Officials`, `MatchSheets`, `Sanctions`, `Clubs` (+email), globals `Season` + `Settings`.
- **Submit-laag:** `src/lib/submit/` (pdf via pdf-lib, mail via Resend-fetch, federatie-adapter stub).
- **Schermen:** `/opstelling/[matchId]`, `/scheidsrechter/[matchId]`, `/aftekenen/[matchId]`, `/knipjes`, `/reglement`.
- **API:** `/api/matchsheet/[matchId]/{lineup,referee,sign,submit}`.

## Deploy (Railway/Postgres) — migratie gedaan ✅

Postgres-migratie `src/migrations/20260601_172424_wedstrijdblad.ts` gegenereerd, gecommit en
gepusht (commit `cc32386`). Railway draait `payload migrate` bij deploy en past het schema toe.
Lokaal blijft SQLite met auto-push. Bij toekomstige schemawijzigingen opnieuw
`pnpm payload migrate:create <naam>` draaien (geen live DB-verbinding nodig — Payload genereert
uit het schema-verschil).

## Open beslissingen / acties voor Robin

- Exacte knipjes-/sanctieregels en drempels (federatie-boetelijst) → nu default drempel 3 in Settings.
- `RESEND_API_KEY` + `MATCHSHEET_MAIL_FROM` zetten voor échte e-mail (anders stub, geen fout).
- `FEDERATION_UPLOAD_URL` (+ token) zetten als/wanneer er een federatie-API komt.
- Seizoen instellen onder **Federatie › Seizoen** (startjaar) — anders geen categorie-berekening.
- Club-e-mailadressen invullen zodat het PDF-blad na indienen aankomt.

## Bekende vervolgpunten (niet-blokkerend)

- Club-beheerder ziet nu alle leden (geen rij-niveau club-scoping op `players`/`matchsheets`).
- Per-match deeplinks (opstelling/scheidsrechter/aftekenen) nog niet in de hoofdnavigatie gelegd.
- 2 pre-existing lint-errors in `BackToSite.tsx` en `Scorekeeper.tsx` (niet door deze laag).
