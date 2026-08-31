#!/usr/bin/env python3
"""De bal volgen als bállistische baan, niet als losse stipjes.

Waarom dit bestaat
------------------
De balvolging in ``landing.py`` gebruikt achtergrondsubtractie (MOG2) en kiest per beeld de
blob die het dichtst bij de vorige lag. Twee problemen:

1. Achtergrondsubtractie veronderstelt een **stilstaande** camera. Pant de camera mee met het
   spel, dan is zowat elke pixel "voorgrond" en blijft er niets over om uit te kiezen.
2. Zonder baanmodel is elke bewegende blob evenveel waard: een speler die voorbijloopt kaapt
   het spoor even makkelijk als de bal.

Deze module lost allebei op. De camerabeweging wordt eerst weggerekend (het vorige beeld wordt
met de gevonden verplaatsing op het huidige gelegd), en uit de overblijvende kandidaten wordt
de combinatie gekozen die samen een **worpbaan** vormt.

Waarom een parabool
-------------------
Een geworpen bal valt vrij: zijn hoogte volgt een parabool in de tijd, zijn horizontale
verplaatsing is rechtlijnig en gelijkmatig. In het beeld ziet dat er over enkele seconden ook
zo uit (voor een camera op afstand is de vertekening klein):

    x(t) = a + b·t                (rechtlijnig)
    y(t) = c + d·t + e·t²         (parabool; e > 0 want beeld-y wijst naar beneden)

Dat model doet twee dingen tegelijk. Het **verwerpt** blobs die geen baan vormen — een
rondlopende speler haalt een parabool nooit — en het **vult in** wat de detector mist: door
een gat van een paar beelden (occlusie, motion blur) loopt de baan gewoon door.

Het landingspunt volgt dan uit het model in plaats van uit de laatste toevallige blob, en dát
is het punt dat door de homografie naar veldmeters gaat. Belangrijk: de homografie geldt alleen
voor punten óp de grond, dus enkel op het moment dat de bal neerkomt — een bal in de lucht zou
er "verder weg" uit zien dan hij is.

De rekenkern (fitten, kiezen, landing bepalen) is puur en wordt getest met verzonnen banen,
inclusief ruis, ontbrekende beelden en rondlopende spelers als stoorzenders.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Een baan telt pas als baan vanaf zoveel punten die erop passen.
MIN_PUNTEN = 5
# Zo ver mag een gemeten balpositie van de gefitte baan liggen (pixels).
TOLERANTIE_PX = 12.0
# Zoveel keer een baan proberen uit een willekeurige greep punten.
RONDES = 200
# Hoe ver de baan minstens moet doorbuigen over zijn eigen duur (pixels). Dit is de scheiding
# tussen een bal en een speler: een rechtlopende speler ís een parabool met kromming nul en
# past dus perfect op het model. Zonder deze eis koos de fit vrolijk een groepje wandelaars.
MIN_KROMMING_PX = 15.0
# Korter dan dit is geen baan maar een toevalligheid.
MIN_DUUR_S = 0.2
# Op zoveel van de beelden binnen de baan moet de bal ook echt gezien zijn. Een vliegende bal
# is in bijna elk beeld zichtbaar; een handvol punten van verschillende spelers, met gaten
# ertussen, lijkt anders zo een steile val. (Dat gebeurde: vijf wandelaarspunten met een gat
# van een kwart seconde gaven een "baan" met een kromming van 361 px.)
MIN_DEKKING = 0.6


def fit_lineair(ts: list[float], ws: list[float]) -> tuple[float, float] | None:
    """w(t) = a + b·t, kleinste kwadraten. None als de tijden samenvallen."""
    n = len(ts)
    if n < 2:
        return None
    st, sw = sum(ts), sum(ws)
    stt = sum(t * t for t in ts)
    stw = sum(t * w for t, w in zip(ts, ws))
    noemer = n * stt - st * st
    if abs(noemer) < 1e-12:
        return None
    b = (n * stw - st * sw) / noemer
    a = (sw - b * st) / n
    return a, b


def fit_parabool(ts: list[float], ws: list[float]) -> tuple[float, float, float] | None:
    """w(t) = c + d·t + e·t², kleinste kwadraten via de normaalvergelijkingen.

    Puur stdlib: drie onbekenden, dus een 3×3-stelsel dat met Gauss-eliminatie opgelost wordt.
    """
    n = len(ts)
    if n < 3:
        return None
    machten = [sum(t ** k for t in ts) for k in range(5)]
    rechts = [sum(w * t ** k for t, w in zip(ts, ws)) for k in range(3)]
    a = [[machten[i + j] for j in range(3)] + [rechts[i]] for i in range(3)]
    # Gauss met partieel pivoteren.
    for kol in range(3):
        pivot = max(range(kol, 3), key=lambda r: abs(a[r][kol]))
        if abs(a[pivot][kol]) < 1e-12:
            return None
        a[kol], a[pivot] = a[pivot], a[kol]
        for rij in range(3):
            if rij == kol:
                continue
            f = a[rij][kol] / a[kol][kol]
            for k in range(kol, 4):
                a[rij][k] -= f * a[kol][k]
    return tuple(a[i][3] / a[i][i] for i in range(3))  # type: ignore[return-value]


def baanfout(model: dict, t: float, x: float, y: float) -> float:
    """Hoe ver ligt een gemeten punt van de baan? (pixels)"""
    xm = model['ax'] + model['bx'] * t
    ym = model['cy'] + model['dy'] * t + model['ey'] * t * t
    return math.hypot(x - xm, y - ym)


def bouw_model(punten: list[tuple[float, float, float]]) -> dict | None:
    """Fit één baan door deze punten: rechtlijnig in x, parabolisch in y."""
    ts = [p[0] for p in punten]
    lijn = fit_lineair(ts, [p[1] for p in punten])
    boog = fit_parabool(ts, [p[2] for p in punten])
    if lijn is None or boog is None:
        return None
    return {'ax': lijn[0], 'bx': lijn[1], 'cy': boog[0], 'dy': boog[1], 'ey': boog[2]}


def kies_baan(
    kandidaten: list[tuple[float, float, float]],
    min_punten: int = MIN_PUNTEN,
    tolerantie: float = TOLERANTIE_PX,
    rondes: int = RONDES,
    seed: int = 7,
) -> tuple[dict, list[tuple[float, float, float]]] | None:
    """Zoek de baan waar de meeste kandidaten op liggen (RANSAC).

    Uit alle bewegende blobs — bal, spelers, een wapperende vlag — komt zo de enige groep die
    zich als een vallend voorwerp gedraagt. Elke ronde: neem drie punten van verschillende
    momenten, leg er een baan door, tel wie er op past. De beste wint, en daarna wordt de baan
    opnieuw gefit op ál zijn passende punten.
    """
    if len(kandidaten) < min_punten:
        return None
    rng = random.Random(seed)
    per_tijd: dict[float, list[tuple[float, float, float]]] = {}
    for p in kandidaten:
        per_tijd.setdefault(p[0], []).append(p)
    tijden = sorted(per_tijd)
    if len(tijden) < 3:
        return None

    beste: tuple[int, dict, list] | None = None
    for _ in range(rondes):
        drie = rng.sample(tijden, 3)
        greep = [rng.choice(per_tijd[t]) for t in drie]
        model = bouw_model(greep)
        if model is None or model['ey'] <= 0:
            continue  # ey ≤ 0 = niet vallend (beeld-y wijst naar beneden)
        passend = [p for p in kandidaten if baanfout(model, *p) <= tolerantie]
        # Hoogstens één punt per moment: de bal is er maar één.
        uniek: dict[float, tuple[float, float, float]] = {}
        for p in passend:
            if p[0] not in uniek or baanfout(model, *p) < baanfout(model, *uniek[p[0]]):
                uniek[p[0]] = p
        gekozen = sorted(uniek.values())
        if len(gekozen) < min_punten or not valt_echt(model, gekozen):
            continue
        if dekking(gekozen, tijden) < MIN_DEKKING:
            continue
        if beste is None or len(gekozen) > beste[0]:
            beste = (len(gekozen), model, gekozen)

    if beste is None:
        return None
    verfijnd = bouw_model(beste[2]) or beste[1]
    # Na het verfijnen nog eens toetsen: de hernieuwde fit mag de kromming niet wegpoetsen.
    if not valt_echt(verfijnd, beste[2]):
        return None
    return verfijnd, beste[2]


def dekking(punten: list[tuple[float, float, float]], alle_tijden: list[float]) -> float:
    """Op welk deel van de beelden binnen de baan is de bal ook echt gezien?

    Een bal die door de lucht gaat, staat op bijna elk beeld. Losse punten van verschillende
    spelers, met gaten ertussen, halen dit nooit — en dat is precies het verschil.
    """
    if not punten:
        return 0.0
    t0, t1 = min(p[0] for p in punten), max(p[0] for p in punten)
    binnen = [t for t in alle_tijden if t0 <= t <= t1]
    if not binnen:
        return 0.0
    return len(punten) / len(binnen)


def valt_echt(model: dict, punten: list[tuple[float, float, float]]) -> bool:
    """Buigt deze baan genoeg door om een vallend voorwerp te zijn?

    De doorslaggevende toets. Een speler die in een rechte lijn loopt past exact op het model
    (met kromming nul), dus zonder deze eis is elke wandelaar een bal. Gemeten over de duur van
    de baan zelf: ey·T² is hoeveel pixels de baan afwijkt van een rechte lijn.
    """
    if model.get('ey', 0.0) <= 0:
        return False
    tijden = [p[0] for p in punten]
    duur = max(tijden) - min(tijden)
    if duur < MIN_DUUR_S:
        return False
    return model['ey'] * duur * duur >= MIN_KROMMING_PX


def landingsmoment(model: dict, punten: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    """Waar en wanneer de bal neerkomt: het laatste moment van de dalende tak.

    Uit het model in plaats van uit de laatste gemeten blob — dat scheelt de sprong die één
    verkeerde detectie anders veroorzaakt, en werkt ook als de bal net vóór de grond achter
    een speler verdwijnt.
    """
    t_eind = max(p[0] for p in punten)
    top = -model['dy'] / (2 * model['ey']) if model['ey'] > 0 else t_eind
    t = max(t_eind, top)  # nooit vóór het hoogste punt landen
    x = model['ax'] + model['bx'] * t
    y = model['cy'] + model['dy'] * t + model['ey'] * t * t
    return t, x, y


def loslaatmoment(model: dict, punten: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    """Het begin van de baan: waar de bal de hand verlaat."""
    t = min(p[0] for p in punten)
    return t, model['ax'] + model['bx'] * t, model['cy'] + model['dy'] * t + model['ey'] * t * t


# ---------------------------------------------------------------------------
# De laag die beelden leest (alleen hier is opencv nodig)
# ---------------------------------------------------------------------------


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


def _laad_cv2():
    try:
        import cv2  # noqa: PLC0415
        return cv2
    except ImportError:
        _fout('opencv ontbreekt — installeer met: pip install -r cv/requirements.txt')


def bewegende_blobs(cv2, vorig_grijs, grijs, min_px: float, max_px: float) -> list[tuple[float, float]]:
    """Wat er beweegt ná het wegrekenen van de camerabeweging, op balgrootte gefilterd.

    Zonder die compensatie is bij een pannende camera het hele beeld "beweging" en houd je
    niets bruikbaars over. Met compensatie blijven alleen de spelers en de bal over — en de
    grootte zeeft daar de bal uit.
    """
    import numpy as np  # noqa: PLC0415

    uitgelijnd, masker = vorig_grijs, None
    p0 = cv2.goodFeaturesToTrack(vorig_grijs, maxCorners=300, qualityLevel=0.01, minDistance=12)
    if p0 is not None and len(p0) >= 8:
        p1, status, _ = cv2.calcOpticalFlowPyrLK(vorig_grijs, grijs, p0, None)
        goed_oud = p0[status.flatten() == 1].reshape(-1, 2)
        goed_nieuw = p1[status.flatten() == 1].reshape(-1, 2)
        if len(goed_oud) >= 8:
            m, _ = cv2.findHomography(goed_oud, goed_nieuw, cv2.RANSAC, 3.0)
            if m is not None:
                uitgelijnd = cv2.warpPerspective(vorig_grijs, m, (grijs.shape[1], grijs.shape[0]))
                masker = cv2.warpPerspective(np.full_like(vorig_grijs, 255), m,
                                             (grijs.shape[1], grijs.shape[0])) > 0

    verschil = cv2.absdiff(grijs, uitgelijnd)
    if masker is not None:
        verschil = np.where(masker, verschil, 0).astype('uint8')
    _, drempel = cv2.threshold(verschil, 25, 255, cv2.THRESH_BINARY)
    drempel = cv2.morphologyEx(drempel, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    contouren, _ = cv2.findContours(drempel, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    uit: list[tuple[float, float]] = []
    for c in contouren:
        (cx, cy), straal = cv2.minEnclosingCircle(c)
        if min_px <= 2 * straal <= max_px:
            uit.append((float(cx), float(cy)))
    return uit


def verzamel_kandidaten(
    videopad: Path, van_s: float, tot_s: float, min_px: float, max_px: float
) -> list[tuple[float, float, float]]:
    """Alle balgrote bewegende blobs in dit tijdvenster, als (t, x, y)."""
    cv2 = _laad_cv2()
    cap = cv2.VideoCapture(str(videopad))
    if not cap.isOpened():
        _fout(f'kan video niet openen: {videopad}')
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, van_s - 1.0 / fps) * 1000.0)
    ok, vorig = cap.read()
    if not ok:
        cap.release()
        return []
    vorig_grijs = cv2.cvtColor(vorig, cv2.COLOR_BGR2GRAY)
    uit: list[tuple[float, float, float]] = []
    while True:
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        if t > tot_s:
            break
        ok, frame = cap.read()
        if not ok:
            break
        grijs = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        for x, y in bewegende_blobs(cv2, vorig_grijs, grijs, min_px, max_px):
            uit.append((round(t, 3), x, y))
        vorig_grijs = grijs
    cap.release()
    return uit


def baan_rond_worp(
    videopad: Path, worp_s: float, na_s: float = 6.0, min_px: float = 4.0, max_px: float = 40.0
) -> dict | None:
    """De balbaan die bij deze worp hoort, met loslaat- en landingspunt in beeldcoördinaten."""
    kandidaten = verzamel_kandidaten(videopad, worp_s, worp_s + na_s, min_px, max_px)
    gekozen = kies_baan(kandidaten)
    if gekozen is None:
        return None
    model, punten = gekozen
    los_t, los_x, los_y = loslaatmoment(model, punten)
    land_t, land_x, land_y = landingsmoment(model, punten)
    return {
        'worp_s': round(worp_s, 3),
        'punten': len(punten),
        'kandidaten': len(kandidaten),
        'los': {'t': round(los_t, 3), 'x': round(los_x, 1), 'y': round(los_y, 1)},
        'landing': {'t': round(land_t, 3), 'x': round(land_x, 1), 'y': round(land_y, 1)},
        'spoor': [[round(t, 3), round(x, 1), round(y, 1)] for t, x, y in punten],
    }


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(
        description='Balbanen zoeken rond de gevonden worpen (camerabeweging weggerekend).')
    p.add_argument('video', type=Path)
    p.add_argument('--detecties', type=Path, required=True, help='de worp-events (JSONL)')
    p.add_argument('--uit', type=Path, required=True, help='uitvoer: één baan per worp (JSONL)')
    p.add_argument('--na', type=float, default=6.0, help='hoeveel seconden na de worp zoeken (standaard 6)')
    p.add_argument('--min-px', type=float, default=4.0, help='minimale baldoorsnede in pixels')
    p.add_argument('--max-px', type=float, default=40.0, help='maximale baldoorsnede in pixels')
    args = p.parse_args(argv)

    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')
    if not args.detecties.is_file():
        _fout(f'detecties niet gevonden: {args.detecties}')

    worpen = []
    with args.detecties.open(encoding='utf-8') as f:
        for regel in f:
            regel = regel.strip()
            if regel:
                worpen.append(json.loads(regel))

    banen = []
    for e in worpen:
        t = e.get('video_time_s')
        if t is None:
            continue
        baan = baan_rond_worp(args.video, float(t), args.na, args.min_px, args.max_px)
        if baan is not None:
            banen.append(baan)

    with args.uit.open('w', encoding='utf-8') as f:
        for b in banen:
            f.write(json.dumps(b, ensure_ascii=False) + '\n')
    print(f'{len(banen)} balbanen van {len(worpen)} worpen → {args.uit}')
    if worpen and not banen:
        print('  Geen enkele baan gevonden. Is de bal groot genoeg in beeld (--min-px/--max-px), '
              'en staat er genoeg contrast op?')


if __name__ == '__main__':
    main()
