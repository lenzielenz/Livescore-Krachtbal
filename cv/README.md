# CV-pipeline — computer vision voor Krachtbal Live

Doel: krachtbal-events (worp, vangst, doelpunt, buitenspel) automatisch uit
gsm/GoPro-video halen en als **voorstellen** in het platform importeren —
`reviewed=false`, mét confidence en provenance. De CV-kant raakt de
event-sourcing-kern nooit rechtstreeks: de `throws`-collection blijft de enige
bron van waarheid; een mens bevestigt (of verwerpt) elk voorstel.

Alles in deze map is Python (3.11+) en staat los van de Next.js/Payload-app;
de koppeling loopt uitsluitend via de HTTP-importbrug (`/api/cv/…`).

## De eerste echte meting (start hier)

Alles in deze map dient één moment: de eerste meting op echte beelden. Drie stappen:

```bash
# 1. Staat alles klaar? (ffmpeg, opencv, token, platform, video-offsets per helft)
export CV_BRIDGE_TOKEN=…
python3 cv/meet.py --controle --match 42 --base https://<jouw-domein>

# 2. Kalibreer één keer voor je vaste camera-opstelling (klik ≥ 4 lijnkruisingen):
python3 cv/calibrate.py --beeld frame.jpg --uit kalibratie.json

# 3. De meting zelf — één commando, van video tot acceptatierapport:
python3 cv/meet.py --video match.mp4 --match 42 --kalibratie kalibratie.json \
    --base https://<jouw-domein>
```

Het rapport vertelt waar de detectie staat (doel: recall ≥ 0.8 op worpen).
Tevreden? Draai opnieuw met `--upload` en review de voorstellen op de
analysepagina — elke correctie wordt trainingsdata (`groundtruth.py`).
Met **`--tracking`** draait ook de videotracking mee: spelersposities, een
heatmap en de fysieke stats (gelopen afstand, sprintjes, topsnelheid) voor de
spelerskaart — na afloop vul je `wie.json` in en uploadt `fysiek.py` ze.
Eerst droog oefenen kan volledig zonder video: `python3 cv/meet.py --demo
--seed 7 --match 42 --tracking`.

## Filmen vanaf zijkant, achterkant of hoek

De homografie werkt vanaf élke vaste positie — je hoeft niet per se hoog op de
middellijn te staan. Wat verandert is wélke kruispunten je betrouwbaar kunt
aanklikken, en dat regelt de kalibratie voor je:

| Positie | `--positie` | Punten | Sterk | Zwak |
| --- | --- | --- | --- | --- |
| Hoog op de middellijn (standaard) | `zijlijn` | alle 14 | het hele veld | — |
| Achter een achterlijn | `achter-thuis` / `achter-uit` | 8 (eigen kant + middellijn) | zones/doelpunten aan jouw kant | de overkant is **geëxtrapoleerd** — afstanden dáár onbetrouwbaar |
| Op een hoek | `hoek` | alle 14 | goed compromis | neem minstens één punt op élke helft |

```bash
# Interactief vanaf de achterkant: de kliklijst toont enkel de 8 bruikbare punten
python3 cv/calibrate.py --beeld frame.jpg --positie achter-uit --uit kalibratie.json
```

**De conventie** (zodat links/rechts overal hetzelfde betekent): sta in
gedachten op de THUIS-achterlijn en kijk naar de uit-kant — links is dan x=0.
Film je van achter de uit-kant, dan is wat jij links in beeld ziet dus
veld-RECHTS. Twee vangnetten als het toch misgaat:

- **Spiegelbeeld** (links/rechts verwisseld): de kalibratie wordt geweigerd
  vóór ze weggeschreven wordt — een echte camera staat altijd bóven het veld
  en kan het nooit gespiegeld zien, dus dat is wiskundig detecteerbaar.
- **Verkeerde achterlijn als thuis gekozen** (het veld staat 180° gedraaid;
  symptoom: landingen liggen puntgespiegeld door het veldmidden in
  `evaluate.py`): `python3 cv/calibrate.py --draai-180 kalibratie.json --uit
  kalibratie.json` draait matrix, punten én labels om — geen herklikken nodig.

`--test` waarschuwt bovendien wanneer alle punten op één helft liggen, zodat je
wéét dat de overkant geëxtrapoleerd is.

## Fases

| Fase | Inhoud | Status |
| ---- | ------ | ------ |
| **0** | Fundering: video-ingest, veldkalibratie (homografie), importbrug, sync van bestaande manuele tags naar weak labels. **Geen detectie/ML.** | deze map |
| **1** | Kandidaat-worpen automatisch vinden (bewegingsenergie, optioneel pose), als voorstellen op de review-tijdlijn, precision/recall-rapport | deze map |
| **2** | Bal-landingspunt + homografie → zone (doelgebied ja/nee), afstand en score_delta (rugworp-doelpunt telt dubbel) | deze map (`landing.py`) |
| **3** | Spelersidentificatie: team via truitjeskleur-clustering, rugnummer via de review-lus (OCR-backend later) | deze map (`spelers.py`) |
| **4** | Auto-highlights per speler/doelpunt (FFmpeg-clips uit bevestigde events) | deze map (`highlights.py`) |
| **5** | Volledige speler-tracking → heatmaps | deze map (`tracking.py` + `heatmap.py`) |
| **6** | Hertraining-lus: reviewcorrecties → ground truth ("model zei X, mens zei Y") | deze map (`groundtruth.py`) |

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

### 8. `landing.py` — bal-landing → zone + afstand (fase 2)

Verrijkt de detecties van fase 1 met het landingspunt: zone (in het doelgebied
of niet, veldmeters), de geschatte worpafstand en de `score_delta` volgens het
reglement — **een rugworp-doelpunt telt dubbel** (+2, §6.6), dé regel die
generieke sport-CV niet kent.

```bash
# Met video (vereist opencv + een kalibratie van calibrate.py):
python3 cv/landing.py --video match.mp4 --detecties det.jsonl \
    --kalibratie kalibratie.json --uit verrijkt.jsonl

# Zonder video (oefent de lus en de metriek, reproduceerbaar):
python3 cv/landing.py --demo --detecties det.jsonl --labels labels.jsonl \
    --seed 7 --sigma-m 0.8 --uit verrijkt.jsonl
```

De videomodus is een v0.1-baseline (achtergrondsubtractie + balgrootte-filter,
landing = einde van de neerwaartse beeldbeweging, homografie naar veldmeters).
Ziet de camera de bal niet, dan blijft de zone bewust leeg — beter géén zone
dan een verzonnen zone; de reviewer ziet het moment nog altijd op de tijdlijn.

### 9. `spelers.py` — team + rugnummer (fase 3)

```bash
# Met video: HOG-persoonsdetector + truitjeskleur-clustering (2-means op de
# torso-tint). Welke cluster "thuis" is weet de camera niet: --wissel draait om.
python3 cv/spelers.py --video match.mp4 --detecties verrijkt.jsonl --uit met_spelers.jsonl

# Zonder video:
python3 cv/spelers.py --demo --detecties verrijkt.jsonl --labels labels.jsonl \
    --seed 7 --uit met_spelers.jsonl
```

Rugnummers blijven in v0.1 leeg (de OCR-stap uit het plan — pose-crop + PARSeq —
is een latere, optionele backend): **een leeg rugnummer is een bewuste uitkomst**,
de reviewer vult het in het paneel aan en dat wordt trainingsdata.

### 10. `highlights.py` — deelbare clips per speler/doelpunt (fase 4)

```bash
# Alle doelpunten als losse clips (8 s voorloop, 5 s naloop):
python3 cv/highlights.py --video match.mp4 --events labels_match42.jsonl \
    --doelpunten --uitmap clips/

# Alles van speler #7 (thuisploeg), plus één samenvattingsvideo:
python3 cv/highlights.py --video match.mp4 --events labels_match42.jsonl \
    --speler 7 --team home --samenvoegen hoogtepunten_7.mp4 --uitmap clips/
```

Werkt op élk event-JSONL met videotijden: de weak labels van `sync.py` (de
manuele tags — vandaag al bruikbaar, geen CV nodig) of de gereviewde detecties.
Clips worden standaard hergecodeerd (frame-nauwkeurig, H.264+AAC — speelt
overal, ook via WhatsApp); `--kopie` knipt zonder hercodering (sneller, maar op
keyframe-grenzen). Elke run schrijft een `manifest.json` naast de clips.

## Acceptatie fase 2 en 3

- [ ] `evaluate.py` toont de sectie **"Zone en landing"**: zone-accuraatheid
      (in/uit doelgebied) en landing-MAE in meters (richtwaarde uit het plan:
      MAE tot ~1 m bij een goede kalibratie), plus afstand-MAE wanneer beide
      kanten een afstand dragen.
- [ ] `evaluate.py` toont de sectie **"Spelersidentificatie"**: team-accuraatheid
      en rugnummer-accuraatheid óver de ingevulde nummers (leeg ≠ fout — leeg
      betekent "reviewer vult aan").
- [ ] In het reviewpaneel: landing/afstand zichtbaar, team omklikbaar
      (thuis/uit) en rugnummer intikbaar — elke correctie bevestigt meteen en
      wordt ground truth.
- [ ] De hele demo-lus draait zonder video: sync → detect --demo →
      landing --demo → spelers --demo → evaluate → upload → reviewen.

### 11. `tracking.py` + `heatmap.py` — posities en heatmaps (fase 5)

```bash
# Posities uit de video (v0.2: HOG + MOG2-beweging → voetpunt → veldmeters → sporen):
python3 cv/tracking.py --video match.mp4 --kalibratie kalibratie.json --fps 4 --uit posities.jsonl

# Of zonder video (8 toevalspaden, reproduceerbaar):
python3 cv/tracking.py --demo --seed 7 --duur 600 --uit posities.jsonl

# Posities → heatmap-raster (JSON altijd; PNG met veldlijnen als opencv er is):
python3 cv/heatmap.py --posities posities.jsonl --uit heatmap.json --png heatmap.png

# Alles in één keer meedraaien met de meting (tracking → fysiek → heatmap):
python3 cv/meet.py --video match.mp4 --match 42 --kalibratie kalibratie.json --tracking
```

**Bemonstering (`--fps`, standaard 4/s).** Bewust dichter dan de event-detectie: bij
2 metingen per seconde wordt elke versnelling over een halve seconde uitgemiddeld
en meet `fysiek.py` nul sprintjes op een wedstrijd waarin volop gesprint werd.
Dichter bemonsteren kost evenredig meer rekentijd op video, maar maakt het
verschil tussen een lege en een levende spelerskaart. `meet.py --tracking` gebruikt
hiervoor `--tracking-fps` (los van de event-fps voor de framenummers).

De v0.2-tracker combineert twee detectoren die elkaar aanvullen: **HOG** herkent
mensen (ook stilstaand), **MOG2-achtergrondsubtractie** vindt alles wat beweegt
(ook verre, kleine spelers die HOG mist). Dubbele waarnemingen worden
samengevoegd (`dedupliceer`, < 0,8 m = één persoon) en flikker-sporen korter dan
`--min-duur` (3 s) weggegooid. Kies desnoods één detector met `--detector
hog|mog2`. De koppeling blijft dichtstbijzijnde-buur met snelheidslimiet 8 m/s:
identiteitswissels bij occlusie kunnen nog — `fysiek.py` vangt dat op door
meerdere sporen op één rugnummer te laten optellen. Het JSON-raster is
genormaliseerd op de drukste cel zodat elke weergave dezelfde schaal hanteert.

### 11b. `fysiek.py` — loopafstand, sprintjes en topsnelheid per speler

```bash
# Stap 1 — invulsjabloon maken (per spoor een hint: wanneer, waar, hoeveel meter):
python3 cv/fysiek.py --posities posities.jsonl --sjabloon wie.json --uit fysiek.json

# Stap 2 — wie.json invullen: {"1": {"team": "thuis", "rugnummer": 7, "naam": "…"}, …}
# (bekijk de heatmap of de video en zeg per spoor welke speler het is; sporen die
#  door een identiteitswissel in stukken vielen, wijs je gewoon allebei toe —
#  meters en sprintjes van hetzelfde rugnummer tellen op; ruis-sporen laat je op null)

# Stap 3 — met de ingevulde toewijzing (het sjabloon zelf werkt direct):
python3 cv/fysiek.py --posities posities.jsonl --toewijzing wie.json --uit fysiek.json

# Oefenen op de demo-sporen (1-4 thuis, 5-8 uit; de demo bevat ook echte sprintjes):
python3 cv/fysiek.py --posities posities.jsonl --demo --uit fysiek.json

# En naar het platform — verschijnt op de spelerskaart van de analysepagina:
export CV_BRIDGE_TOKEN=…
python3 cv/fysiek.py --posities posities.jsonl --toewijzing wie.json \
    --uit fysiek.json --upload --base https://krachtbal.live --match 42
```

Per speler: **gelopen afstand**, **aantal sprintjes** (≥ 4 m/s gedurende ≥ 1 s,
instelbaar met `--sprint-drempel`/`--sprint-duur`) en **topsnelheid**. Gaten
(> 2 s) en teleportaties (> 8 m/s, identiteitswissels) tellen niet mee — liever
te weinig meters dan spooksprints.

**Waarom er eerst gladgestreken wordt** (`--glad-venster`, standaard 0,75 s): een
positiemeting bevat ruis, en die ruis is bij elke meting een klein kronkeltje dat
je anders als afgelegde weg optelt. Hoe dichter je bemonstert, hoe meer kronkels —
dezelfde wedstrijd op 4 metingen/s zou dan véél verder "gelopen" lijken dan op 2/s.
Gemeten op één demo-beweging, bemonsterd van 1/s tot 20/s: **rauw** liep de gemeten
afstand van 303 tot 973 m uiteen (factor 3,2), **met** het venster blijft ze tussen
303 en 385 m. Sprintjes en topsnelheid zijn in beide gevallen stabiel. Zet
`--glad-venster 0` om rauw te tellen — dan zijn de meters niet vergelijkbaar
tussen wedstrijden die op een andere frequentie getrackt zijn. De upload gaat naar POST
`/api/cv/match/{id}/fysiek` en vervangt de vorige meting volledig; het platform
toont het naast de worpstatistieken en vangsten op de spelerskaart.

### 12. `groundtruth.py` — de hertraining-lus sluiten (fase 6)

```bash
export CV_BRIDGE_TOKEN=…
python3 cv/groundtruth.py --base https://krachtbal.live --match 42 --uit gt_match42.jsonl
```

Haalt alle GEREVIEWDE voorstellen op via GET `/api/cv/match/{id}/reviews`: het
menselijke oordeel (bevestigd/afgewezen) mét de bevroren modelclaim ernaast —
"model zei X, mens zei Y". Afgewezen voorstellen zijn even waardevol als
bevestigde: dat zijn de valse positieven die de volgende modelversie moet
afleren. Meerdere matchen aaneenplakken = de trainingsset.

## Acceptatie fase 5 en 6

- [ ] Een heatmap van een echte wedstrijd (of de demo) als PNG met veldlijnen,
      en hetzelfde raster als JSON.
- [ ] `groundtruth.py` haalt de reviews van een match op en het rapport klopt
      met wat er in de browser gereviewd werd.

## Acceptatie fase 4

- [ ] Doelpuntclips van een echte wedstrijd geknipt en gedeeld (WhatsApp).
- [ ] Per-spelerselectie klopt (rugnummer + ploeg) en de samenvatting plakt
      naadloos aaneen.

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
