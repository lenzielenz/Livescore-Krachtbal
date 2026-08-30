# CV-pipeline — computer vision voor Krachtbal Live

Doel: krachtbal-events (worp, vangst, doelpunt, buitenspel) automatisch uit
gsm/GoPro-video halen en als **voorstellen** in het platform importeren —
`reviewed=false`, mét confidence en provenance. De CV-kant raakt de
event-sourcing-kern nooit rechtstreeks: de `throws`-collection blijft de enige
bron van waarheid; een mens bevestigt (of verwerpt) elk voorstel.

Alles in deze map is Python (3.11+) en staat los van de Next.js/Payload-app;
de koppeling loopt uitsluitend via de HTTP-importbrug (`/api/cv/…`).

## Fases

| Fase | Inhoud | Status |
| ---- | ------ | ------ |
| **0** | Fundering: video-ingest, veldkalibratie (homografie), importbrug, sync van bestaande manuele tags naar weak labels. **Geen detectie/ML.** | deze map |
| 1 | Baldetectie + tracking op de gekalibreerde frames | later |
| 2 | Eventherkenning (worp/vangst/landing) uit baltrajecten | later |
| 3 | Worptype-classificatie (nekworp/rugworp) + spelertoewijzing | later |
| 4 | Live-inferentie langs het veld | later |

## Installatie

```bash
# Python-dependencies (enkel nodig voor calibrate.py):
pip install -r cv/requirements.txt

# Systeembinaries (enkel nodig voor ingest.py):
apt install ffmpeg   # bevat ook ffprobe
```

`veld.py`, `sync.py`, `upload.py` en de tests draaien puur op de
standaardbibliotheek. Licenties: zie `LICENSES.md` (permissief, geen AGPL).

Voor `sync.py` en `upload.py` is een bridge-token nodig:

```bash
export CV_BRIDGE_TOKEN=…   # zelfde token als op het platform geconfigureerd
```

## De tools

### 1. `veld.py` — veldmodel (bibliotheek, geen CLI)

Spiegel van `src/lib/field.ts`: veld 14 m breed, 26 m tussen de doellijnen,
doelgebied-diepte per terrein instelbaar (standaard 10 m, nieuwe terreinen
15 m), vrijeworplijn = doellijn + 4 m, totale lengte = 26 + 2×diepte.
Genormaliseerde coördinaten: x ∈ [0,1] over de breedte, y ∈ [0,1] over de
totale lengte (y=0 = achterlijn "thuis"). Levert ook de 14 gekende
lijn-kruispunten ({achterlijn, doellijn, vrijeworplijn, middellijn} × beide
zijlijnen) voor de kalibratie. Wijzigt de veldgeometrie ooit, pas dan éérst
`field.ts` aan en spiegel hier.

### 2. `ingest.py` — video → frames + metadata

```bash
python3 cv/ingest.py wedstrijd.mp4 --fps 2 --uit frames/wedstrijd
```

Extraheert frames op de gevraagde fps (ffmpeg) en schrijft `metadata.json`
(resolutie, bron-fps, duur, extractie-instellingen; ffprobe) in de uitvoermap.
Let op de nummering: bestandsnamen starten op `frame_000001`, de frame-index in
de pipeline is 0-gebaseerd → bestandsnaam = `frame_{index+1:06d}`.

### 3. `calibrate.py` — homografie beeld ↔ veld

Interactief (OpenCV-venster, klik de genummerde kruispunten aan;
`s` = overslaan, `u` = ongedaan, `ENTER` = klaar, `ESC` = afbreken):

```bash
python3 cv/calibrate.py --beeld frames/wedstrijd/frame_000001.jpg \
    --diepte 10 --uit kalibratie.json
```

Headless/herhaalbaar (≥4 punten, labels uit `veld.kruispunten()`):

```bash
python3 cv/calibrate.py --diepte 10 --uit kalibratie.json \
    --punt "812,1013=doellijn_thuis_links" \
    --punt "1522,1001=doellijn_thuis_rechts" \
    --punt "690,1450=achterlijn_thuis_links" \
    --punt "1730,1430=achterlijn_thuis_rechts"
```

Reprojectiefout-rapport (px per punt + gemiddelde; heeft géén cv2 nodig):

```bash
python3 cv/calibrate.py --test kalibratie.json
```

De JSON bevat de matrix (beeld→veld, in meters), de aangeklikte punten en de
veldconfig (incl. doelgebied-diepte) zodat de kalibratie herleidbaar is.

### 4. `sync.py` — manuele tags → weak labels

```bash
python3 cv/sync.py --base https://krachtbal.live --match 42 --fps 2 \
    --uit labels_match42.jsonl
```

Haalt de bestaande handmatig aangetekende events op via
`GET {base}/api/cv/match/{id}/labels` (Bearer `CV_BRIDGE_TOKEN`) en schrijft ze
als JSONL-weak-labels (één event-JSON per regel, zie schema hieronder).
`video_time_s` komt van het platform (gameClock + video-offset van die helft);
`frame = round(video_time_s × fps)` als `--fps` is meegegeven. Het rapport
meldt "X van Y events gesynct" en waarom de rest niet kon (video-offset van die
helft ontbreekt op het platform).

### 5. `upload.py` — events als voorstellen uploaden

```bash
python3 cv/upload.py --bestand labels_match42.jsonl --base https://krachtbal.live
```

Leest events (.json of .jsonl) en POST `{ matchId, events }` naar
`{base}/api/cv/events` (zelfde Bearer); de route antwoordt met
`{ aanvaard, geweigerd: [{index, reden}] }` en aanvaardt max. 500 events per
aanroep — het script batcht daar zelf op (`--batch`). Drukt per event
aanvaard/geweigerd + reden af. Het platform bewaart aanvaarde events als
voorstellen (`reviewed=false`) in een aparte collection — nooit in `throws`.

## Event-JSON (de brug Python ↔ Payload)

Eén event, exact deze veldnamen (JSONL = één zo'n object per regel):

```json
{
  "match_id": 42,
  "video_time_s": 123.4,
  "frame": 247,
  "event_type": "worp",
  "worp_type": "nekworp",
  "zone": { "in_doelgebied": false, "x_m": 6.5, "y_m": 31.0 },
  "afstand_m": 17.2,
  "speler": { "team": "home", "rugnummer": 7 },
  "score_delta": 0,
  "confidence": 0.87,
  "provenance": { "model": "manuele-tags", "model_version": "fase0-sync-0.1.0" }
}
```

- `event_type`: `"worp" | "vangst" | "doelpunt" | "buitenspel"`
  — het labels-endpoint levert zelf enkel `worp`/`doelpunt` en geeft de afloop
  apart mee als `outcome`; `sync.py` verfijnt daarmee het event_type
  (`caught` → `vangst`, `out_side`/`out_back` → `buitenspel`), zodat de weak
  labels alle vier de klassen bevatten die de eventherkenning later moet leren.
  Let wel: het tijdstip blijft dat van de wórp — de vangst/landing zelf ligt
  een boogvlucht later (fase 1 verfijnt dat).
- `worp_type`: `"nekworp" | "rugworp" | null`
- `frame`: `int | null` — `round(video_time_s × extractie-fps)`
- `zone`: `null` of `{in_doelgebied, x_m, y_m}` (meters, veld-assenstelsel van `veld.py`)
- `afstand_m`, `speler`: `null` waar onbekend
- `confidence`: 0..1 (manuele tags: 1.0)
- `score_delta`: in fase 0 altijd `0` — score afleiden blijft het domein van de
  match-engine (event-sourcing), niet van de CV-kant.

## Acceptatie fase 0

- [ ] `ingest.py` zet een testvideo om naar frames + kloppende `metadata.json`.
- [ ] `calibrate.py` levert op ≥4 kruispunten een homografie met een
      reprojectiefout die laag genoeg is voor zone-toewijzing (richtwaarde:
      gemiddeld < 0,5 m op het veld voor de gebruikte punten).
- [ ] `sync.py` produceert voor een match met video-offsets een JSONL waarin
      élk syncbaar event een correcte `video_time_s` heeft; het rapport
      verklaart alle niet-gesyncte events.
- [ ] `upload.py` krijgt events door de importbrug; ze verschijnen als
      voorstellen (`reviewed=false`) op het platform en raken `throws` niet.
- [ ] `python3 -m unittest discover -s cv/tests` slaagt zonder cv2/numpy.

## Metrieken

Niet van toepassing voor fase 0 — er is nog geen detectie of classificatie om
te meten. Vanaf fase 1 komen hier per model: precision/recall per event-type,
lokalisatiefout (m) na homografie, en de latency van de inferentie.

| Metriek | Fase 0 |
| ------- | ------ |
| Detectie precision/recall | n.v.t. |
| Lokalisatiefout (m) | n.v.t. |
| Worptype-accuraatheid | n.v.t. |
| Inferentie-latency | n.v.t. |

## Tests

```bash
python3 -m unittest discover -s cv/tests
```
