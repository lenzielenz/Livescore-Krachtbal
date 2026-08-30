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
| **1** | Kandidaat-worpen automatisch vinden (bewegingsenergie, optioneel pose), als voorstellen op de review-tijdlijn, precision/recall-rapport | deze map |
| 2 | Baldetectie + tracking op de gekalibreerde frames; eventherkenning (worp/vangst/landing) uit baltrajecten | later |
| 3 | Worptype-classificatie (ML, getraind op de reviewcorrecties) + spelertoewijzing | later |
| 4 | Live-inferentie langs het veld | later |

## Installatie

```bash
# Python-dependencies (nodig voor calibrate.py en detect_worpen.py op video):
pip install -r cv/requirements.txt

# Optioneel (fase 1): pose-verfijning nekworp/rugworp voor detect_worpen.py --pose
pip install -r cv/requirements-pose.txt

# Systeembinaries (enkel nodig voor ingest.py):
apt install ffmpeg   # bevat ook ffprobe
```

`veld.py`, `sync.py`, `upload.py`, `evaluate.py`, `detect_worpen.py --demo`
en de tests draaien puur op de standaardbibliotheek. Licenties: zie
`LICENSES.md` (permissief, geen AGPL).

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

### 6. `detect_worpen.py` — kandidaat-worpen vinden (fase 1)

```bash
python3 cv/detect_worpen.py wedstrijd.mp4 --match 42 --uit detecties.jsonl
```

Baseline die altijd werkt (enkel opencv): een **bewegingsenergie-spotter**.
Per geanalyseerd frame de genormaliseerde frame-verschil-energie (grijswaarden
→ blur → absdiff → gemiddelde), gladgestreken met een lopend gemiddelde;
kandidaat = lokaal maximum boven een adaptieve drempel (mediaan + k×MAD) met
een minimale afstand tussen pieken (`--min-afstand`, standaard 4 s — een
worpbeurt duurt seconden). Confidence = genormaliseerde piekhoogte, afgekapt
op [0.05, 0.95]. Uitvoer: events-JSONL volgens het brugcontract hieronder
(altijd `event_type: "worp"`), klaar voor `upload.py`.

Optionele verfijning `--pose` (lazy import, `requirements-pose.txt`): pose via
**rtmlib** (Apache-2.0, ONNX, geen torch) — polsen boven de schouders +
zwaairichting rond de piek classificeren **nekworp** (voorwaartse zwaai) vs
**rugworp** (achterwaarts, ruggelings). Zonder rtmlib blijft `worp_type` null,
geldt een lager confidence-plafond (0.75 i.p.v. 0.95) en meldt de CLI netjes
dat pose uit staat. De heuristiek is v0.1.0 — valideer ze op eigen beelden met
`evaluate.py` vóór je erop bouwt.

**Demo-modus** — de hele lus zonder video (en zonder opencv):

```bash
python3 cv/detect_worpen.py --demo labels_match42.jsonl --seed 7 \
    --jitter 0.5 --mis-fractie 0.2 --vals 3 --uit detecties_demo.jsonl
```

Leest een weak-labels-JSONL (fase 0-sync), verstoort de tijden met jitter,
laat exact `round(mis-fractie × n)` labels vallen en voegt exact `--vals`
valse positieven toe (provenance-model `demo-ruis`). `--seed` is verplicht:
`random.Random(seed)` maakt elke run exact reproduceerbaar. Zo oefen je de
review-UI en `evaluate.py` zonder wedstrijdvideo.

### 7. `evaluate.py` — het acceptatierapport van fase 1

```bash
python3 cv/evaluate.py --detecties detecties.jsonl --labels labels_match42.jsonl
python3 cv/evaluate.py --detecties … --labels … --venster 2.0 --json
```

Greedy één-op-één-matching op `video_time_s` binnen ±`--venster` (standaard
2.0 s; dichtstbijzijnde paar eerst, elk label en elke detectie hoogstens één
keer). Rapporteert precision/recall/F1 voor worp-detectie, gemiddelde |Δt| van
de matches, en nekworp/rugworp-accuraatheid + 2×2-verwarringsmatrix over de
gematchte paren waar beide kanten een `worp_type` hebben.

Belangrijk: **alle** labels met event_type `worp`/`vangst`/`doelpunt`/
`buitenspel` tellen als worp-momenten — vangst, doelpunt en buitenspel zijn
aflopen van een worp, het zijn dus allemaal worpen (zie `sync.py`, dat het
event_type met de outcome verfijnt). Exitcode 0 óók bij lage scores (het is
een méting); ≠ 0 enkel bij gebruiksfouten. `--json` geeft hetzelfde rapport
machineleesbaar.

## Fase 1 — de review-lus

Kandidaat-worpen automatisch vinden en als voorstellen op de review-tijdlijn
zetten; de mens bevestigt of corrigeert in de browser (PATCH
`/api/cv/events/[id]`, verdict `bevestigd`/`afgewezen`); de correcties zijn
ground truth voor hertraining — `worpTypeOrigineel` bewaart wat het model
claimde, ook na correctie.

1. **Detecteren** — `detect_worpen.py` op de wedstrijdvideo (of `--demo` om
   te oefenen zonder video).
2. **Uploaden** — `upload.py` zet de kandidaten als voorstellen
   (`reviewed=false`) op het platform; ze verschijnen op de review-tijdlijn
   van de analysepagina naast de manuele worpen.
3. **Reviewen** — de mens bevestigt/corrigeert elk voorstel in de browser.
4. **Meten** — `sync.py` haalt de weak labels van een **held-out** wedstrijd
   (één die niet voor afstelling/training diende), `evaluate.py` vergelijkt.

Doel-metriek: **recall ≥ 0.8** voor worp-detectie op held-out wedstrijden.
Precision mag lager: een gemiste worp verdwijnt geruisloos, een valse positief
kost de reviewer één klik (afwijzen). In deze repo staat geen wedstrijdvideo —
de tooling produceert het rapport, meten doe je op eigen beelden.

Demo-lus van begin tot eind (geen video nodig):

```bash
python3 cv/sync.py --base https://krachtbal.live --match 42 --uit labels.jsonl
python3 cv/detect_worpen.py --demo labels.jsonl --seed 7 --uit detecties.jsonl
python3 cv/evaluate.py --detecties detecties.jsonl --labels labels.jsonl
python3 cv/upload.py --bestand detecties.jsonl --base https://krachtbal.live
```

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

## Acceptatie fase 1

- [ ] `detect_worpen.py` levert op een wedstrijdvideo een events-JSONL die
      `upload.py` zonder weigering door de brug krijgt; de kandidaten staan
      als voorstellen op de review-tijdlijn.
- [ ] De demo-lus (`--demo` → `evaluate.py`) draait reproduceerbaar met een
      seed, zonder video en zonder opencv.
- [ ] `evaluate.py` produceert het precision/recall-rapport (worp-detectie +
      nekworp/rugworp-verwarringsmatrix) op **held-out** wedstrijden.
- [ ] Doel: **recall ≥ 0.8** voor worp-detectie op die held-out wedstrijden
      (gemeten door de gebruiker op eigen beelden).

## Metrieken

Gemeten door `evaluate.py` (fase 1); lokalisatie en latency volgen in latere
fases.

| Metriek | Fase 0 | Fase 1 |
| ------- | ------ | ------ |
| Detectie precision/recall/F1 | n.v.t. | `evaluate.py` — doel recall ≥ 0.8 |
| Tijdsuitlijning (gem. \|Δt\|) | n.v.t. | `evaluate.py` |
| Worptype-accuraatheid (nek/rug) | n.v.t. | `evaluate.py` (verwarringsmatrix, enkel met `--pose`) |
| Lokalisatiefout (m) | n.v.t. | n.v.t. (fase 2) |
| Inferentie-latency | n.v.t. | n.v.t. (fase 4) |

## Tests

```bash
python3 -m unittest discover -s cv/tests
```
