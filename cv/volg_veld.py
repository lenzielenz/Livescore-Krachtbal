#!/usr/bin/env python3
"""Bewegende camera: de homografie per moment in plaats van één vaste kalibratie.

``calibrate.py`` legt het veld één keer vast, voor een camera die stilstaat. Film je
met de gsm in de hand — pannend, zoomend, meelopend met het spel — dan klopt die ene
matrix alleen nog voor het frame waarop ze gefit is. Deze module houdt de homografie
bíj terwijl de camera beweegt, zodat het loslaatpunt van de worp en het punt waar de
bal de grond raakt op élk moment naar echte veldmeters vertaald kunnen worden.

Hoe (twee lagen die elkaar corrigeren):

1. **Volgen.** Tussen twee opeenvolgende frames verandert het beeld weinig. Uit de
   verplaatsing van markante punten (optical flow) volgt een kleine homografie
   ``H_vorig→nu``; die wordt aan de vorige geketend. Snel, maar elke schatting draagt
   een beetje fout — na honderden frames is dat merkbaar wéggedreven.

2. **Herankeren op de veldlijnen.** Precies wat een mens doet: je ziet de lijnen van
   het veld liggen. De witte lijnen worden gedetecteerd, gekoppeld aan de lijnen die
   we van het veldmodel verwachten, en daaruit wordt de homografie opnieuw gefit. Dat
   wist de opgelopen drift. Gebeurt periodiek en zodra het volgen onbetrouwbaar wordt.

De wiskunde hieronder (matrixrekenen, DLT, lijnkoppeling, drift-meting) is pure
stdlib en apart getest. Alleen het uitlezen van beeldpunten en lijnsegmenten uit de
video vraagt opencv; dat zit in één laag onderaan, zodat de rest zonder video draait.

    # Volgen op een échte, bewegende opname (vereist opencv):
    python3 cv/volg_veld.py --video match.mp4 --kalibratie kalibratie.json \\
        --uit homografie.jsonl

    # De hele keten oefenen zonder video (reproduceerbaar):
    python3 cv/volg_veld.py --demo --seed 7 --duur 120 --uit homografie.jsonl

Het resultaat is een JSONL met per moment een matrix; ``landing.py`` en ``tracking.py``
lezen dat met ``--homografie`` in plaats van een vaste ``--kalibratie``.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import veld  # noqa: E402

# Herankeren op de veldlijnen: standaard elke 2 seconden. Vaker kost rekentijd, minder
# vaak laat de drift oplopen tussen twee ankers.
HERANKER_INTERVAL_S = 2.0
# Vallen de gedetecteerde lijnen gemiddeld verder dan dit van de lijnen die het veldmodel
# verwacht, dan noemen we de herankering mislukt: dan houden we de gevolgde matrix en
# markeren het moment als onzeker, in plaats van een slechtere matrix op te dringen.
MAX_ANKER_FOUT_M = 0.6
# Een herankering corrigeert drift; ze mag het veld niet verplaatsen. Springt de nieuwe
# matrix verder dan dit, dan is een lijn verkeerd gekoppeld en houden we de oude.
MAX_ANKERSPRONG_M = 4.0
# Zo ver mag een moment van de dichtstbijzijnde gevolgde matrix liggen voor we zeggen
# dat we het niet weten (bv. de camera keek even weg van het veld).
MAX_GAT_S = 1.0
# Hoe ver een gedetecteerde lijn van de verwachte plek mag liggen om er nog bij te horen.
# De bovengrens ligt vast in het veld zelf: doellijn en vrijeworplijn liggen 4 m uit
# elkaar, dus vanaf 2 m twijfel koppelt de ene zich aan de andere en zet de herankering
# het veld een lijn verder. 1,8 m laat drift tot bijna twee meter herstellen en houdt
# 2,2 m marge tot die verwarring. Loopt de drift verder op, dan is de remedie vaker
# herankeren (--heranker), niet een ruimere drempel.
MAX_KOPPEL_AFSTAND_M = 1.8


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


# ---------------------------------------------------------------------------
# Matrixrekenen (puur — de kern van het volgen)
# ---------------------------------------------------------------------------

Matrix = list[list[float]]


def eenheid() -> Matrix:
    return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]


def maal(a: Matrix, b: Matrix) -> Matrix:
    """Matrixproduct a·b — de keten van beeld naar veld loopt hierdoorheen."""
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def normaliseer(m: Matrix) -> Matrix:
    """Schaal zodat m[2][2] = 1: twee homografieën die hetzelfde doen, zien er dan ook
    hetzelfde uit (en kunnen vergeleken worden)."""
    d = m[2][2]
    if abs(d) < 1e-12:
        return [rij[:] for rij in m]
    return [[w / d for w in rij] for rij in m]


def projecteer(m: Matrix, x: float, y: float) -> tuple[float, float]:
    """Beeldpunt (px) → veldpunt (m), of andersom met de inverse matrix."""
    nx = m[0][0] * x + m[0][1] * y + m[0][2]
    ny = m[1][0] * x + m[1][1] * y + m[1][2]
    d = m[2][0] * x + m[2][1] * y + m[2][2]
    if abs(d) < 1e-12:
        return float('nan'), float('nan')
    return nx / d, ny / d


def inverteer(m: Matrix) -> Matrix:
    """Inverse van een 3×3 (adjugaat/determinant) — voor veld → beeld."""
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-12:
        raise ValueError('matrix niet inverteerbaar')
    adj = [
        [e * i - f * h, c * h - b * i, b * f - c * e],
        [f * g - d * i, a * i - c * g, c * d - a * f],
        [d * h - e * g, b * g - a * h, a * e - b * d],
    ]
    return [[w / det for w in rij] for rij in adj]


# ---------------------------------------------------------------------------
# Homografie uit puntparen (DLT + kleinste kwadraten, puur stdlib)
# ---------------------------------------------------------------------------


def _los_op(a: list[list[float]], b: list[float]) -> list[float] | None:
    """Gauss-eliminatie met partieel pivoteren: los a·x = b op."""
    n = len(b)
    m = [rij[:] + [b[i]] for i, rij in enumerate(a)]
    for kol in range(n):
        pivot = max(range(kol, n), key=lambda r: abs(m[r][kol]))
        if abs(m[pivot][kol]) < 1e-12:
            return None
        m[kol], m[pivot] = m[pivot], m[kol]
        for rij in range(n):
            if rij == kol:
                continue
            factor = m[rij][kol] / m[kol][kol]
            if factor == 0.0:
                continue
            for k in range(kol, n + 1):
                m[rij][k] -= factor * m[kol][k]
    return [m[i][n] / m[i][i] for i in range(n)]


def homografie_uit_paren(paren: list[tuple[tuple[float, float], tuple[float, float]]]) -> Matrix | None:
    """Beste homografie beeld→veld door ≥ 4 (beeldpunt, veldpunt)-paren.

    Klassieke DLT met h[2][2] = 1: elk paar levert twee vergelijkingen, en de acht
    onbekenden volgen uit de normaalvergelijkingen (kleinste kwadraten, dus meer dan
    vier paren maken de schatting robuuster in plaats van overbepaald).
    """
    if len(paren) < 4:
        return None
    rijen: list[list[float]] = []
    rechts: list[float] = []
    for (bx, by), (vx, vy) in paren:
        rijen.append([bx, by, 1.0, 0.0, 0.0, 0.0, -bx * vx, -by * vx])
        rechts.append(vx)
        rijen.append([0.0, 0.0, 0.0, bx, by, 1.0, -bx * vy, -by * vy])
        rechts.append(vy)
    # Normaalvergelijkingen AᵀA·h = Aᵀb (8×8) — genoeg voor deze schaal.
    ata = [[sum(rijen[k][i] * rijen[k][j] for k in range(len(rijen))) for j in range(8)] for i in range(8)]
    atb = [sum(rijen[k][i] * rechts[k] for k in range(len(rijen))) for i in range(8)]
    h = _los_op(ata, atb)
    if h is None:
        return None
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1.0]]


def reprojectiefout_m(m: Matrix, paren: list[tuple[tuple[float, float], tuple[float, float]]]) -> float:
    """Gemiddelde afstand (px) tussen het aangeklikte/gedetecteerde beeldpunt en waar
    de matrix het veldpunt terug in beeld legt. De maat waarop we een anker vertrouwen."""
    if not paren:
        return float('inf')
    try:
        terug = inverteer(m)
    except ValueError:
        return float('inf')
    som = 0.0
    for (bx, by), (vx, vy) in paren:
        px, py = projecteer(terug, vx, vy)
        if px != px or py != py:
            return float('inf')
        som += math.hypot(px - bx, py - by)
    return som / len(paren)


# ---------------------------------------------------------------------------
# Veldlijnen: wat we verwachten te zien, en hoe we het gedetecteerde eraan koppelen
# ---------------------------------------------------------------------------

# Een veldlijn als twee punten in veldmeters. Dit zijn precies de lijnen die op elk
# krachtbalveld geschilderd staan — het houvast waarmee we herankeren.
def veldlijnen(
    diepte_m: float = veld.STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte_m: float = veld.BREEDTE_M,
    speelveld_m: float = veld.SPEELVELD_LENGTE_M,
) -> list[tuple[str, tuple[float, float], tuple[float, float]]]:
    lengte = veld.totale_lengte_m(diepte_m, speelveld_m)
    dwars = [
        ('achterlijn_thuis', 0.0),
        ('doellijn_thuis', diepte_m),
        ('vrijeworplijn_thuis', diepte_m + veld.VRIJEWORP_OFFSET_M),
        ('middellijn', lengte / 2.0),
        ('vrijeworplijn_uit', lengte - diepte_m - veld.VRIJEWORP_OFFSET_M),
        ('doellijn_uit', lengte - diepte_m),
        ('achterlijn_uit', lengte),
    ]
    lijnen: list[tuple[str, tuple[float, float], tuple[float, float]]] = [
        (naam, (0.0, y), (breedte_m, y)) for naam, y in dwars
    ]
    lijnen.append(('zijlijn_links', (0.0, 0.0), (0.0, lengte)))
    lijnen.append(('zijlijn_rechts', (breedte_m, 0.0), (breedte_m, lengte)))
    return lijnen


def punt_op_lijn(punt: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    """Loodrechte projectie van een punt op de lijn door a en b (niet begrensd tot het
    segment: een gedetecteerd stuk lijn mag korter zijn dan de echte veldlijn)."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    noemer = dx * dx + dy * dy
    if noemer < 1e-12:
        return a
    t = ((punt[0] - ax) * dx + (punt[1] - ay) * dy) / noemer
    return (ax + t * dx, ay + t * dy)


def afstand_tot_lijn(punt: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    px, py = punt_op_lijn(punt, a, b)
    return math.hypot(punt[0] - px, punt[1] - py)


def _richtingsverschil(a: tuple[float, float], b: tuple[float, float],
                       c: tuple[float, float], d: tuple[float, float]) -> float:
    """Hoek tussen twee lijnen in radialen, altijd 0..π/2 (een lijn heeft geen kop of staart)."""
    h1 = math.atan2(b[1] - a[1], b[0] - a[0])
    h2 = math.atan2(d[1] - c[1], d[0] - c[0])
    verschil = abs(h1 - h2) % math.pi
    return min(verschil, math.pi - verschil)


def lijnvergelijking(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float, float]:
    """De lijn door a en b als (A, B, C) met A·x + B·y + C = 0 en A² + B² = 1.

    Genormaliseerd, zodat |A·x + B·y + C| meteen de loodrechte afstand in meters is.
    """
    dx, dy = b[0] - a[0], b[1] - a[1]
    lengte = math.hypot(dx, dy)
    if lengte < 1e-12:
        return 0.0, 0.0, 0.0
    A, B = -dy / lengte, dx / lengte
    return A, B, -(A * a[0] + B * a[1])


def koppel_lijnconstraints(
    gedetecteerd: list[tuple[tuple[float, float], tuple[float, float]]],
    m: Matrix,
    lijnen: list[tuple[str, tuple[float, float], tuple[float, float]]],
    max_afstand_m: float = MAX_KOPPEL_AFSTAND_M,
    max_hoek_rad: float = 0.35,
    punten_per_segment: int = 4,
) -> list[tuple[tuple[float, float], tuple[float, float, float]]]:
    """Gedetecteerde lijnstukken (beeldpixels) → (beeldpunt, veldlijn)-voorwaarden.

    Voor elk segment zoeken we de veldlijn die er het dichtst bij ligt én dezelfde kant
    op loopt, en leggen dan vast: "deze beeldpunten liggen op díe lijn". Bewust géén
    punt-tot-punt-koppeling — een detector ziet een willekeurig stuk van de lijn, dus
    wáár langs de lijn een uiteinde ligt is verzonnen informatie die de fit scheeftrekt.

    De richtingseis houdt een stuk zijlijn ervan af zich aan een doellijn te koppelen
    zodra de drift een meter bedraagt.
    """
    uit: list[tuple[tuple[float, float], tuple[float, float, float]]] = []
    for (x1, y1), (x2, y2) in gedetecteerd:
        v1 = projecteer(m, x1, y1)
        v2 = projecteer(m, x2, y2)
        if v1[0] != v1[0] or v2[0] != v2[0]:
            continue
        beste = None
        beste_afstand = max_afstand_m
        for _naam, a, b in lijnen:
            if _richtingsverschil(v1, v2, a, b) > max_hoek_rad:
                continue
            d = (afstand_tot_lijn(v1, a, b) + afstand_tot_lijn(v2, a, b)) / 2.0
            if d < beste_afstand:
                beste_afstand = d
                beste = (a, b)
        if beste is None:
            continue
        vergelijking = lijnvergelijking(beste[0], beste[1])
        # Meerdere punten langs het segment: meer houvast dan alleen de uiteinden,
        # zonder dat we doen alsof we weten wáár op de lijn ze horen.
        n = max(2, punten_per_segment)
        for i in range(n):
            f = i / (n - 1)
            uit.append(((x1 + f * (x2 - x1), y1 + f * (y2 - y1)), vergelijking))
    return uit


def homografie_uit_lijnen(
    constraints: list[tuple[tuple[float, float], tuple[float, float, float]]],
    prior: Matrix | None = None,
    prior_gewicht: float = 0.1,
) -> Matrix | None:
    """Homografie beeld→veld uit punt-op-lijn-voorwaarden.

    Elk paar (beeldpunt p, veldlijn l) zegt lᵀ·(H·p) = 0: het punt landt érgens op die
    lijn. Uitgeschreven met h[2][2] = 1 is dat één lineaire vergelijking in de acht
    onbekenden, dus acht voorwaarden uit minstens twee richtingen volstaan.

    **Waarom er een prior bij hoort.** De lijnen die op één moment in beeld zijn leggen
    zelden álle acht vrijheidsgraden vast: zie je bijvoorbeeld maar één zijlijn, dan mag
    de fit het veld in de breedte uitrekken zonder dat één lijn er slechter door valt.
    De lijnfout ziet er dan uitstekend uit terwijl het veld meters verschoven is —
    gemeten op de demo: van 0,07 m drift naar 1,01 m ná zo'n "geslaagde" herankering.
    Daarom telt de gevolgde stand (de prior) mee als zwakke voorwaarde: waar de lijnen
    iets zeggen winnen zij, en waar ze zwijgen blijft staan wat we al wisten.
    """
    if len(constraints) < 8:
        return None
    rijen: list[list[float]] = []
    rechts: list[float] = []
    richtingen: set[float] = set()
    for (x, y), (A, B, C) in constraints:
        rijen.append([A * x, A * y, A, B * x, B * y, B, C * x, C * y])
        rechts.append(-C)
        richtingen.add(round(math.atan2(B, A) % math.pi, 2))
    # Alle lijnen evenwijdig → zelfs mét prior is dit te weinig houvast.
    if len(richtingen) < 2:
        return None

    if prior is not None:
        p = normaliseer(prior)
        vlak = [p[0][0], p[0][1], p[0][2], p[1][0], p[1][1], p[1][2], p[2][0], p[2][1]]
        # De acht onbekenden lopen sterk uiteen in grootte (de perspectiefterme zijn
        # ordes kleiner dan de schaalterme), dus het gewicht is relatief per element.
        schaal = max(abs(w) for w in vlak) or 1.0
        for i, waarde in enumerate(vlak):
            gewicht = prior_gewicht * max(abs(waarde), schaal * 1e-4) * len(constraints) ** 0.5
            rij = [0.0] * 8
            rij[i] = gewicht
            rijen.append(rij)
            rechts.append(gewicht * waarde)

    ata = [[sum(rijen[k][i] * rijen[k][j] for k in range(len(rijen))) for j in range(8)] for i in range(8)]
    atb = [sum(rijen[k][i] * rechts[k] for k in range(len(rijen))) for i in range(8)]
    h = _los_op(ata, atb)
    if h is None:
        return None
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1.0]]


def lijnfout_m(
    m: Matrix,
    constraints: list[tuple[tuple[float, float], tuple[float, float, float]]],
) -> float:
    """Gemiddelde loodrechte afstand (meters) tussen de geprojecteerde punten en hun lijn.

    De eerlijke maat voor een lijn-anker: hoe goed vallen de gedetecteerde lijnen samen
    met waar het veldmodel ze verwacht.
    """
    if not constraints:
        return float('inf')
    som = 0.0
    for (x, y), (A, B, C) in constraints:
        vx, vy = projecteer(m, x, y)
        if vx != vx or vy != vy:
            return float('inf')
        som += abs(A * vx + B * vy + C)
    return som / len(constraints)


def veranker_op_lijnen(
    m: Matrix,
    gedetecteerd: list[tuple[tuple[float, float], tuple[float, float]]],
    lijnen: list[tuple[str, tuple[float, float], tuple[float, float]]],
    max_fout_m: float = MAX_ANKER_FOUT_M,
    rondes: int = 3,
    max_sprong_m: float = MAX_ANKERSPRONG_M,
    veldpunten: list[tuple[float, float]] | None = None,
) -> tuple[Matrix, float, int]:
    """Corrigeer de gevolgde matrix met de zichtbare veldlijnen.

    Geeft (matrix, gemiddelde lijnfout in meters, aantal gebruikte punten) terug. Elke
    ronde herkoppelt met de verbeterde matrix — zo trekt de schatting zich naar de
    lijnen toe. Wordt het niet beter, is de fout te groot, of springt het veld meters
    weg (dan is een lijn verkeerd gekoppeld), dan komt de ingevoerde matrix ongewijzigd
    terug: herankeren mag nooit iets slechters opdringen dan wat we al hadden.
    """
    # Gemeten op punten óp het veld: "hoeveel verschuift deze correctie het veld?" Meten op
    # beeldpunten zou de vraag verkeerd stellen — punten buiten het veld blazen elke kleine
    # matrixwijziging op tot meters.
    proef = veldpunten or _standaard_veldpunten()
    huidig = m
    beste_fout = lijnfout_m(m, koppel_lijnconstraints(gedetecteerd, m, lijnen))
    gebruikt = 0
    for _ in range(max(1, rondes)):
        constraints = koppel_lijnconstraints(gedetecteerd, huidig, lijnen)
        if len(constraints) < 8:
            break
        # De gevolgde stand als prior: de lijnen corrigeren wat ze zien, de rest blijft.
        kandidaat = homografie_uit_lijnen(constraints, prior=m)
        if kandidaat is None:
            break
        kandidaat = normaliseer(kandidaat)
        fout = lijnfout_m(kandidaat, constraints)
        if fout > max_fout_m or fout >= beste_fout:
            break
        # veldfout_m(kandidaat, huidig, …) leest een veldpunt via de oude matrix in beeld en
        # met de nieuwe terug: precies de verplaatsing die de correctie veroorzaakt.
        verplaatsing = veldfout_m(kandidaat, huidig, proef)
        if verplaatsing and max(verplaatsing) > max_sprong_m:
            break
        huidig, beste_fout, gebruikt = kandidaat, fout, len(constraints)
    if gebruikt == 0:
        return m, float('inf'), 0
    return huidig, beste_fout, gebruikt


# ---------------------------------------------------------------------------
# Het spoor: welke matrix hoort bij welk moment
# ---------------------------------------------------------------------------


class HomografieSpoor:
    """De homografie doorheen de tijd, opzoekbaar per moment.

    ``landing.py`` en ``tracking.py`` vragen: "welke matrix gold op seconde 42,3?" —
    en krijgen de dichtstbijzijnde, of niets wanneer er te lang geen betrouwbare
    schatting was (dan mag er liever géén meting zijn dan een foute).
    """

    def __init__(self, punten: list[dict] | None = None, max_gat_s: float = MAX_GAT_S) -> None:
        self.punten = sorted(punten or [], key=lambda p: float(p['t']))
        self.max_gat_s = max_gat_s

    def voeg_toe(self, t: float, m: Matrix, fout_m: float, bron: str) -> None:
        self.punten.append({
            't': round(float(t), 3),
            'H': [[round(w, 9) for w in rij] for rij in normaliseer(m)],
            'fout_m': None if fout_m == float('inf') else round(fout_m, 2),
            'bron': bron,
        })

    def op(self, t: float) -> Matrix | None:
        """De matrix die op dit moment gold, of None bij een te groot gat."""
        if not self.punten:
            return None
        # Binaire zoektocht naar de dichtstbijzijnde tijd.
        laag, hoog = 0, len(self.punten) - 1
        while laag < hoog:
            mid = (laag + hoog) // 2
            if float(self.punten[mid]['t']) < t:
                laag = mid + 1
            else:
                hoog = mid
        kandidaten = {laag, max(0, laag - 1)}
        beste = min(kandidaten, key=lambda i: abs(float(self.punten[i]['t']) - t))
        if abs(float(self.punten[beste]['t']) - t) > self.max_gat_s:
            return None
        return self.punten[beste]['H']

    def schrijf(self, pad: Path) -> None:
        with pad.open('w', encoding='utf-8') as f:
            for p in self.punten:
                f.write(json.dumps(p, ensure_ascii=False) + '\n')

    @staticmethod
    def lees(pad: Path, max_gat_s: float = MAX_GAT_S) -> 'HomografieSpoor':
        punten = []
        with pad.open(encoding='utf-8') as f:
            for regel in f:
                regel = regel.strip()
                if regel:
                    punten.append(json.loads(regel))
        return HomografieSpoor(punten, max_gat_s=max_gat_s)

    def rapport(self) -> dict:
        ankers = [p for p in self.punten if p['bron'] == 'lijnen']
        fouten = [p['fout_m'] for p in ankers if p['fout_m'] is not None]
        return {
            'momenten': len(self.punten),
            'ankers': len(ankers),
            'gemiddelde_ankerfout_m': round(sum(fouten) / len(fouten), 2) if fouten else None,
            'duur_s': round(float(self.punten[-1]['t']) - float(self.punten[0]['t']), 1) if self.punten else 0.0,
        }


def _standaard_veldpunten(
    diepte_m: float = veld.STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte_m: float = veld.BREEDTE_M,
    speelveld_m: float = veld.SPEELVELD_LENGTE_M,
) -> list[tuple[float, float]]:
    """Een raster over het veld: daar meten we of een correctie klein of wild is."""
    lengte = veld.totale_lengte_m(diepte_m, speelveld_m)
    return [(x, y)
            for x in (1.0, breedte_m / 2.0, breedte_m - 1.0)
            for y in (2.0, lengte * 0.25, lengte / 2.0, lengte * 0.75, lengte - 2.0)]


def veldfout_m(gemeten: Matrix, echt: Matrix, veldpunten: list[tuple[float, float]]) -> list[float]:
    """Hoeveel meter zit de meting ernaast, op punten die écht op het veld liggen?

    Neem een veldpunt, zoek waar het in dit beeld staat (met de échte matrix), en lees het
    terug met de gemeten matrix. Het verschil is precies de fout die een worp zou krijgen.

    Bewust niet meten op vaste beeldpunten: bij een pannende camera wijzen die elk moment
    naar een ander stuk veld, en dan meet je de camerabeweging in plaats van de fout.
    """
    naar_beeld = inverteer(echt)
    fouten: list[float] = []
    for vx, vy in veldpunten:
        px, py = projecteer(naar_beeld, vx, vy)
        if px != px:
            continue
        gx, gy = projecteer(gemeten, px, py)
        if gx != gx:
            continue
        fouten.append(math.hypot(gx - vx, gy - vy))
    return fouten


def drift_m(a: Matrix, b: Matrix, punten: list[tuple[float, float]]) -> float:
    """Hoeveel meter schelen twee matrices op dezelfde beeldpunten?

    De maat waarmee we zien of het volgen wegdrijft: hetzelfde stuk gras mag door
    beide matrices niet op verschillende plekken van het veld belanden.
    """
    afstanden = []
    for x, y in punten:
        ax, ay = projecteer(a, x, y)
        bx, by = projecteer(b, x, y)
        if ax != ax or bx != bx:
            continue
        afstanden.append(math.hypot(ax - bx, ay - by))
    return max(afstanden) if afstanden else 0.0


# ---------------------------------------------------------------------------
# Demo: een camera die pant en zoomt, zonder video
# ---------------------------------------------------------------------------


def demo_camerabeweging(t: float, amplitude_px: float = 140.0, zoom: float = 0.06) -> Matrix:
    """Beeld→beeld-transformatie van een camera die traag heen en weer pant en ademt.

    Puur bedoeld om de keten te oefenen: pan sinusvormig, lichte zoom, kleine rotatie —
    samen precies het soort beweging dat een vaste kalibratie onbruikbaar maakt.
    """
    pan = amplitude_px * math.sin(t / 7.0)
    tilt = 0.35 * amplitude_px * math.sin(t / 11.0)
    schaal = 1.0 + zoom * math.sin(t / 13.0)
    hoek = 0.02 * math.sin(t / 17.0)
    cos, sin = math.cos(hoek) * schaal, math.sin(hoek) * schaal
    return [[cos, -sin, pan], [sin, cos, tilt], [0.0, 0.0, 1.0]]


def demo_spoor(
    seed: int,
    duur_s: float,
    kalibratie: Matrix,
    stap_s: float = 0.5,
    ruis_px: float = 0.4,
    heranker_interval_s: float = HERANKER_INTERVAL_S,
    diepte_m: float = veld.STANDAARD_DOELGEBIED_DIEPTE_M,
) -> tuple[HomografieSpoor, dict]:
    """Volg een gesimuleerde bewegende camera: flow met meetruis, lijnen als anker.

    Toont waar het om draait: zonder herankeren stapelt de ruis zich op tot de meting
    onbruikbaar is; mét de veldlijnen blijft de fout klein. Het rapport bevat beide,
    zodat de winst meetbaar is in plaats van beloofd.
    """
    rng = random.Random(seed)
    lijnen = veldlijnen(diepte_m)
    # Het echte (onbekende) verloop: de kalibratie, gezien vanuit het bewogen beeld.
    def echt_op(t: float) -> Matrix:
        return normaliseer(maal(kalibratie, inverteer(demo_camerabeweging(t))))

    spoor = HomografieSpoor()
    zonder_anker = HomografieSpoor()
    # De keten wordt in BEELDcoördinaten bijgehouden (referentieframe → nu), want daar meet
    # optical flow in: pixels. De homografie volgt er dan uit als kalibratie ∘ keten⁻¹.
    keten = eenheid()
    keten_ongeankerd = eenheid()
    gevolgd = echt_op(0.0)
    ongeankerd = gevolgd
    spoor.voeg_toe(0.0, gevolgd, 0.0, 'kalibratie')
    zonder_anker.voeg_toe(0.0, ongeankerd, 0.0, 'kalibratie')

    # Waar we de fout meten: punten verspreid over het échte veld (daar vallen de worpen).
    lengte = veld.totale_lengte_m(diepte_m)
    veldpunten = [(x, y) for x in (1.0, veld.BREEDTE_M / 2, veld.BREEDTE_M - 1.0)
                  for y in (2.0, lengte * 0.25, lengte / 2, lengte * 0.75, lengte - 2.0)]
    laatste_anker = 0.0
    t = stap_s
    driften: list[float] = []
    driften_zonder: list[float] = []
    while t <= duur_s:
        echt = echt_op(t)
        # Optical flow meet de beeld-naar-beeldstap in pixels — inclusief meetruis. Die ruis
        # zit niet alleen in de verschuiving: ook schaal en rotatie worden per stap een
        # fractie verkeerd geschat, en juist díe fouten stapelen multiplicatief op. Dat is
        # waarom puur volgen na een paar minuten wegdrijft en herankeren nodig is.
        stap = maal(demo_camerabeweging(t), inverteer(demo_camerabeweging(t - stap_s)))
        schaalfout = 1.0 + rng.gauss(0.0, ruis_px * 0.002)
        hoekfout = rng.gauss(0.0, ruis_px * 0.001)
        cos, sin = math.cos(hoekfout) * schaalfout, math.sin(hoekfout) * schaalfout
        stap_met_ruis = maal([[cos, -sin, 0.0], [sin, cos, 0.0], [0.0, 0.0, 1.0]], stap)
        stap_met_ruis[0][2] += rng.gauss(0.0, ruis_px)
        stap_met_ruis[1][2] += rng.gauss(0.0, ruis_px)
        keten = normaliseer(maal(stap_met_ruis, keten))
        keten_ongeankerd = normaliseer(maal(stap_met_ruis, keten_ongeankerd))
        gevolgd = normaliseer(maal(kalibratie, inverteer(keten)))
        ongeankerd = normaliseer(maal(kalibratie, inverteer(keten_ongeankerd)))

        bron = 'flow'
        fout = float('inf')
        if t - laatste_anker >= heranker_interval_s:
            # Herankeren: "zie" de veldlijnen zoals ze nu in beeld liggen.
            gedetecteerd = _demo_lijnsegmenten(echt, lijnen, rng)
            gevolgd, fout, gebruikt = veranker_op_lijnen(
                gevolgd, gedetecteerd, lijnen, veldpunten=veldpunten,
            )
            if gebruikt:
                bron = 'lijnen'
                laatste_anker = t
                # Het anker corrigeert ook de keten: vanaf hier volgen we verder vanuit de
                # herstelde stand, anders blijft de oude drift meelopen.
                keten = normaliseer(maal(inverteer(gevolgd), kalibratie))
        spoor.voeg_toe(t, gevolgd, fout, bron)
        zonder_anker.voeg_toe(t, ongeankerd, float('inf'), 'flow')
        driften.extend(veldfout_m(gevolgd, echt, veldpunten))
        driften_zonder.extend(veldfout_m(ongeankerd, echt, veldpunten))
        t += stap_s

    def p95(v: list[float]) -> float:
        return sorted(v)[min(len(v) - 1, int(len(v) * 0.95))] if v else 0.0

    rapport = {
        **spoor.rapport(),
        'fout_mediaan_m': round(statistics.median(driften), 2) if driften else 0.0,
        'fout_p95_m': round(p95(driften), 2) if driften else 0.0,
        'fout_mediaan_zonder_ankers_m': round(statistics.median(driften_zonder), 2) if driften_zonder else 0.0,
        'fout_p95_zonder_ankers_m': round(p95(driften_zonder), 2) if driften_zonder else 0.0,
    }
    return spoor, rapport


def _demo_lijnsegmenten(
    echt: Matrix,
    lijnen: list[tuple[str, tuple[float, float], tuple[float, float]]],
    rng: random.Random,
    ruis_px: float = 1.0,
    beeld: tuple[int, int] = (1280, 720),
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """De veldlijnen zoals een lijndetector ze in dít frame zou vinden.

    Realistisch gehouden, want daar hangt de betrouwbaarheid van de hele herankering aan:
    stukjes lijn in plaats van hele lijnen, met meetruis, af en toe eentje gemist — en
    uitsluitend wat binnen het beeldkader valt. Dat laatste is geen detail: een echte
    detector ziet niets buiten beeld, en punten ver buiten het kader maken de fit
    bovendien overgevoelig voor de perspectiefterme.
    """
    naar_beeld = inverteer(echt)
    breed, hoog = beeld
    uit: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for _naam, a, b in lijnen:
        if rng.random() < 0.2:  # niet elke lijn wordt gevonden
            continue
        # Loop de lijn af en houd het stuk over dat in beeld valt.
        zichtbaar: list[tuple[float, float]] = []
        for i in range(41):
            f = i / 40
            px, py = projecteer(naar_beeld, a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]))
            if px != px:
                continue
            if 0 <= px <= breed and 0 <= py <= hoog:
                zichtbaar.append((px, py))
        if len(zichtbaar) < 2:
            continue
        # Een detector vindt zelden het volledige zichtbare stuk.
        i0 = rng.randrange(0, max(1, len(zichtbaar) // 3))
        i1 = rng.randrange(min(len(zichtbaar) - 1, 2 * len(zichtbaar) // 3), len(zichtbaar))
        if i1 - i0 < 1:
            continue
        p0 = (zichtbaar[i0][0] + rng.gauss(0.0, ruis_px), zichtbaar[i0][1] + rng.gauss(0.0, ruis_px))
        p1 = (zichtbaar[i1][0] + rng.gauss(0.0, ruis_px), zichtbaar[i1][1] + rng.gauss(0.0, ruis_px))
        if math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= 40:  # te kort = geen bruikbare lijn
            uit.append((p0, p1))
    return uit


# ---------------------------------------------------------------------------
# Video: optical flow + lijndetectie (de enige laag die opencv nodig heeft)
# ---------------------------------------------------------------------------


def _laad_cv2():
    try:
        import cv2  # noqa: PLC0415
        return cv2
    except ImportError:
        _fout('opencv ontbreekt — installeer met: pip install -r cv/requirements.txt '
              '(of oefen de lus zonder video via --demo --seed)')


def detecteer_lijnsegmenten(cv2, frame, min_lengte_px: int = 60) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Witte lijnstukken in het beeld. Krijtlijnen zijn licht en verzadigingsarm; dat
    onderscheidt ze van gras, truitjes en reclameborden."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    wit = cv2.inRange(hsv, (0, 0, 170), (180, 60, 255))
    wit = cv2.morphologyEx(wit, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
    randen = cv2.Canny(wit, 50, 150)
    segmenten = cv2.HoughLinesP(
        randen, 1, math.pi / 180, threshold=60, minLineLength=min_lengte_px, maxLineGap=12,
    )
    if segmenten is None:
        return []
    return [((float(x1), float(y1)), (float(x2), float(y2))) for x1, y1, x2, y2 in segmenten[:, 0]]


def volg_video(args: argparse.Namespace) -> tuple[HomografieSpoor, dict]:
    cv2 = _laad_cv2()
    import numpy as np  # noqa: PLC0415

    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')
    if not args.kalibratie.is_file():
        _fout(f'kalibratiebestand niet gevonden: {args.kalibratie} (maak het met cv/calibrate.py)')
    kal = json.loads(args.kalibratie.read_text(encoding='utf-8'))
    start = normaliseer(kal['matrix_beeld_naar_veld'])
    info = kal.get('veld') or {}
    diepte = float(kal.get('doelgebied_diepte_m') or info.get('doelgebied_diepte_m')
                   or veld.STANDAARD_DOELGEBIED_DIEPTE_M)
    lijnen = veldlijnen(
        diepte,
        float(info.get('breedte_m') or veld.BREEDTE_M),
        float(info.get('speelveld_m') or veld.SPEELVELD_LENGTE_M),
    )

    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        _fout(f'video kan niet geopend worden: {args.video}')

    spoor = HomografieSpoor()
    gevolgd = start
    spoor.voeg_toe(0.0, gevolgd, 0.0, 'kalibratie')
    stap = 1.0 / args.fps
    cap.set(cv2.CAP_PROP_POS_MSEC, 0.0)
    ok, vorig = cap.read()
    if not ok:
        _fout('eerste frame kon niet gelezen worden')
    vorig_grijs = cv2.cvtColor(vorig, cv2.COLOR_BGR2GRAY)
    laatste_anker = 0.0
    t = stap
    verloren = 0
    while True:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            break
        grijs = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Markante punten volgen tussen de twee frames (Lucas-Kanade).
        p0 = cv2.goodFeaturesToTrack(vorig_grijs, maxCorners=400, qualityLevel=0.01, minDistance=12)
        bron, fout = 'flow', float('inf')
        if p0 is not None and len(p0) >= 8:
            p1, status, _ = cv2.calcOpticalFlowPyrLK(vorig_grijs, grijs, p0, None)
            goed_oud = p0[status.flatten() == 1].reshape(-1, 2)
            goed_nieuw = p1[status.flatten() == 1].reshape(-1, 2)
            if len(goed_oud) >= 8:
                stap_m, _ = cv2.findHomography(goed_nieuw, goed_oud, cv2.RANSAC, 3.0)
                if stap_m is not None:
                    gevolgd = normaliseer(maal(gevolgd, [[float(w) for w in rij] for rij in stap_m]))
                else:
                    verloren += 1
            else:
                verloren += 1
        else:
            verloren += 1

        if t - laatste_anker >= args.heranker:
            segmenten = detecteer_lijnsegmenten(cv2, frame, args.min_lijn)
            gevolgd, fout, gebruikt = veranker_op_lijnen(gevolgd, segmenten, lijnen, args.max_fout)
            if gebruikt:
                bron = 'lijnen'
                laatste_anker = t
        spoor.voeg_toe(t, gevolgd, fout, bron)
        vorig_grijs = grijs
        t += stap
        del np  # numpy is enkel nodig voor de opencv-aanroepen hierboven
    cap.release()
    return spoor, {**spoor.rapport(), 'frames_zonder_flow': verloren}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Bewegende camera: de homografie per moment volgen en herankeren op de veldlijnen.'
    )
    parser.add_argument('--uit', type=Path, required=True, help='uitvoerbestand (homografie-JSONL)')
    parser.add_argument('--video', type=Path, default=None, help='de wedstrijdvideo (videomodus)')
    parser.add_argument('--kalibratie', type=Path, default=None,
                        help='kalibratie van het eerste frame (calibrate.py) — het vertrekpunt')
    parser.add_argument('--fps', type=float, default=4.0,
                        help='hoe vaak per seconde de homografie bijgewerkt wordt (standaard 4)')
    parser.add_argument('--heranker', type=float, default=HERANKER_INTERVAL_S,
                        help=f'om de hoeveel seconden herankeren op de veldlijnen (standaard {HERANKER_INTERVAL_S:g})')
    parser.add_argument('--max-fout', type=float, default=MAX_ANKER_FOUT_M,
                        help=f'maximale afwijking van een anker in meters (standaard {MAX_ANKER_FOUT_M:g})')
    parser.add_argument('--min-lijn', type=int, default=60,
                        help='minimale lengte van een lijnstuk in pixels (standaard 60)')
    parser.add_argument('--demo', action='store_true', help='gesimuleerde bewegende camera (vereist --seed)')
    parser.add_argument('--seed', type=int, default=None, help='reproduceerbare demo')
    parser.add_argument('--duur', type=float, default=120.0, help='demolengte in seconden (standaard 120)')
    parser.add_argument('--diepte', type=float, default=veld.STANDAARD_DOELGEBIED_DIEPTE_M,
                        help='doelgebied-diepte in meters (demo; standaard 10)')
    args = parser.parse_args(argv)

    if args.demo and args.video is not None:
        parser.error('--demo gaat niet samen met --video — kies één modus')
    if args.fps <= 0:
        _fout('--fps moet groter zijn dan 0')

    if args.demo:
        if args.seed is None:
            _fout('--demo vereist --seed (reproduceerbaarheid is de hele bedoeling)')
        if args.duur <= 0:
            _fout('--duur moet groter zijn dan 0')
        # Een geloofwaardige startkalibratie: 12 px per meter, veld gecentreerd in beeld.
        start = inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        spoor, rapport = demo_spoor(args.seed, args.duur, start, stap_s=1.0 / args.fps,
                                    heranker_interval_s=args.heranker, diepte_m=args.diepte)
        print(f'Demo (seed {args.seed}): bewegende camera over {args.duur:g} s bij {args.fps:g}/s')
    else:
        if args.video is None or args.kalibratie is None:
            _fout('videomodus vereist --video én --kalibratie (of oefen met --demo --seed)')
        spoor, rapport = volg_video(args)

    spoor.schrijf(args.uit)
    print(f'{rapport["momenten"]} momenten, {rapport["ankers"]} keer herankerd op de veldlijnen '
          f'over {rapport["duur_s"]:g} s → {args.uit}')
    if rapport.get('gemiddelde_ankerfout_m') is not None:
        print(f'  gemiddelde ankerfout: {rapport["gemiddelde_ankerfout_m"]:g} m')
    if 'fout_mediaan_m' in rapport:
        print(f'  fout op het veld: {rapport["fout_mediaan_m"]:g} m mediaan, '
              f'{rapport["fout_p95_m"]:g} m bij p95')
        print(f'  zónder herankeren zou dat {rapport["fout_mediaan_zonder_ankers_m"]:g} m / '
              f'{rapport["fout_p95_zonder_ankers_m"]:g} m zijn — dát is wat de veldlijnen opleveren')
    if rapport.get('frames_zonder_flow'):
        print(f'  {rapport["frames_zonder_flow"]} frames zonder bruikbare beweging — daar leunt het '
              f'volgen volledig op de volgende herankering')
    print('Gebruik dit bestand met: landing.py --homografie … / tracking.py --homografie …')


if __name__ == '__main__':
    main()
