#!/usr/bin/env python3
"""Persoon-detecties per frame — het getrainde fundament onder tracking en spelers.

Waarom dit bestaat
------------------
``tracking.py`` en ``spelers.py`` vonden personen tot nu toe met klassieke
technieken: HOG (mist kleine/verre figuren), MOG2-bewegingsblobs (zien alleen
wat beweegt, en dan nog alleen het bewegende déél van een lichaam) en losse
kleurhistogrammen. Het houdingsmodel (RTMPose via rtmlib) dat ``houding.py`` al
gebruikt voor de worpherkenning is óók een getrainde persoons-detector — en een
veel betere: het vindt stilstaande én verre spelers, en het levert per persoon
de gewrichten, waaronder de **enkels**. Dat laatste is goud waard: de
grondvlak-homografie geldt alleen voor punten óp de grond, en de enkels zijn
het enige gewricht dat daar staat.

Deze module is de dunne laag die van model-uitvoer per frame detecties maakt:

    {'bbox': (x, y, b, h), 'voeten': (x, y), 'zekerheid': float}

met twee bronnen:

1. **Het rtmlib-houdingsmodel** — lui geladen, met dezelfde nette foutmelding
   als ``houding.laad_model`` wanneer rtmlib ontbreekt (zie ``laad_bron``).
2. **Een geïnjecteerde functie** — voor tests en alternatieve detectoren:
   elke functie ``frame -> list[detectie]`` is een geldige bron
   (``maak_pose_bron`` bouwt zo'n functie rond een model; een test geeft er
   gewoon zelf een mee).

De rekenkern (keypoints → bbox/voetpunt, filteren op zekerheid) is puur en
draait zonder rtmlib, opencv of video — precies zoals de rekenkern van
``houding.py`` met verzonnen skeletten getest wordt.

Bewuste scope: alleen PERSONEN komen uit een getraind model. De bal blijft in
``bal.py`` klassiek (verschilbeeld-blobs): een balmodel vergt eigen gelabelde
trainingsdata die er nog niet is, en een verkeerd "getraind" balmodel zou
slechter zijn dan de eerlijke klassieke weg.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# COCO-17, zoals rtmlib ze levert — dezelfde nummering als houding.py.
L_HEUP, R_HEUP = 11, 12
L_ENKEL, R_ENKEL = 15, 16

# Onder deze zekerheid negeren we een keypoint (zelfde drempel als houding.py):
# liever geen meting dan een verzonnen gewricht.
MIN_ZEKERHEID = 0.3
# Minder zekere gewrichten dan dit is geen persoon maar ruis — een half skelet
# op de tribune of een dubbele detectie van een arm.
MIN_PUNTEN = 4


# ---------------------------------------------------------------------------
# De rekenkern (puur — getest zonder rtmlib en zonder video)
# ---------------------------------------------------------------------------


def _zeker_punt(keypoints, scores, index: int, min_zekerheid: float) -> tuple[float, float] | None:
    """Eén gewricht, of None als het model er niet zeker genoeg van is."""
    if index >= len(keypoints) or index >= len(scores):
        return None
    if scores[index] < min_zekerheid:
        return None
    return float(keypoints[index][0]), float(keypoints[index][1])


def persoon_uit_keypoints(keypoints, scores, min_zekerheid: float = MIN_ZEKERHEID) -> dict | None:
    """Van één skelet naar één detectie: bbox, voetpunt en zekerheid.

    * **bbox** omsluit alle zékere gewrichten — onzekere punten (vaak ver naast
      het lichaam gehallucineerd) mogen het kader niet oprekken.
    * **voeten** is het punt dat door de grondvlak-homografie mag: het
      gemiddelde van de zekere enkels. Zijn de enkels niet betrouwbaar (in het
      gras, achter een andere speler), dan de heup-x boven de bbox-onderkant —
      de heupen geven de zijwaartse positie het stabielst (zie ook
      ``houding.heuppositie``), en de bbox-onderkant is dan de beste gok voor
      "waar raakt dit lichaam de grond".
    * **zekerheid** is het gemiddelde van de zekere gewricht-scores: een maat
      om detecties te rangschikken en zwakke weg te filteren.

    Geeft None terug voor skeletten met minder dan ``MIN_PUNTEN`` zekere
    gewrichten: dat is geen persoon maar ruis.
    """
    punten: list[tuple[float, float]] = []
    zeker: list[float] = []
    for p, s in zip(keypoints, scores):
        if s >= min_zekerheid:
            punten.append((float(p[0]), float(p[1])))
            zeker.append(float(s))
    if len(punten) < MIN_PUNTEN:
        return None
    xs = [p[0] for p in punten]
    ys = [p[1] for p in punten]
    x0, y0 = min(xs), min(ys)
    bbox = (x0, y0, max(xs) - x0, max(ys) - y0)

    enkels = [p for p in (_zeker_punt(keypoints, scores, L_ENKEL, min_zekerheid),
                          _zeker_punt(keypoints, scores, R_ENKEL, min_zekerheid)) if p]
    if enkels:
        voeten = (sum(p[0] for p in enkels) / len(enkels),
                  sum(p[1] for p in enkels) / len(enkels))
    else:
        heupen = [p for p in (_zeker_punt(keypoints, scores, L_HEUP, min_zekerheid),
                              _zeker_punt(keypoints, scores, R_HEUP, min_zekerheid)) if p]
        # Zonder enkels: zijwaarts op de heupen vertrouwen, verticaal op de
        # onderkant van het kader — dichter bij de grond komt dit skelet niet.
        voet_x = sum(p[0] for p in heupen) / len(heupen) if heupen else x0 + bbox[2] / 2
        voeten = (voet_x, y0 + bbox[3])
    return {'bbox': bbox, 'voeten': voeten, 'zekerheid': sum(zeker) / len(zeker)}


def detecties_uit_pose(keypoints_per_persoon, scores_per_persoon,
                       min_zekerheid: float = MIN_ZEKERHEID) -> list[dict]:
    """Alle skeletten van één frame → detecties; ruis-skeletten vallen weg."""
    uit: list[dict] = []
    for keypoints, scores in zip(keypoints_per_persoon, scores_per_persoon):
        det = persoon_uit_keypoints(keypoints, scores, min_zekerheid)
        if det is not None:
            uit.append(det)
    return uit


# ---------------------------------------------------------------------------
# De modellaag (alleen hier is rtmlib nodig — lui, zoals houding.py dat doet)
# ---------------------------------------------------------------------------


def beschikbaar() -> bool:
    """Is rtmlib geïnstalleerd? (Zonder te importeren — importeren is duur.)

    Hiermee kiest de CLI van tracking.py/spelers.py zélf: model waar het kan,
    de klassieke blob-weg waar het niet kan — zonder de gebruiker met een
    stacktrace of harde eis op te zadelen.
    """
    try:
        return importlib.util.find_spec('rtmlib') is not None
    except (ImportError, ValueError):
        return False


def laad_model(mode: str = 'balanced'):
    """Het houdingsmodel — gedelegeerd aan ``houding.laad_model``.

    Bewust hergebruikt in plaats van gekopieerd: zo is het lui-laadpatroon én
    de foutmelding ("rtmlib ontbreekt — installeer met: pip install -r
    cv/requirements-pose.txt") gegarandeerd identiek, en delen beide modules
    dezelfde gewichten-cache op de server.
    """
    import houding  # noqa: PLC0415 — lui: houding importeert pas hier

    return houding.laad_model(mode)


def maak_pose_bron(model, min_zekerheid: float = MIN_ZEKERHEID):
    """Verpak een houdingsmodel als detectiebron: functie ``frame -> detecties``.

    De bron-vorm (gewoon een functie) is het injectiepunt: tests en
    alternatieve detectoren geven een eigen functie mee en hoeven niets van
    rtmlib te weten.
    """
    def bron(frame) -> list[dict]:
        keypoints, scores = model(frame)
        return detecties_uit_pose(keypoints, scores, min_zekerheid)

    return bron


def laad_bron(mode: str = 'balanced'):
    """Model laden én verpakken — de ene aanroep die de CLI's nodig hebben."""
    return maak_pose_bron(laad_model(mode))
