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
er "verder weg" uit zien dan hij is. Verdwijnt de bal vlak vóór de grond achter een speler,
dan wordt de parabool daarom doorgetrokken tot zijn grondpunt in plaats van te stoppen op de
laatste blob (die hangt nog in de lucht); de uitvoer zegt erbij of de landing gezien is.

Eén stelsel om in te rekenen
----------------------------
De blobs komen per frame in de pixels van dát frame. Beweegt de camera, dan is "dezelfde
plek" elk frame een ander pixelpunt — één parabool door die mengelmoes fitten verlegt de
landing of drukt de kromming weg. Daarom gaan alle kandidaten éérst naar één
referentiestelsel: via het homografiespoor van ``volg_veld.py`` (``--homografie``) als dat
er is, anders door de frame-op-frame-stappen die de cameracompensatie toch al schat aan
elkaar te ketenen. Valt zo'n stap weg (te weinig volgpunten), dan is dat een mogelijke
camerasprong: het spoor breekt in stukken, en stukken worden nooit gemengd — een baan door
twee stelsels bestaat in geen enkel frame.

De rekenkern (fitten, kiezen, registreren, landing bepalen) is puur en wordt getest met
verzonnen banen, inclusief ruis, ontbrekende beelden, camerabeweging en rondlopende spelers
als stoorzenders.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Het matrixrekenen (puur stdlib) staat al in volg_veld.py — hier hergebruikt in plaats van
# herschreven, zodat beide modules dezelfde homografie-conventies delen.
from volg_veld import (  # noqa: E402
    HomografieSpoor, Matrix, eenheid, inverteer, maal, normaliseer, projecteer,
)

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


def landingsmoment(
    model: dict, punten: list[tuple[float, float, float]], grond_y: float | None = None,
) -> tuple[float, float, float, bool]:
    """Waar en wanneer de bal neerkomt — en of dat grondpunt ook echt gezien is.

    De laatste blob is niet per se de grond: verdwijnt de bal vlak vóór de landing achter
    een speler, dan hangt dat laatste punt nog in de lucht, en de grondhomografie zet een
    luchtpunt systematisch te ver van de camera (meters fout op het veld). Daarom wordt de
    parabool doorgetrokken tot zijn grondpunt: tot ``grond_y`` (de beeld-y van het veldvlak)
    als de aanroeper die kent, anders tot de baan per symmetrie terug op loslaathoogte hangt
    — de hand is niet de grond, maar het scheelt het gros van de occlusiefout. ``gezien``
    zegt of de bal op het gekozen moment nog gemeten is (False = doorgetrokken), zodat de
    keten een geschatte landing als minder zeker kan tonen.
    """
    t_eind = max(p[0] for p in punten)
    t_begin = min(p[0] for p in punten)
    top = -model['dy'] / (2 * model['ey']) if model['ey'] > 0 else t_eind
    # Symmetrie: een parabool daalt even lang als hij steeg, dus op 2·top − begin hangt de
    # bal weer op de hoogte waar hij losgelaten werd. Zagen we de stijgende tak niet
    # (top ≤ begin), dan zegt symmetrie niets en blijft het laatste meetpunt over.
    t_grond = max(top, 2 * top - t_begin)
    if grond_y is not None and model['ey'] > 0:
        # De grondlijn is bekend: neem het snijpunt van de dalende tak daarmee (grootste
        # wortel). Haalt de gefitte boog de grondlijn niet, dan valt hij terug op symmetrie.
        disc = model['dy'] ** 2 - 4 * model['ey'] * (model['cy'] - grond_y)
        if disc >= 0:
            t_grond = (-model['dy'] + math.sqrt(disc)) / (2 * model['ey'])
    t = max(t_eind, top, t_grond)  # nooit vóór het hoogste punt landen
    x = model['ax'] + model['bx'] * t
    y = model['cy'] + model['dy'] * t + model['ey'] * t * t
    return t, x, y, t <= t_eind + 1e-9


def loslaatmoment(model: dict, punten: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    """Het begin van de baan: waar de bal de hand verlaat."""
    t = min(p[0] for p in punten)
    return t, model['ax'] + model['bx'] * t, model['cy'] + model['dy'] * t + model['ey'] * t * t


# ---------------------------------------------------------------------------
# Registreren: alle kandidaten naar één referentiestelsel (puur)
# ---------------------------------------------------------------------------

# Eén bemonsterd frame: (tijd, blobs op balgrootte, camerastap). De stap is de matrix die
# pixels van het vórige frame op dit frame legt — de cameracompensatie schat hem toch al —
# of None wanneer die schatting er niet was: dan is de stap onbekend.
Waarneming = tuple[float, list[tuple[float, float]], Matrix | None]
# Eén stuk zonder camerasprong: de kandidaten in referentiepixels, plus per frametijd de
# matrix die dat frame naar de referentie bracht (nodig om er ook weer uit te komen).
Stuk = tuple[list[tuple[float, float, float]], dict[float, Matrix]]


def registreer_ketenend(waarnemingen: list[Waarneming]) -> list[Stuk]:
    """Breng elk frame naar het stelsel van het eerste frame van zijn stuk.

    De camerastappen worden aan elkaar geketend: wat de camera sinds het referentieframe
    deed, wordt uit elke blobpositie teruggedraaid, zodat de baanfit één stelsel ziet. Een
    frame zónder (bruikbare) stap is een mogelijke camerasprong: daar breekt de keten en
    begint een nieuw stuk met een eigen referentie. Stukken onderling verhouden zich op een
    onbekende manier — precies wat er ontbrak — dus die worden nooit gemengd.
    """
    stukken: list[Stuk] = []
    kandidaten: list[tuple[float, float, float]] = []
    registratie: dict[float, Matrix] = {}
    keten = eenheid()
    for i, (t, blobs, stap) in enumerate(waarnemingen):
        volgende: Matrix | None = None
        if i > 0 and stap is not None:
            try:
                # De stap legt het vórige frame op dít frame; naar de referentie is dus de
                # inverse, geketend aan wat er al stond.
                volgende = normaliseer(maal(keten, inverteer(stap)))
            except ValueError:
                volgende = None  # een ontaarde stap is even onbruikbaar als geen stap
        if i > 0 and volgende is None:
            if registratie:
                stukken.append((kandidaten, registratie))
            kandidaten, registratie = [], {}
            keten = eenheid()
        elif i > 0:
            keten = volgende
        registratie[t] = keten
        for x, y in blobs:
            rx, ry = projecteer(keten, x, y)
            kandidaten.append((t, rx, ry))
    if registratie:
        stukken.append((kandidaten, registratie))
    return stukken


def registreer_met_veldspoor(waarnemingen: list[Waarneming], matrix_op) -> list[Stuk]:
    """Breng alle frames via het veldvlak naar het stelsel van het eerste frame mét veldstand.

    ``matrix_op`` (bv. ``HomografieSpoor.op`` uit volg_veld.py) geeft per moment de
    beeld→veld-matrix. Beeld_t → veld → beeld_referentie registreert dan elk frame in
    hetzelfde stelsel — óók over een camerasprong heen, want beide kanten kennen hun eigen
    veldstand. Exact voor grondpunten, en voor een draaiende camera (pannen, kantelen) ook
    voor de bal in de lucht. Frames zonder veldstand vallen weg: liever een gat in de baan
    dan kandidaten in een zwevend stelsel.
    """
    kandidaten: list[tuple[float, float, float]] = []
    registratie: dict[float, Matrix] = {}
    ref_inv: Matrix | None = None
    for t, blobs, _stap in waarnemingen:
        h = matrix_op(t)
        if h is None:
            continue
        try:
            if ref_inv is None:
                ref_inv = inverteer(h)
            k = normaliseer(maal(ref_inv, h))
        except ValueError:
            continue  # een ontaarde veldstand kan geen registratie dragen
        registratie[t] = k
        for x, y in blobs:
            rx, ry = projecteer(k, x, y)
            kandidaten.append((t, rx, ry))
    return [(kandidaten, registratie)] if registratie else []


def beste_baan_uit_stukken(
    stukken: list[Stuk],
    min_punten: int = MIN_PUNTEN,
    tolerantie: float = TOLERANTIE_PX,
    rondes: int = RONDES,
    seed: int = 7,
) -> tuple[dict, list[tuple[float, float, float]], dict[float, Matrix]] | None:
    """Zoek in elk stuk apart de baan en hou de beste (meeste passende punten).

    Over een camerasprong heen fitten zou punten uit verschillende stelsels mengen — een
    "baan" die in geen enkel frame bestaat — dus elk stuk staat op zichzelf.
    """
    beste = None
    for kandidaten, registratie in stukken:
        gekozen = kies_baan(kandidaten, min_punten, tolerantie, rondes, seed)
        if gekozen is not None and (beste is None or len(gekozen[1]) > len(beste[1])):
            beste = (gekozen[0], gekozen[1], registratie)
    return beste


def naar_framepixels(registratie: dict[float, Matrix], t: float, x: float, y: float) -> tuple[float, float]:
    """Referentiestelsel → de pixels van het frame dat het dichtst bij ``t`` ligt.

    De uitvoer van de baan hoort in de pixels van het frame van elk moment, want dáár geldt
    de grondhomografie van de rest van de keten. Een geëxtrapoleerde landing valt ná het
    laatste geziene frame; de camerastand van het dichtstbijzijnde bekende frame is dan de
    best beschikbare benadering.
    """
    if not registratie:
        return x, y
    t_frame = min(registratie, key=lambda ft: abs(ft - t))
    return projecteer(inverteer(registratie[t_frame]), x, y)


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


def bewegende_blobs(
    cv2, vorig_grijs, grijs, min_px: float, max_px: float,
) -> tuple[list[tuple[float, float]], Matrix | None]:
    """Wat er beweegt ná het wegrekenen van de camerabeweging, plus die camerastap zelf.

    Zonder die compensatie is bij een pannende camera het hele beeld "beweging" en houd je
    niets bruikbaars over. Met compensatie blijven alleen de spelers en de bal over — en de
    grootte zeeft daar de bal uit. De geschatte stap (vorig frame → dit frame) gaat mee
    terug: daarmee worden de blobs later naar één referentiestelsel geketend in plaats van
    per frame in een ander stelsel te blijven staan. Lukt de schatting niet, dan is de stap
    None — de aanroeper weet dan dat dit frame niet aan het vorige te verbinden is.
    """
    import numpy as np  # noqa: PLC0415

    uitgelijnd, masker, stap = vorig_grijs, None, None
    p0 = cv2.goodFeaturesToTrack(vorig_grijs, maxCorners=300, qualityLevel=0.01, minDistance=12)
    if p0 is not None and len(p0) >= 8:
        p1, status, _ = cv2.calcOpticalFlowPyrLK(vorig_grijs, grijs, p0, None)
        goed_oud = p0[status.flatten() == 1].reshape(-1, 2)
        goed_nieuw = p1[status.flatten() == 1].reshape(-1, 2)
        if len(goed_oud) >= 8:
            m, _ = cv2.findHomography(goed_oud, goed_nieuw, cv2.RANSAC, 3.0)
            if m is not None:
                stap = [[float(w) for w in rij] for rij in m]
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
    return uit, stap


def verzamel_waarnemingen(
    videopad: Path, van_s: float, tot_s: float, min_px: float, max_px: float
) -> list[Waarneming]:
    """Per frame in dit tijdvenster: (t, balgrote bewegende blobs, camerastap)."""
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
    uit: list[Waarneming] = []
    while True:
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        if t > tot_s:
            break
        ok, frame = cap.read()
        if not ok:
            break
        grijs = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blobs, stap = bewegende_blobs(cv2, vorig_grijs, grijs, min_px, max_px)
        uit.append((round(t, 3), blobs, stap))
        vorig_grijs = grijs
    cap.release()
    return uit


def baan_rond_worp(
    videopad: Path, worp_s: float, na_s: float = 6.0, min_px: float = 4.0, max_px: float = 40.0,
    rondes: int = RONDES, matrix_op=None,
) -> dict | None:
    """De balbaan die bij deze worp hoort, met loslaat- en landingspunt in beeldcoördinaten.

    `rondes` is hoe vaak RANSAC een baan probeert. Meer rondes kost bijna niets naast het
    decoderen van de video, maar verkleint de kans dat de bal ondersneeuwt tussen de bewegende
    spelers: op een druk beeld met veertig kandidaatblobs is 200 keer proberen niet altijd
    genoeg om de juiste drie punten te treffen.

    `matrix_op` is de beeld→veld-matrix per moment (het volg_veld-spoor): daarmee worden de
    kandidaten via het veldvlak in één stelsel gezet, ook over een camerasprong heen. Zonder
    spoor worden de geschatte camerastappen geketend en wordt per aaneengesloten stuk gefit.
    """
    waarnemingen = verzamel_waarnemingen(videopad, worp_s, worp_s + na_s, min_px, max_px)
    if matrix_op is not None:
        stukken = registreer_met_veldspoor(waarnemingen, matrix_op)
    else:
        stukken = registreer_ketenend(waarnemingen)
    beste = beste_baan_uit_stukken(stukken, rondes=rondes)
    if beste is None:
        return None
    model, punten, registratie = beste
    los_t, los_xr, los_yr = loslaatmoment(model, punten)
    land_t, land_xr, land_yr, gezien = landingsmoment(model, punten)
    # De fit leeft in het referentiestelsel; de uitvoer hoort in de pixels van het frame van
    # elk moment zelf — dáár geldt de grondhomografie van de rest van de keten.
    los_x, los_y = naar_framepixels(registratie, los_t, los_xr, los_yr)
    land_x, land_y = naar_framepixels(registratie, land_t, land_xr, land_yr)
    return {
        'worp_s': round(worp_s, 3),
        'punten': len(punten),
        'kandidaten': sum(len(k) for k, _ in stukken),
        'stukken': len(stukken),
        'los': {'t': round(los_t, 3), 'x': round(los_x, 1), 'y': round(los_y, 1)},
        'landing': {'t': round(land_t, 3), 'x': round(land_x, 1), 'y': round(land_y, 1),
                    'gezien': gezien},
        'spoor': [[round(t, 3), *(round(w, 1) for w in naar_framepixels(registratie, t, x, y))]
                  for t, x, y in punten],
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
    p.add_argument('--rondes', type=int, default=RONDES,
                   help=f'hoe vaak RANSAC een baan probeert (standaard {RONDES}). Meer rondes '
                        'kost weinig naast het decoderen en vindt de bal vaker terug op een '
                        'druk beeld.')
    p.add_argument('--homografie', type=Path, default=None,
                   help='homografie-JSONL van volg_veld.py — zet bij een bewegende camera de '
                        'balkandidaten via het veldvlak eerst in één stelsel, ook over een '
                        'camerasprong heen')
    args = p.parse_args(argv)

    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')
    if not args.detecties.is_file():
        _fout(f'detecties niet gevonden: {args.detecties}')
    matrix_op = None
    if args.homografie is not None:
        if not args.homografie.is_file():
            _fout(f'homografiebestand niet gevonden: {args.homografie} (maak het met cv/volg_veld.py)')
        spoor = HomografieSpoor.lees(args.homografie)
        if not spoor.punten:
            _fout(f'{args.homografie} bevat geen momenten')
        matrix_op = spoor.op

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
        baan = baan_rond_worp(args.video, float(t), args.na, args.min_px, args.max_px,
                              args.rondes, matrix_op)
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
