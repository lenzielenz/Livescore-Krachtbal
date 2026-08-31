# Deploy — Railway

GitHub → Railway auto-deploy via **Railpack** (geen Dockerfile). Elke push naar `main` triggert een nieuwe build.

## Database: Postgres (productie) of SQLite (lokaal)

De app kiest de adapter automatisch op basis van `DATABASE_URL`:
- begint met `postgres://` of `postgresql://` → **Postgres** (`@payloadcms/db-postgres`)
- anders (`file:...`) → **SQLite** (`@payloadcms/db-sqlite`)

**Productie (huidige Railway-opzet) = Postgres:**
1. Voeg een **Postgres**-service toe in het Railway-project.
2. Op de app-service: `DATABASE_URL` = referentie naar de Postgres (`${{Postgres.DATABASE_URL}}`).
3. Voor de **database** is geen Volume nodig (Postgres heeft zijn eigen opslag). Voor de
   **geüploade bestanden** (clublogo's e.d.) is wél een Volume nodig — zie hieronder.

**Alternatief = SQLite + Volume:** Volume mounten op `/data` en `DATABASE_URL=file:/data/krachtbal.db`.

## Media / uploads: Volume verplicht op de app-service

⚠️ **Clublogo's en andere uploads verdwijnen na elke deploy als er géén Volume aan de
app-service hangt.** Railway's containerschijf is vluchtig: alles wat niet op een Volume
staat, wordt bij elke build/herstart gewist. De clubgegevens overleven (die staan in
Postgres), maar de bestanden zelf zijn weg → 404 → scoreboards vallen terug op initialen.

Het Volume hoort op de **app-service** (Livescore-Krachtbal), níét op de Postgres-service.
Het `postgres-volume` van de database is hiervoor irrelevant.

**Setup:**
1. Op de **app-service** → **Volume** toevoegen. Mount-pad maakt niet uit (bv. `/data`).
2. Railway zet dan automatisch `RAILWAY_VOLUME_MOUNT_PATH`; de code schrijft media naar
   `<volume>/media` ([src/collections/Media.ts](../src/collections/Media.ts)). Geen extra
   variabele nodig. `MEDIA_DIR` blijft voorrang houden als je een eigen pad wil forceren.
3. Controle: in de deploy-logs verschijnt de waarschuwing `[media] LET OP: geen persistente
   opslag gevonden...` zolang er géén Volume is. Verdwijnt die regel → het zit goed.

Let op: reeds verdwenen bestanden komen niet terug — die moeten één keer opnieuw geüpload
worden nadat het Volume is gekoppeld.

## Eenmalige setup

1. **Service** gekoppeld aan de GitHub-repo `lenzielenz/Livescore-Krachtbal`.
2. **Database** zoals hierboven (Postgres-service óf Volume).
3. **Environment variables**:
   - `DATABASE_URL` — zie hierboven.
   - `PAYLOAD_SECRET=<32-byte hex>` — genereer met
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `PORT` wordt door Railway geïnjecteerd; `next start` pikt die automatisch op.

## Build & start (door Railpack afgeleid)

- Node-versie: vastgelegd in `.node-version` (24 — vereist door Next 16 / Payload 3.85).
- Install: `pnpm install`
- Build: `pnpm build` (`next build`)
- Start: `pnpm start` (`next start`) — zie `railway.json`.

## Let op

- **Node 22 → 24**: PROJECT.md noemde Node 22, maar Next 16 + Payload 3.85 vereisen Node ≥ 24.14. Daarom Node 24.
- SQLite + Volume betekent **één** service-instance (geen horizontale schaling); voor dit live-score-gebruik ruim voldoende.
- DB-migraties: Payload draait in dev met `push`-modus (auto-schema). Voor productie later `payload migrate` toevoegen aan een release-stap.


## Video-analyse op de server (Python + opencv)

De knop **"🤖 Analyseer de video"** op de analysepagina laat de server het rekenwerk doen:
worpen zoeken, de bal volgen, spelers herkennen, en de controlevideo maken. Daarvoor is Python
met opencv nodig — en dat zit **niet** in het productie-image.

**Daarom wordt de omgeving ná de deploy binnengehaald, vanuit de app zelf.** Staat ze er niet,
dan verschijnt bij het analyseblok de knop **"⚙️ Analyse-omgeving installeren"** (federatie/
admin). Die haalt een zelfstandige CPython op — [python-build-standalone][pbs], één map, geen
systeemafhankelijkheden — en installeert daarin `numpy` en `opencv-python-headless`. Alles komt
op het **volume** in `cv-runtime/`, dus het overleeft elke nieuwe versie van de site. Kosten:
ongeveer 320 MB en een minuut.

[pbs]: https://github.com/astral-sh/python-build-standalone

Waarom niet via de build: twee pogingen om `railpack.json` uit te breiden lieten de deploy
mislukken (eerst op de apt-stap, daarna al na zes seconden — dus op de config zelf). Een
runtime-installatie kan de site niet breken: mislukt ze, dan blijft de knop uit met de reden
erbij en draait alles verder.

Wat daarbij vastligt:

- **Geen apt-pakketten nodig.** Het manylinux-wiel van `opencv-python-headless` heeft buiten
  glibc, libstdc++ en libz geen enkele externe bibliotheek nodig — `readelf -d cv2/cv2.abi3.so`
  laat zien dat de rest, ffmpeg inbegrepen, in het wiel zit. De pijplijn leest video's
  uitsluitend via `cv2.VideoCapture`, nooit via de ffmpeg-binary. (`cv/ingest.py` en
  `cv/highlights.py` roepen ffmpeg wél aan, maar zijn lokale hulpmiddelen.)
- **De download wordt gecontroleerd**: versie én sha256 staan vast in `src/lib/cv-runtime.ts`.
  Klopt het controlegetal niet, dan wordt er niets uitgepakt.
- **Uitpakken gebeurt in eigen huis** (`src/lib/cv-tar.ts`), zonder het `tar`-commando — precies
  het soort aanname over het image dat de build twee keer deed struikelen. Namen die buiten de
  doelmap wijzen, absolute paden en ontsnappende symlinks worden geweigerd.
- Zit je op een andere architectuur (bv. arm), zet dan `CV_PYTHON_URL` naar het juiste bestand
  van dezelfde release; het vaste controlegetal geldt dan niet meer.

**De app blijft werken zonder dat alles.** Bij het openen van de analysepagina test de server
één keer of Python en opencv er zijn; ontbreekt er iets, dan staat de knop uitgeschakeld met
de reden erbij ("Python staat er wel, maar opencv ontbreekt op deze server"). Er wordt dus
nooit een taak gestart die na tien seconden op een cryptische Python-fout stukloopt.

**Wat de worpdetectie wél en niet doet.** `detect_worpen.py` is een bewegingsenergie-spotter:
per moment het gemiddelde beeldverschil met het vorige beeld, gladgestreken, en de pieken
daarvan zijn de kandidaten. Dat werkt op een opname van een **stilstaande** camera. Bij een
pannende gsm meet dat verschil vooral de camera, en verdrinken de worpen erin. Nagemeten op een
proefvideo met acht gekende worpen en een pannende camera: geen enkele piek boven de drempel,
ook niet na het wegrekenen van de camerabeweging en ook niet met een lokale maat in plaats van
het frame-gemiddelde (verhouding worp/rust 1,00 tot 1,22 — geen scheiding).

De weg vooruit is grondwaarheid, niet meer knutselen aan de heuristiek: bevestig of wijs
voorstellen af in de reviewlaan, exporteer die als labels, en meet met `cv/evaluate.py`
(precision/recall/F1, doel recall ≥ 0,8). Pas met echte labels van een echte wedstrijd valt te
zien of een betere detector werkt.

**Instelbaar met omgevingsvariabelen**

| Variabele | Waarvoor |
| --- | --- |
| `CV_PYTHON` | Pad naar de Python die de analyse draait. Gezet, dan telt alleen die. Anders wordt op volgorde geprobeerd: `/opt/cv-venv/bin/python3`, dan `python3` mét `PYTHONPATH` naar de site-packages van de venv (vangnet als de venv meekomt maar zijn interpreter niet), dan het kale `python3`. |
| `CV_RUNTIME_DIR` | Waar de opgehaalde omgeving staat. Standaard `cv-runtime/` op het volume. |
| `CV_PYTHON_URL` | Ander Python-bestand (andere architectuur). Zonder deze variabele geldt het vastgezette controlegetal. |
| `CV_DIR` | Waar de scripts staan. Standaard `cv/` naast de app. |
| `MAX_MATCH_VIDEO_MB` | Maximale grootte van een geüploade wedstrijdvideo (standaard 512). |

**Wat het kost.** De analyse draait op dezelfde instantie als de site: één wedstrijd tegelijk,
en een volledige wedstrijd kost al gauw tien minuten tot een uur rekenwerk. Merk je dat de
site traag wordt tijdens een analyse, dan is een grotere instantie (of een aparte worker) de
volgende stap. De tussenbestanden komen op het volume in `cv-analyse/<match-id>/` te staan;
die map mag je gerust opruimen, alleen de voorstellen in de database tellen.

**Alleen geüploade video's.** Een YouTube-link kan de server niet analyseren — daarvoor zou
hij de video moeten downloaden. Upload het bestand (mp4/webm) als je wil laten analyseren;
de app zegt dat ook met zoveel woorden.
