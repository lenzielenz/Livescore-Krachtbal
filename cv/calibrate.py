#!/usr/bin/env python3
"""Veldkalibratie voor de CV-pipeline (fase 0): homografie beeld ↔ veld.

Koppelt pixelcoördinaten in een videoframe aan veldcoördinaten in meters via
de gekende lijn-kruispunten uit ``veld.py`` (achterlijn/doellijn/vrijeworplijn/
middellijn × beide zijlijnen). Minstens 4 punten → cv2.findHomography.

Twee modi:

1. Interactief (OpenCV-venster):
       python3 cv/calibrate.py --beeld frames/wedstrijd/frame_000001.jpg \
           --diepte 10 --uit kalibratie.json
   Het venster vraagt kruispunt per kruispunt om een klik; toetsen:
   s = dit kruispunt overslaan, u = laatste klik ongedaan maken,
   ENTER/q = klaar, ESC = afbreken zonder opslaan.

2b. Vrije ankerpunten (--anker "px,py=x_m,y_m[:naam]"): vaste punten BUITEN het veldmodel,
   met hun veldcoördinaten afgelezen van een luchtfoto. Bedoeld voor een terrein dat geen nette
   rechthoek is, voor lijnen die half onbruikbaar zijn, en om de kalibratie vast te houden waar
   de witte lijnen tekortschieten. Combineerbaar met --punt.

2. Headless (herhaalbare --punt argumenten, formaat "px,py=LABEL"):
       python3 cv/calibrate.py --diepte 10 --uit kalibratie.json \
           --punt "812,1013=doellijn_thuis_links" \
           --punt "1522,1001=doellijn_thuis_rechts" \
           --punt "690,1450=achterlijn_thuis_links" \
           --punt "1730,1430=achterlijn_thuis_rechts"

Rapport (reprojectiefout per punt + gemiddelde, in pixels):
       python3 cv/calibrate.py --test kalibratie.json

cv2 wordt lazy geïmporteerd: enkel het fitten (findHomography) en de
interactieve modus hebben OpenCV nodig; ``--test`` en ``veld.py`` draaien
puur op stdlib.
"""

from __future__ import annotations

import argparse
import datetime
import json
import math
import sys
from pathlib import Path

# calibrate.py wordt als script gedraaid (python3 cv/calibrate.py); de map van
# dit bestand staat dan op sys.path, dus `import veld` werkt zonder package.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import veld  # noqa: E402


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    sys.exit(code)


def _laad_cv2():
    """Lazy import van OpenCV, met een nette foutmelding als het ontbreekt."""
    try:
        import cv2  # noqa: PLC0415
    except ImportError:
        _fout(
            'OpenCV (cv2) is niet geïnstalleerd — nodig voor het fitten van de homografie '
            'en de interactieve modus. Installeer met: pip install -r cv/requirements.txt'
        )
    return cv2


# ---------------------------------------------------------------------------
# Punten verzamelen
# ---------------------------------------------------------------------------

def parse_punt_argument(tekst: str, labels: dict[str, veld.Kruispunt]) -> dict:
    """Parse één headless --punt argument: "px,py=LABEL" → puntrecord."""
    if '=' not in tekst:
        _fout(f'--punt "{tekst}" mist "=LABEL" (verwacht formaat: "px,py=LABEL")')
    coördinaat, label = tekst.split('=', 1)
    label = label.strip().lower()
    if label not in labels:
        beschikbaar = ', '.join(sorted(labels))
        _fout(f'onbekend kruispunt-label "{label}". Beschikbaar: {beschikbaar}')
    delen = coördinaat.split(',')
    if len(delen) != 2:
        _fout(f'--punt "{tekst}": pixelcoördinaat moet "px,py" zijn')
    try:
        px, py = float(delen[0]), float(delen[1])
    except ValueError:
        _fout(f'--punt "{tekst}": pixelcoördinaat is geen getal')
    k = labels[label]
    return {'label': k.label, 'beeld_px': [px, py], 'veld_m': [k.x_m, k.y_m]}


def parse_anker_argument(tekst: str, nummer: int) -> dict:
    """Parse één ``--anker`` argument: ``"px,py=x_m,y_m[:naam]"`` → puntrecord.

    Een ANKER is een vast punt dat níét op het veldmodel staat: de hoek van de omheining, een
    verlichtingspaal, de hoek van de kantine. Je leest zijn veldcoördinaten af op een luchtfoto
    (voor Vlaanderen: de open orthofoto's van Geopunt) en tikt ze hier in.

    Waarom dat de moeite is. De kalibratie hangt aan de witte lijnen, en die zijn niet altijd de
    waarheid: een terrein dat geen nette rechthoek is, lijnen die half onder spelers of sneeuw
    liggen, of een camera die zo pant dat de lijnen uit beeld gaan. Een ankerpunt buiten het veld
    blijft dan wél staan, en houdt de homografie op zijn plaats.

    Het record heeft dezelfde vorm als dat van een lijnkruising, zodat alles erna — de fit, het
    reprojectierapport, het lensmodel, het camerastandpunt — er niets van hoeft te weten.
    """
    if '=' not in tekst:
        _fout(f'--anker "{tekst}" mist "=x_m,y_m" (verwacht: "px,py=x_m,y_m[:naam]")')
    beeld_deel, veld_deel = tekst.split('=', 1)
    naam = None
    if ':' in veld_deel:
        veld_deel, naam = veld_deel.split(':', 1)
        naam = naam.strip() or None

    def _paar(stuk: str, wat: str) -> tuple[float, float]:
        delen = stuk.split(',')
        if len(delen) != 2:
            _fout(f'--anker "{tekst}": {wat} moet "a,b" zijn')
        try:
            return float(delen[0]), float(delen[1])
        except ValueError:
            _fout(f'--anker "{tekst}": {wat} is geen getal')
        raise AssertionError  # _fout stopt het programma; enkel voor de typechecker

    px, py = _paar(beeld_deel, 'pixelcoördinaat')
    x_m, y_m = _paar(veld_deel, 'veldcoördinaat')
    return {
        'label': naam or f'anker-{nummer}',
        'beeld_px': [px, py],
        'veld_m': [x_m, y_m],
        # Zo blijft in het bestand zichtbaar dat dit géén lijnkruising uit het veldmodel is maar
        # een punt dat iemand zelf heeft aangewezen — dat scheelt bij het nakijken van een
        # kalibratie die er vreemd uitziet.
        'anker': True,
    }


def verzamel_interactief(
    beeldpad: Path,
    diepte: float,
    positie: str | None = None,
    breedte: float = veld.BREEDTE_M,
    speelveld: float = veld.SPEELVELD_LENGTE_M,
) -> list[dict]:
    """Interactieve modus: klik de genummerde kruispunten aan in een OpenCV-venster.

    Met een camerapositie (--positie) beperkt de lijst zich tot de kruispunten
    die vandaar betrouwbaar zichtbaar zijn — vanaf de achterkant zie je de
    overkant nauwelijks, dus die punten worden dan niet eens aangeboden.
    """
    cv2 = _laad_cv2()
    beeld = cv2.imread(str(beeldpad))
    if beeld is None:
        _fout(f'kon beeld niet lezen: {beeldpad}')

    doelen = veld.kruispunten(diepte, breedte, speelveld)
    if positie is not None:
        toegestaan = set(veld.aanbevolen_labels(positie, diepte))
        doelen = [k for k in doelen if k.label in toegestaan]
        print(f'Camerapositie: {positie} — {len(doelen)} bruikbare kruispunten.')
    print(
        'Conventie: sta in gedachten op de THUIS-achterlijn en kijk naar de uit-kant — '
        'links is dan x=0. Van achter de uit-kant is beeld-links dus veld-RECHTS.'
    )
    print('Kruispunten (klik in deze volgorde; s = overslaan, u = ongedaan, ENTER/q = klaar):')
    for k in doelen:
        print(f'  {k.nummer:2d}. {k.label:28s} veld ({k.x_m:5.1f} m, {k.y_m:5.1f} m)')

    punten: list[dict] = []
    klik: list[tuple[float, float]] = []

    def bij_muis(event, x, y, _vlaggen, _param):
        if event == cv2.EVENT_LBUTTONDOWN:
            klik.append((float(x), float(y)))

    venster = 'kalibratie — klik de kruispunten aan'
    cv2.namedWindow(venster, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(venster, bij_muis)

    index = 0
    afgebroken = False
    while index < len(doelen):
        doel = doelen[index]
        weergave = beeld.copy()
        for i, p in enumerate(punten):
            positie = (int(p['beeld_px'][0]), int(p['beeld_px'][1]))
            cv2.circle(weergave, positie, 6, (0, 200, 0), -1)
            cv2.putText(weergave, str(i + 1), (positie[0] + 8, positie[1] - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 0), 2)
        cv2.putText(
            weergave,
            f'[{doel.nummer}/{len(doelen)}] klik: {doel.label}  (s=overslaan, u=ongedaan, ENTER=klaar)',
            (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2,
        )
        cv2.imshow(venster, weergave)
        toets = cv2.waitKey(30) & 0xFF

        if klik:
            px, py = klik.pop(0)
            punten.append({'label': doel.label, 'beeld_px': [px, py],
                           'veld_m': [doel.x_m, doel.y_m]})
            print(f'  ✔ {doel.label} @ ({px:.0f}, {py:.0f}) px')
            index += 1
        elif toets == ord('s'):
            print(f'  – {doel.label} overgeslagen')
            index += 1
        elif toets == ord('u') and punten:
            verwijderd = punten.pop()
            # terug naar het kruispunt van het verwijderde punt
            index = next(i for i, d in enumerate(doelen) if d.label == verwijderd['label'])
            print(f'  ↩ {verwijderd["label"]} ongedaan gemaakt')
        elif toets in (13, ord('q')):  # ENTER of q: klaar met wat er is
            break
        elif toets == 27:  # ESC: afbreken
            afgebroken = True
            break

    cv2.destroyAllWindows()
    if afgebroken:
        _fout('kalibratie afgebroken (ESC) — er is niets opgeslagen', code=1)
    return punten


# ---------------------------------------------------------------------------
# Radiale lensvervorming: divisiemodel met één parameter (λ)
# ---------------------------------------------------------------------------
#
# Gsm- en actiecamlenzen buigen rechte lijnen aan de beeldrand; een homografie kan
# dat per constructie niet beschrijven, dus zonder correctie zit die kromming als
# systematische meetfout in elke projectie — het grootst aan de beeldranden, waar
# de achterlijnen liggen. Het éénparameter-divisiemodel vangt het gros daarvan:
#
#     ontkromd = centrum + (p − centrum) / (1 + λ·r²)
#
# CONVENTIE (exact — ook voor andere lezers van het kalibratiebestand):
#   - p is het VERVORMDE (ruwe) pixel zoals het uit de camera komt;
#   - centrum = het beeldcentrum in pixels: (beeldbreedte/2, beeldhoogte/2);
#   - r = |p − centrum| / diagonaal, met diagonaal = √(breedte² + hoogte²) in
#     pixels — r is dimensieloos, dus λ is schaalonafhankelijk: dezelfde lens
#     geeft dezelfde λ op 4K als op 720p;
#   - λ > 0 is tonvervorming (barrel — de gsm-groothoek), λ < 0 kussenvorm.
#
# In het kalibratiebestand: 'lens' = {'lambda', 'centrum': [cx, cy], 'diagonaal'}.
# Ontbreekt het veld (oude bestanden), dan geldt λ = 0 en verandert er niets.

# Fysiek plausibel zoekbereik voor λ: ±0,3 dekt van kussenvorm tot de zwaarste
# ongecorrigeerde actiecam-groothoek (op de veldrand ~8% radiale verschuiving).
LENS_LAMBDA_BEREIK = 0.3
# Onder dit aantal punten wordt λ niet geschat: één extra parameter op vier
# punten is overfitten — de fit wordt dan exact voor élke λ en het zoeken kiest
# ruis. Vanaf zes punten laat de kleinste-kwadraten-rest de kromming echt zien.
LENS_MIN_PUNTEN = 6


def ontkrom(
    punt: tuple[float, float] | list[float],
    lam: float,
    centrum: tuple[float, float] | list[float],
    diagonaal: float,
) -> tuple[float, float]:
    """Vervormd (ruw) pixel → ontkromd pixel volgens het divisiemodel hierboven."""
    if lam == 0.0:
        return (float(punt[0]), float(punt[1]))
    dx, dy = punt[0] - centrum[0], punt[1] - centrum[1]
    r2 = (dx * dx + dy * dy) / (diagonaal * diagonaal)
    factor = 1.0 + lam * r2
    if factor <= 1e-9:
        # λ·r² ≤ −1 kan alleen ver buiten het geldigheidsgebied van het model:
        # dan liever het punt laten staan dan het naar oneindig klappen.
        return (float(punt[0]), float(punt[1]))
    return (centrum[0] + dx / factor, centrum[1] + dy / factor)


def verkrom(
    punt: tuple[float, float] | list[float],
    lam: float,
    centrum: tuple[float, float] | list[float],
    diagonaal: float,
) -> tuple[float, float]:
    """Ontkromd pixel → vervormd pixel: de exacte inverse van ontkrom (voor
    overlay en terugprojectie naar het echte beeld).

    GESLOTEN opgelost, geen iteratie: met r_u = |q − centrum| / diagonaal zoekt de
    inverse de vervormde straal r_d waarvoor r_d / (1 + λ·r_d²) = r_u — de
    kwadratische vergelijking λ·r_u·r_d² − r_d + r_u = 0. De wortel die voor λ→0
    naar r_u gaat is, in de numeriek stabiele vorm zonder verlies van significantie,
    r_d = 2·r_u / (1 + √(1 − 4·λ·r_u²)); de vector schaalt dus met 2/(1 + √(…)).
    """
    if lam == 0.0:
        return (float(punt[0]), float(punt[1]))
    dx, dy = punt[0] - centrum[0], punt[1] - centrum[1]
    ru2 = (dx * dx + dy * dy) / (diagonaal * diagonaal)
    discriminant = 1.0 - 4.0 * lam * ru2
    if discriminant < 0.0:
        # Zo sterk positieve λ op zo grote straal ligt buiten het model (de
        # vervorming zou niet meer omkeerbaar zijn): klem op de grens.
        discriminant = 0.0
    schaal = 2.0 / (1.0 + math.sqrt(discriminant))
    return (centrum[0] + dx * schaal, centrum[1] + dy * schaal)


def lens_uit(data: dict) -> tuple[float, tuple[float, float], float] | None:
    """(λ, centrum, diagonaal) uit een kalibratiebestand, of None als er niets te
    ontkrommen valt — het λ=0-pad zonder rekenkost van betekenis.

    Oude bestanden hebben géén 'lens'-veld: dan geldt λ = 0 (volledige
    achterwaartse compatibiliteit). Ook een expliciete λ = 0 geeft None terug,
    want ontkrommen is dan de identiteit.
    """
    lens = (data or {}).get('lens') or {}
    lam = float(lens.get('lambda') or 0.0)
    centrum = lens.get('centrum')
    diagonaal = lens.get('diagonaal')
    if lam == 0.0 or not centrum or not diagonaal:
        return None
    return lam, (float(centrum[0]), float(centrum[1])), float(diagonaal)


def ontkromde_punten(
    punten: list[dict],
    lam: float,
    centrum: tuple[float, float] | list[float],
    diagonaal: float,
) -> list[dict]:
    """Puntrecords met ontkromde beeld_px; de ruwe klikken bewaart de aanroeper zelf
    (het kalibratiebestand houdt altijd de échte klikcoördinaten vast)."""
    if lam == 0.0:
        return punten
    return [{**p, 'beeld_px': list(ontkrom(p['beeld_px'], lam, centrum, diagonaal))}
            for p in punten]


def _inverteer_of_niets(m: list[list[float]]) -> list[list[float]] | None:
    """Als _inverteer_3x3, maar zonder het proces te verlaten — voor de λ-zoektocht,
    waar één ontaarde kandidaat gewoon een slechte kandidaat is."""
    (a, b, c), (d, e, f), (g, h, i) = m
    if abs(a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)) < 1e-12:
        return None
    return _inverteer_3x3(m)


def _herprojectiefout_px(matrix: list[list[float]], punten: list[dict]) -> float:
    """Gemiddelde afstand (px) tussen elk (ontkromd) klikpunt en waar de matrix het
    veldpunt terug in beeld legt — het criterium van de λ-zoektocht.

    Bewust in píxels en niet in meters: de klikruis is per pixel gelijk verdeeld,
    terwijl een meterfout de punten aan de verre kant (grof: veel meter per pixel)
    zwaar laat wegen en juist de punten dichtbij — waar de kromming zichtbaar is —
    verwaarloost. In meters gemeten was de λ-schatting op de proefopstellingen 2 à
    5 keer ruisgevoeliger.
    """
    invers = _inverteer_of_niets(matrix)
    if invers is None:
        return float('inf')
    som = 0.0
    for p in punten:
        tx, ty = _projecteer(invers, p['veld_m'][0], p['veld_m'][1])
        if tx != tx or abs(tx) > 1e9:
            return float('inf')
        som += math.hypot(tx - p['beeld_px'][0], ty - p['beeld_px'][1])
    return som / len(punten)


def schat_lens(
    punten: list[dict],
    centrum: tuple[float, float],
    diagonaal: float,
    bereik: float = LENS_LAMBDA_BEREIK,
) -> tuple[float, list[list[float]], float, float] | None:
    """Schat λ mee met de homografie: (λ, matrix, fout_met_px, fout_zonder_px).

    1-D zoektocht over λ — grof raster over ±bereik plus twee verfijningsrondes
    (stap ÷10, ÷100) rond het beste punt; robuuster dan gulden snede, want de
    foutkromme is bij weinig punten niet gegarandeerd unimodaal, en met ~70
    homografie-fits op ≤ 14 punten kost het niets. Per kandidaat-λ worden de
    punten ontkromd, wordt de bestaande homografie-fit gedraaid en telt de
    herprojectiefout in pixels (zie _herprojectiefout_px). λ = 0 zit in het
    raster, dus de uitkomst is nooit slechter dan géén lensmodel.

    Geeft None wanneer zelfs λ = 0 geen fit oplevert — dan meldt de gewone
    fit_homografie-weg het probleem luid.
    """
    cv2 = _laad_cv2()  # noqa: F841 — de fit hieronder heeft cv2 nodig; laad hem één keer luid

    def fout_bij(lam: float) -> tuple[list[list[float]] | None, float]:
        onk = ontkromde_punten(punten, lam, centrum, diagonaal)
        matrix = _fit_homografie_of_niets(onk)
        if matrix is None:
            return None, float('inf')
        return matrix, _herprojectiefout_px(matrix, onk)

    matrix_nul, fout_nul = fout_bij(0.0)
    if matrix_nul is None:
        return None
    beste_lam, beste_matrix, beste_fout = 0.0, matrix_nul, fout_nul
    stap = bereik / 15.0
    for i in range(-15, 16):
        lam = i * stap
        matrix, fout = fout_bij(lam)
        if fout < beste_fout:
            beste_lam, beste_matrix, beste_fout = lam, matrix, fout
    for verfijn in (stap / 10.0, stap / 100.0):
        rond = beste_lam
        for k in range(-9, 10):
            lam = rond + k * verfijn
            if abs(lam) > bereik or k == 0:
                continue
            matrix, fout = fout_bij(lam)
            if fout < beste_fout:
                beste_lam, beste_matrix, beste_fout = lam, matrix, fout
    return beste_lam, beste_matrix, beste_fout, fout_nul


# ---------------------------------------------------------------------------
# Homografie fitten en opslaan
# ---------------------------------------------------------------------------

def _alle_collineair(punten_m: list[tuple[float, float]]) -> bool:
    """Liggen al deze veldpunten (in meters) op één rechte?

    De lijn wordt gelegd door de twee verst uiteenliggende punten, zodat dubbele of dicht
    opeenliggende punten de toets niet vertekenen. Kruispunten die níét op de lijn horen
    liggen er meters naast, dus de millimeter-tolerantie is ruim én ongevoelig.
    """
    if len(punten_m) < 3:
        return True
    a, b = max(((p, q) for p in punten_m for q in punten_m),
               key=lambda pq: (pq[0][0] - pq[1][0]) ** 2 + (pq[0][1] - pq[1][1]) ** 2)
    lengte = math.hypot(b[0] - a[0], b[1] - a[1])
    if lengte < 1e-9:
        return True  # alle punten vallen samen
    return all(
        abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / lengte < 1e-3
        for p in punten_m
    )


def controleer_ontaarding(punten: list[dict]) -> None:
    """Weiger puntensets die het veld wiskundig niet vastleggen.

    Vier punten zijn pas genoeg in algemene positie. Liggen alle punten op één na op
    dezelfde rechte (bv. drie kruispunten op de linkerzijlijn en één rechts — precies wat
    je krijgt als één zijlijn door spelers afgedekt is), dan bestaat er een hele familie
    van exact passende homografieën en kiest de fit er stil één: het reprojectierapport
    toont 0,00 px terwijl metingen op de rest van het veld er tientallen meters naast
    zitten. cv2.findHomography merkt alleen een VOLLEDIG collineaire set op; deze controle
    vangt de rest, vóór er iets gefit of weggeschreven wordt. Dezelfde toets zit in de app
    (src/app/api/cv/match/[id]/kalibratie/route.ts), zodat de gebruiker het al bij het
    aanduiden hoort.
    """
    veldpunten = [(float(p['veld_m'][0]), float(p['veld_m'][1])) for p in punten]
    for i in range(len(veldpunten)):
        if _alle_collineair(veldpunten[:i] + veldpunten[i + 1:]):
            _fout(
                'de aangeduide punten liggen op één na allemaal op één rechte — zo ligt het '
                'veld niet vast: er zijn oneindig veel passende oplossingen en de fit kiest '
                'er stil één (het rapport oogt dan perfect terwijl de rest van het veld er '
                'meters naast zit). Duid minstens twee punten op élke zijlijn aan, goed uit '
                'elkaar.',
                code=1,
            )


def _fit_homografie_of_niets(punten: list[dict]) -> list[list[float]] | None:
    """De kale fit: matrix of None. Voor de λ-zoektocht, die per kandidaat mag falen."""
    cv2 = _laad_cv2()
    import numpy as np  # noqa: PLC0415 — komt mee met opencv-python

    bron = np.array([p['beeld_px'] for p in punten], dtype=np.float64)
    doel = np.array([p['veld_m'] for p in punten], dtype=np.float64)
    matrix, _masker = cv2.findHomography(bron, doel, method=0)
    if matrix is None:
        return None
    return [[float(w) for w in rij] for rij in matrix]


def fit_homografie(punten: list[dict]) -> list[list[float]]:
    """Fit de homografie beeld(px) → veld(m) op ≥4 puntenparen.

    Enkel de wiskunde: wie hiermee een kalibratie bóúwt roept eerst controleer_ontaarding()
    aan (main doet dat vóór elke fit). Hier niet onvoorwaardelijk, want het camera-oordeel
    (camera.beoordeel) fit bewust ook wankele sets om ze daarna met de
    laat-één-punt-weg-proef als onzeker te bestempelen.
    """
    matrix = _fit_homografie_of_niets(punten)
    if matrix is None:
        _fout('cv2.findHomography vond geen oplossing — liggen de punten niet op één lijn?', code=1)
    return matrix


def schrijf_kalibratie(
    pad: Path, matrix: list[list[float]], punten: list[dict], diepte: float, beeldpad: Path | None,
    breedte: float = veld.BREEDTE_M, speelveld: float = veld.SPEELVELD_LENGTE_M,
    positie: str | None = None, beeldbreedte: float | None = None, beeldhoogte: float | None = None,
    lens: dict | None = None,
) -> None:
    data = {
        'versie': 1,
        'aangemaakt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'beeld': {'pad': str(beeldpad) if beeldpad else None},
        'veld': {
            'doelgebied_diepte_m': diepte,
            'breedte_m': breedte,
            'speelveld_m': speelveld,
            'totale_lengte_m': veld.totale_lengte_m(diepte, speelveld),
        },
        'punten': punten,
        'matrix_beeld_naar_veld': matrix,
        # Waar deze opstelling scherp meet en waar niet — de app toont het aan de gebruiker.
        'precisie_m_per_px': precisiekaart(matrix, diepte, breedte, speelveld),
        'camerapositie': positie,
    }
    # De meegeschatte lensvervorming (divisiemodel). De punten hierboven blijven de RUWE
    # klikken — wie de matrix gebruikt ontkromt eerst (landing.py, volg_veld.py, --test).
    # Zonder dit veld geldt λ = 0: oude bestanden blijven letterlijk werken.
    if lens is not None:
        data['lens'] = lens
    # Het standpunt terugrekenen kan alleen met de beeldmaat erbij (het hoofdpunt zit in het
    # midden van het beeld). Zonder die maat slaan we het gewoon over.
    if beeldbreedte and beeldhoogte:
        import camera  # noqa: PLC0415  (lui: camera importeert volg_veld, dat hier niet altijd nodig is)
        # De matrix hoort bij de ONTKROMDE punten: geef het oordeel dezelfde coördinaten.
        lt = lens_uit(data)
        data['camerastandpunt'] = camera.beoordeel(
            positie, matrix, beeldbreedte, beeldhoogte, breedte,
            veld.totale_lengte_m(diepte, speelveld),
            ontkromde_punten(punten, *lt) if lt else punten,
        )
    pad.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Kalibratie opgeslagen: {pad}')


# ---------------------------------------------------------------------------
# Reprojectierapport — puur stdlib zodat --test geen cv2 nodig heeft
# ---------------------------------------------------------------------------

def _inverteer_3x3(m: list[list[float]]) -> list[list[float]]:
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-12:
        _fout('homografiematrix is singulier — kalibratie is onbruikbaar', code=1)
    adj = [
        [e * i - f * h, c * h - b * i, b * f - c * e],
        [f * g - d * i, a * i - c * g, c * d - a * f],
        [d * h - e * g, b * g - a * h, a * e - b * d],
    ]
    return [[w / det for w in rij] for rij in adj]


def _projecteer(m: list[list[float]], x: float, y: float) -> tuple[float, float]:
    """Pas de homografie toe op één punt (homogene coördinaten)."""
    xp = m[0][0] * x + m[0][1] * y + m[0][2]
    yp = m[1][0] * x + m[1][1] * y + m[1][2]
    w = m[2][0] * x + m[2][1] * y + m[2][2]
    if abs(w) < 1e-12:
        return (float('inf'), float('inf'))
    return (xp / w, yp / w)


def orientatie_det(matrix: list[list[float]], punten: list[dict]) -> float:
    """Jacobiaan-determinant van beeld→veld in het zwaartepunt van de klikpunten.

    Elke échte camera staat bóven het grondvlak, en in een beeld loopt de y-as naar BENEDEN
    terwijl de diepte van het veld naar boven in beeld loopt. Die omkering maakt de determinant
    van een correct aangeduid veld **negatief** — voor élk standpunt: zijlijn links, zijlijn
    rechts, achter de thuislijn, achter de uitlijn. Wordt hij positief, dan zijn links en rechts
    verwisseld bij het aanklikken, en dat verziekt elke meting stil.

    Nagemeten met echte perspectiefcamera's (vier standpunten, reprojectiefout 0,00 px):
    correct −0,00196 · links/rechts verwisseld +0,00196 · 180° gedraaid −0,00196. Die laatste
    is een geldig ander gezichtspunt (filmen vanaf de overkant) en houdt dus hetzelfde teken.
    """
    if not punten:
        return 1.0
    cu = sum(p['beeld_px'][0] for p in punten) / len(punten)
    cv_ = sum(p['beeld_px'][1] for p in punten) / len(punten)
    x0, y0 = _projecteer(matrix, cu, cv_)
    xu, yu = _projecteer(matrix, cu + 1.0, cv_)
    xv, yv = _projecteer(matrix, cu, cv_ + 1.0)
    return (xu - x0) * (yv - y0) - (xv - x0) * (yu - y0)


def controleer_orientatie(matrix: list[list[float]], punten: list[dict]) -> None:
    if orientatie_det(matrix, punten) > 0:
        _fout(
            'het veld staat in SPIEGELBEELD: links en rechts zijn verwisseld bij het aanklikken. '
            'De conventie: sta in gedachten op de THUIS-achterlijn en kijk naar de uit-kant — '
            'links is dan x=0. Film je van achter de uit-kant, dan is wat jij links in beeld ziet '
            'veld-RECHTS (en de lijn vlak voor je de uit-achterlijn). Wissel links en rechts om.'
        )


_DRAAI_WISSELS = (('_thuis', '\x00'), ('_uit', '_thuis'), ('\x00', '_uit'),
                  ('_links', '\x01'), ('_rechts', '_links'), ('\x01', '_rechts'))


def draai_label_180(label: str) -> str:
    """thuis↔uit en links↔rechts — het label van hetzelfde punt na een 180°-draai."""
    for oud, nieuw in _DRAAI_WISSELS:
        label = label.replace(oud, nieuw)
    return label


_DRAAI_POSITIE = {'thuis': 'uit', 'uit': 'thuis', 'links': 'rechts', 'rechts': 'links'}


def draai_positie_180(positie: str) -> str:
    """Camerapositie na de 180°-draai: de camera zelf blijft staan, maar in de gedraaide
    veldcoördinaten staat ze aan de overkant — thuis↔uit én links↔rechts, per naamdeel."""
    return '-'.join(_DRAAI_POSITIE.get(deel, deel) for deel in positie.split('-'))


def draai_kalibratie_180(data: dict) -> dict:
    """Draai een kalibratie 180° in het veldvlak: (x, y) → (B−x, L−y).

    Voor wanneer de verkeerde achterlijn als "thuis" (y=0) gekozen werd: de
    matrix wordt gecomponeerd met de rotatie en elk punt krijgt zijn gedraaide
    veldcoördinaat én label, zodat het bestand consistent blijft en het
    reprojectierapport identiek. Ook de kwaliteitsmetadata draait mee — anders
    beweert het bestand het spiegelbeeld van waar de opstelling scherp meet.
    Puur stdlib — geen herklikken, geen cv2.
    """
    diepte, speelveld = veldinfo_uit(data)
    lengte = veld.totale_lengte_m(diepte, speelveld)
    b = breedte_uit(data)
    r = [[-1.0, 0.0, b], [0.0, -1.0, lengte], [0.0, 0.0, 1.0]]
    h = data['matrix_beeld_naar_veld']
    nieuw_h = [[sum(r[i][k] * h[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    nieuwe_punten = [
        {
            **p,
            'label': draai_label_180(p['label']),
            'veld_m': [round(b - p['veld_m'][0], 4), round(lengte - p['veld_m'][1], 4)],
        }
        for p in data['punten']
    ]
    uit = {**data, 'matrix_beeld_naar_veld': nieuw_h, 'punten': nieuwe_punten}
    # Waar de opstelling scherp meet wisselt van kant: herbereken met de gedraaide matrix
    # in plaats van thuis/uit letterlijk te laten staan uit het oorspronkelijke bestand.
    if 'precisie_m_per_px' in data:
        uit['precisie_m_per_px'] = precisiekaart(nieuw_h, diepte, b, speelveld)
    if data.get('camerapositie'):
        uit['camerapositie'] = draai_positie_180(data['camerapositie'])
    # Het teruggerekende standpunt verhuist mee naar de gedraaide coördinaten; hoogte,
    # brandpunt en het oordeel (keuze én meting draaien samen) blijven wat ze waren.
    standpunt = data.get('camerastandpunt')
    if standpunt and standpunt.get('gemeten'):
        gemeten = standpunt['gemeten']
        uit['camerastandpunt'] = {
            **standpunt,
            'gemeten': {**gemeten, 'x_m': round(b - gemeten['x_m'], 2),
                        'y_m': round(lengte - gemeten['y_m'], 2)},
        }
    return uit


def veldinfo_uit(data: dict) -> tuple[float, float]:
    """(diepte, speelveld) uit een kalibratiebestand — schrijf_kalibratie zet ze onder 'veld';
    oudere bestanden hadden 'doelgebied_diepte_m' op het hoogste niveau."""
    info = data.get('veld') or {}
    diepte = float(data.get('doelgebied_diepte_m') or info.get('doelgebied_diepte_m')
                   or veld.STANDAARD_DOELGEBIED_DIEPTE_M)
    return diepte, float(info.get('speelveld_m') or veld.SPEELVELD_LENGTE_M)


def breedte_uit(data: dict) -> float:
    """Opgemeten veldbreedte uit een kalibratiebestand, met het reglement als terugval."""
    return float((data.get('veld') or {}).get('breedte_m') or veld.BREEDTE_M)


def meters_per_pixel(matrix: list[list[float]], x_m: float, y_m: float) -> float | None:
    """Hoeveel meter op het veld is één pixel waard, op deze plek?

    Dé maat voor "werkt mijn camerastandpunt hier?". Bij een camera op de zijlijn is dit over
    het hele veld ongeveer gelijk. Staat ze achter het veld en kijkt ze in de diepte, dan is
    één pixel vooraan enkele centimeters en achteraan al gauw een halve meter — dezelfde
    kalibratie, maar een meting die vooraan klopt en achteraan ruw is.

    Berekend zoals ze telt: zoek waar dit veldpunt in beeld ligt, verschuif één pixel, en kijk
    hoeveel meter dat op het veld scheelt. De slechtste van de twee richtingen telt.
    """
    # Zelf op singulariteit controleren: _inverteer_3x3 stapt uit het proces, en een
    # precisiecijfer is nooit een reden om de hele kalibratie te laten sneuvelen.
    (a, b, c), (d, e, f), (g, h, i) = matrix
    if abs(a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)) < 1e-12:
        return None
    invers = _inverteer_3x3(matrix)
    px, py = _projecteer(invers, x_m, y_m)
    if px != px or py != py or abs(px) > 1e7 or abs(py) > 1e7:
        return None  # achter de horizon of ontaard: hier valt niets te zeggen
    hier = _projecteer(matrix, px, py)
    afstanden = []
    for dx, dy in ((1.0, 0.0), (0.0, 1.0)):
        daar = _projecteer(matrix, px + dx, py + dy)
        if daar[0] != daar[0]:
            return None
        afstanden.append(((daar[0] - hier[0]) ** 2 + (daar[1] - hier[1]) ** 2) ** 0.5)
    return max(afstanden)


def precisiekaart(
    matrix: list[list[float]],
    diepte: float = veld.STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte: float = veld.BREEDTE_M,
    speelveld: float = veld.SPEELVELD_LENGTE_M,
) -> dict:
    """Waar op het veld is deze kalibratie scherp, en waar ruw?

    Geeft per derde van de lengte (thuiskant, midden, uitkant) de mediane meters-per-pixel.
    Zo zie je in één oogopslag of een standpunt achter het veld bruikbaar is voor de overkant.
    """
    lengte = veld.totale_lengte_m(diepte, speelveld)
    derden: dict[str, list[float]] = {'thuis': [], 'midden': [], 'uit': []}
    for i in range(9):
        y = lengte * (i + 0.5) / 9.0
        naam = 'thuis' if y < lengte / 3 else ('midden' if y < 2 * lengte / 3 else 'uit')
        for j in range(3):
            x = breedte * (j + 0.5) / 3.0
            mpp = meters_per_pixel(matrix, x, y)
            if mpp is not None:
                derden[naam].append(mpp)
    uit: dict = {}
    for naam, waarden in derden.items():
        if waarden:
            uit[naam] = round(sorted(waarden)[len(waarden) // 2], 3)
    if uit:
        uit['slechtste'] = round(max(uit.values()), 3)
    return uit


def druk_reprojectierapport(
    matrix: list[list[float]],
    punten: list[dict],
    _rapport_diepte: float | None = None,
    _rapport_speelveld: float | None = None,
    _rapport_breedte: float | None = None,
    lens: tuple[float, tuple[float, float], float] | None = None,
) -> None:
    """Rapporteer per punt de reprojectiefout in pixels (veld → beeld via H⁻¹),
    plus de fout in meters (beeld → veld via H), en het gemiddelde.

    Met een lens (het (λ, centrum, diagonaal)-drietal van lens_uit) hoort de matrix bij
    ONTKROMDE pixels: beeld → veld gaat dan via ontkrom, en veld → beeld via verkrom
    terug naar de ruwe klik — de pixelfout blijft zo een fout in échte beeldpixels.
    """
    invers = _inverteer_3x3(matrix)
    print('Reprojectierapport:')
    if lens is not None:
        print(f'  lens: λ = {lens[0]:g} (divisiemodel) — pixels worden ontkromd vóór de projectie')
    print(f'  {"kruispunt":28s} {"fout (px)":>10s} {"fout (m)":>9s}')
    fouten_px: list[float] = []
    fouten_m: list[float] = []
    for p in punten:
        px, py = p['beeld_px']
        vx, vy = p['veld_m']
        ox, oy = ontkrom((px, py), *lens) if lens is not None else (px, py)
        # veld → beeld: hoe ver ligt de terugprojectie van het aangeklikte pixel?
        tx, ty = _projecteer(invers, vx, vy)
        if lens is not None:
            tx, ty = verkrom((tx, ty), *lens)
        fout_px = ((tx - px) ** 2 + (ty - py) ** 2) ** 0.5
        # beeld → veld: fout op het veld, in meters
        mx, my = _projecteer(matrix, ox, oy)
        fout_m = ((mx - vx) ** 2 + (my - vy) ** 2) ** 0.5
        fouten_px.append(fout_px)
        fouten_m.append(fout_m)
        print(f'  {p["label"]:28s} {fout_px:10.2f} {fout_m:9.3f}')
    gem_px = sum(fouten_px) / len(fouten_px) if fouten_px else float('nan')
    # Het beslissende getal uit de README-richtwaarde (gemiddeld < 0,5 m) hoort
    # in het rapport zelf te staan, niet in het hoofd van de gebruiker.
    gem_m = sum(fouten_m) / len(fouten_m) if fouten_m else float('nan')
    print(f'  {"GEMIDDELDE":28s} {gem_px:10.2f} {gem_m:9.3f}')

    # Vanaf de achterkant liggen alle punten op één helft: metingen op de andere helft zijn dan
    # geëxtrapoleerd. Dat is een geldige opstelling (zones aan jouw kant blijven sterk), maar de
    # gebruiker moet het wéten — dus zeg het hier, waar hij toch al naar de fouten kijkt.
    diepte = _rapport_diepte if _rapport_diepte is not None else veld.STANDAARD_DOELGEBIED_DIEPTE_M
    speelveld = _rapport_speelveld if _rapport_speelveld is not None else veld.SPEELVELD_LENGTE_M
    helft_grens = veld.totale_lengte_m(diepte, speelveld) / 2.0
    thuis = [p for p in punten if p['veld_m'][1] < helft_grens]
    uit = [p for p in punten if p['veld_m'][1] > helft_grens]
    if not thuis or not uit:
        # De helft ZONDER punten is de geëxtrapoleerde.
        kant = 'thuis' if not thuis else 'uit'
        print(
            f'  LET OP: alle kalibratiepunten liggen op één helft — de {kant}-helft is '
            f'geëxtrapoleerd. Zones en afstanden dáár kunnen fors afwijken; voor een meting '
            f'over het hele veld neem je minstens één punt op elke helft (bv. de middellijn).'
        )

    # Hoe scherp meet dit standpunt, waar? Bij een camera achter het veld is dat het verschil
    # tussen een bruikbare en een waardeloze meting op de overkant. De breedte hoort er
    # expliciet bij: positioneel schoof hier ooit de speelveldlengte in de breedte-parameter,
    # waardoor de kaart naast het veld bemonsterde en het rapport een andere scherpte meldde
    # dan de precisie_m_per_px in de JSON van hetzelfde bestand.
    breedte = _rapport_breedte if _rapport_breedte is not None else veld.BREEDTE_M
    kaart = precisiekaart(matrix, diepte, breedte, speelveld)
    if kaart:
        stukken = ' · '.join(f'{naam} {kaart[naam]:.2f}'
                             for naam in ('thuis', 'midden', 'uit') if naam in kaart)
        print(f'  Meters per pixel: {stukken}')
        if kaart.get('slechtste', 0) > 0.25:
            print(f'  LET OP: op het slechtste punt is één pixel {kaart["slechtste"]:.2f} m waard. '
                  f'Daar is een landingspunt hooguit een schatting — een standpunt op de zijlijn '
                  f'(of hoger) meet die kant veel scherper.')


def druk_standpunt(matrix: list[list[float]], punten: list[dict], args) -> None:
    """Waar de fit zegt dat de camera stond, en of dat strookt met wat er gekozen is."""
    if not (args.beeldbreedte and args.beeldhoogte):
        return
    import camera  # noqa: PLC0415

    lengte = veld.totale_lengte_m(args.diepte, args.speelveld)
    oordeel = camera.beoordeel(args.positie, matrix, args.beeldbreedte, args.beeldhoogte,
                               args.breedte, lengte, punten)
    gemeten = oordeel.get('gemeten')
    if gemeten is None:
        print('  Standpunt: niet terug te rekenen uit deze punten (te weinig perspectief).')
        return
    print(f'  Standpunt teruggerekend: x {gemeten["x_m"]:g} m, y {gemeten["y_m"]:g} m, '
          f'hoogte {gemeten["hoogte_m"]:g} m (brandpunt {gemeten["brandpunt_px"]:g} px)')
    if oordeel['oordeel'] == 'wijkt af':
        print(f'  LET OP: dat strookt niet met het gekozen standpunt ({args.positie}). '
              f'Kijk de aangeduide punten na.')
    elif oordeel['oordeel'] == 'onzeker':
        print('  (Onzeker: het standpunt schuift te veel als je één punt weglaat — '
              'duid er meer aan, goed verspreid over het veld.)')


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Kalibreer de homografie beeld ↔ veld op gekende lijn-kruispunten.'
    )
    parser.add_argument('--beeld', type=Path, help='videoframe voor de interactieve modus')
    parser.add_argument(
        '--punt', action='append', default=[], metavar='"px,py=LABEL"',
        help='headless puntenpaar (herhaalbaar); labels: zie veld.kruispunten()',
    )
    parser.add_argument(
        '--diepte', type=float, default=veld.STANDAARD_DOELGEBIED_DIEPTE_M,
        help='doelgebied-diepte van dit terrein in meters (standaard 10, nieuwe terreinen 15)',
    )
    parser.add_argument(
        '--breedte', type=float, default=veld.BREEDTE_M,
        help='opgemeten veldbreedte in meters (standaard reglementair 14) — zelfde waarde als '
             '"veldBreedte" op de wedstrijd in het platform',
    )
    parser.add_argument(
        '--speelveld', type=float, default=veld.SPEELVELD_LENGTE_M,
        help='opgemeten speelveldlengte tussen de doellijnen (standaard reglementair 26) — '
             'zelfde waarde als "veldSpeelveld" op de wedstrijd',
    )
    parser.add_argument(
        '--uit', type=Path, default=Path('kalibratie.json'),
        help='uitvoerbestand voor de kalibratie-JSON (standaard kalibratie.json)',
    )
    parser.add_argument(
        '--test', type=Path, nargs='?', const=None, default=argparse.SUPPRESS,
        metavar='KALIBRATIE.JSON',
        help='druk enkel het reprojectiefout-rapport af (van dit bestand, of van --uit)',
    )
    import camera as _camera  # noqa: PLC0415
    parser.add_argument(
        '--positie', choices=tuple(_camera.POSITIES) + tuple(veld.CAMERA_POSITIES), default=None,
        help='waar de camera stond. Beperkt de interactieve kliklijst tot de daar zichtbare '
             'kruispunten, en laat het standpunt narekenen uit de fit (met --beeldbreedte/'
             '--beeldhoogte): klopt wat je koos met wat de punten zeggen?',
    )
    parser.add_argument('--beeldbreedte', type=float, default=None,
                        help='breedte van het videobeeld in pixels (nodig om het standpunt terug te rekenen)')
    parser.add_argument('--beeldhoogte', type=float, default=None,
                        help='hoogte van het videobeeld in pixels')
    parser.add_argument(
        '--anker', action='append', default=[], metavar='"px,py=x_m,y_m[:naam]"',
        help='vast punt buiten het veldmodel (hoek van de omheining, een paal, de kantine) met '
             'zijn veldcoördinaten van een luchtfoto — houdt de kalibratie op haar plaats waar '
             'de witte lijnen tekortschieten; herhaalbaar, combineerbaar met --punt',
    )
    parser.add_argument(
        '--draai-180', type=Path, default=None, metavar='KALIBRATIE.JSON', dest='draai_180',
        help='draai een bestaande kalibratie 180° in het veldvlak (thuis↔uit, links↔rechts) — '
             'voor wanneer de verkeerde achterlijn als thuis gekozen werd; schrijft naar --uit',
    )
    args = parser.parse_args(argv)

    # 180°-draai van een bestaand bestand: eigen modus, geen cv2 en geen herklikken nodig.
    if args.draai_180 is not None:
        if args.punt or args.anker or args.beeld is not None or hasattr(args, 'test'):
            parser.error('--draai-180 gaat niet samen met --punt/--anker/--beeld/--test — draai ze apart')
        if not args.draai_180.is_file():
            _fout(f'kalibratiebestand niet gevonden: {args.draai_180}')
        data = json.loads(args.draai_180.read_text(encoding='utf-8'))
        gedraaid = draai_kalibratie_180(data)
        args.uit.write_text(json.dumps(gedraaid, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'180° gedraaid (thuis↔uit, links↔rechts) → {args.uit}')
        # De lens leeft in beeldcoördinaten en draait dus niet mee — {**data} nam ze al over.
        druk_reprojectierapport(gedraaid['matrix_beeld_naar_veld'], gedraaid['punten'],
                                *veldinfo_uit(gedraaid), breedte_uit(gedraaid),
                                lens=lens_uit(gedraaid))
        return

    # --test combineert niet met een nieuwe kalibratie: dat zou stilletjes fitten
    # en wegschrijven terwijl de gebruiker enkel een rapport verwachtte.
    if hasattr(args, 'test') and (args.punt or args.anker or args.beeld is not None):
        parser.error('--test gaat niet samen met --punt/--anker/--beeld — draai ze apart')
    # --test zonder nieuwe punten: rapport van een bestaande kalibratie (geen cv2 nodig)
    alleen_test = hasattr(args, 'test') and not args.punt and not args.anker and args.beeld is None
    if alleen_test:
        pad = args.test if args.test is not None else args.uit
        if not pad.is_file():
            _fout(f'kalibratiebestand niet gevonden: {pad}')
        data = json.loads(pad.read_text(encoding='utf-8'))
        lt = lens_uit(data)
        # De matrix hoort bij de ONTKROMDE punten — de controle en het rapport dus ook.
        controleer_orientatie(data['matrix_beeld_naar_veld'],
                              ontkromde_punten(data['punten'], *lt) if lt else data['punten'])
        druk_reprojectierapport(data['matrix_beeld_naar_veld'], data['punten'],
                                *veldinfo_uit(data), breedte_uit(data), lens=lt)
        return

    # Punten verzamelen: headless (--punt) of interactief (--beeld)
    # Startwaarde: de ankers-alleen-tak (een terrein zonder bruikbare lijnen) zet geen punten,
    # en zonder deze regel bestaat de variabele daar niet.
    punten: list[dict] = []
    if args.punt:
        labels = veld.kruispunt_per_label(args.diepte, args.breedte, args.speelveld)
        punten = [parse_punt_argument(tekst, labels) for tekst in args.punt]
        dubbel = {p['label'] for p in punten if [q['label'] for q in punten].count(p['label']) > 1}
        if dubbel:
            _fout(f'label(s) meermaals opgegeven: {", ".join(sorted(dubbel))}')
    elif args.beeld is not None:
        punten = verzamel_interactief(args.beeld, args.diepte, positie=args.positie,
                                      breedte=args.breedte, speelveld=args.speelveld)
    elif not args.anker:
        parser.error('geef --beeld (interactief) of minstens vier --punt/--anker argumenten (headless)')

    # Vrije ankerpunten sluiten aan bij de lijnkruisingen: samen vormen ze de puntenset waarop
    # gefit wordt. Ze mogen dus ook de enige bron zijn (een terrein zonder bruikbare lijnen).
    if args.anker:
        punten = punten + [parse_anker_argument(t, i + 1) for i, t in enumerate(args.anker)]

    if len(punten) < 4:
        _fout(f'minstens 4 punten nodig voor een homografie, kreeg er {len(punten)}')
    # Vier punten zijn pas genoeg als ze het veld ook echt vastleggen: een set met alle
    # punten op één na op dezelfde rechte (één zijlijn overgeslagen) glipt door cv2 heen
    # met een perfect ogend rapport, terwijl de andere veldhelft er meters naast zit.
    # (De toets kijkt naar de VELDcoördinaten en is dus lens-onafhankelijk; de
    # orientatie-toets hieronder krijgt wél de ontkromde punten.)
    controleer_ontaarding(punten)

    # Het lensmodel heeft het beeldcentrum en de diagonaal nodig. Zonder vlaggen halen
    # we de maat uit het beeld zelf (interactieve modus) — dat laat meteen ook het
    # camerastandpunt narekenen, wat vroeger alleen met expliciete vlaggen kon.
    if args.beeld is not None and not (args.beeldbreedte and args.beeldhoogte):
        beeld = _laad_cv2().imread(str(args.beeld))
        if beeld is not None:
            args.beeldhoogte, args.beeldbreedte = float(beeld.shape[0]), float(beeld.shape[1])

    # Radiale lensvervorming meeschatten (divisiemodel, zie boven). λ = 0 wanneer dat
    # niet verantwoord kan; dat staat dan expliciet in het rapport — stilte zou
    # suggereren dat de lens recht is terwijl we het gewoon niet weten.
    lens: dict | None = None
    fitpunten = punten
    if not (args.beeldbreedte and args.beeldhoogte):
        print('Lensvervorming niet geschat (λ = 0): de beeldmaat is onbekend — geef '
              '--beeldbreedte en --beeldhoogte mee om ze mee te fitten.')
    else:
        centrum = (args.beeldbreedte / 2.0, args.beeldhoogte / 2.0)
        diagonaal = math.hypot(args.beeldbreedte, args.beeldhoogte)
        lens = {'lambda': 0.0, 'centrum': [centrum[0], centrum[1]],
                'diagonaal': round(diagonaal, 2)}
        if len(punten) < LENS_MIN_PUNTEN:
            print(f'Lensvervorming niet geschat (λ = 0): {len(punten)} punten is te weinig — '
                  f'één extra parameter op zo weinig punten is overfitten. Duid er minstens '
                  f'{LENS_MIN_PUNTEN} aan om de lens mee te schatten.')
        else:
            geschat = schat_lens(punten, centrum, diagonaal)
            if geschat is not None:
                lam, _matrix_lens, fout_met, fout_zonder = geschat
                lens['lambda'] = round(lam, 6)
                if lens['lambda']:
                    print(f'Lensvervorming meegeschat: λ = {lens["lambda"]:g} (divisiemodel) — '
                          f'herprojectiefout {fout_zonder:.2f} px → {fout_met:.2f} px gemiddeld')
                else:
                    print('Lensvervorming meegeschat: λ = 0 — deze opname is al recht')
        fitpunten = ontkromde_punten(punten, lens['lambda'], centrum, diagonaal)

    matrix = fit_homografie(fitpunten)
    # Spiegel-detectie vóór het wegschrijven: een gespiegelde kalibratie verziekt élke meting.
    controleer_orientatie(matrix, fitpunten)
    # De RUWE klikpunten gaan het bestand in; de lens erbij zegt hoe je ze ontkromt.
    schrijf_kalibratie(args.uit, matrix, punten, args.diepte, args.beeld,
                       breedte=args.breedte, speelveld=args.speelveld,
                       positie=args.positie, beeldbreedte=args.beeldbreedte,
                       beeldhoogte=args.beeldhoogte, lens=lens)
    druk_reprojectierapport(matrix, punten, args.diepte, args.speelveld, args.breedte,
                            lens=lens_uit({'lens': lens}) if lens else None)
    druk_standpunt(matrix, fitpunten, args)


if __name__ == '__main__':
    main()
