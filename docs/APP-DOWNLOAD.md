# Android-apps downloaden van de site

De site biedt de twee Android-apps aan op **`/app`** (link onderaan elke pagina: "Android-app"):

| App | Waarvoor |
|---|---|
| **Krachtbal Federatie** | de hele wedstrijddag (selectie, controle en vrijgave, aantekenen met wissels, aftekenen, indienen); begint op de demoruimte |
| **Krachtbal Aantekenaar** | de aantekentafel |

De pagina toont per app de versie, grootte, datum en een SHA-256-controlegetal, en een korte installatiehandleiding
(downloaden, "onbekende apps" toestaan, installeren). De apps staan niet in de Play Store.

## Hoe het werkt

- De bestanden staan in **`app-downloads/`** in deze repo (niet in `public/`), samen met `manifest.json`.
- `GET /api/app/<id>` (`federatie` of `aantekenaar`) levert het bestand uit: openbaar, zonder login, als
  `application/vnd.android.package-archive` met de bestandsnaam en het versienummer erin, met `ETag` en hervatbaar (`Range`).
  Enkel wat in het manifest staat kan opgevraagd worden; een vrij pad bestaat niet.
- Grootte en SHA-256 worden uit het bestand zelf berekend (`src/lib/app-downloads.ts`), dus ze lopen nooit achter.
- De service worker laat `/api/*` met rust, dus een download wordt nooit uit een oude kopie bediend.
- Code: `src/lib/app-downloads.ts`, `src/app/api/app/[id]/route.ts`, `src/app/(frontend)/app/page.tsx`.
  Tests: `tests/unit/app-downloads.unit.spec.ts` (manifest ↔ bestanden, veilige namen, Range, de route zelf).

## Een nieuwe versie uitbrengen

1. Bouw de app (`android-app/`, zie de README daar): `assembleFederatieRelease` en/of `assembleAantekenaarRelease`.
   De release is ondertekend met de sleutel van het project — dezelfde sleutel als vorige versies, anders kan een telefoon de
   nieuwe versie niet over de oude installeren.
2. Zet het bestand in `app-downloads/` als `Krachtbal-<Naam>-<versie>.apk` en **verwijder het oude bestand** van diezelfde app.
3. Pas de regel van die app aan in `app-downloads/manifest.json`: `bestand`, `versie`, `versieCode` (zoals in
   `build.gradle.kts`) en `datum`.
4. `pnpm test:unit tests/unit/app-downloads.unit.spec.ts`: de test controleert dat het bestand bestaat, een geldige zip
   (APK) is, en dat het versienummer in de bestandsnaam staat.
5. Commit en merge; Railway rolt het uit. Controleer daarna `/app` en download de app één keer.

**Let op:** elk APK-bestand dat je commit, blijft voor altijd in de git-geschiedenis (±2 MB per versie, voor elke app).
Houd het bij weinig, bewuste uitgaven. Groeit dat, kies dan voor een Railway-volume of GitHub Releases.

## Wat een gebruiker doet

1. `/app` openen op de telefoon en op **Download voor Android** tikken (Chrome vraagt "toch downloaden?").
2. Het bestand openen en, als Android erom vraagt, "installeren van onbekende apps" toestaan voor die browser.
3. Meldt Google Play Protect dat de app onbekend is: "Toch installeren". Een update installeer je gewoon over de oude;
   de login blijft behouden.

Meer over de apps zelf, hun architectuur en hoe je ze test: `android-app/README.md` (die map staat op de pc van de ontwikkelaar en is nog niet in git).
