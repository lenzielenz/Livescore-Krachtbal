#!/usr/bin/env python3
"""Waar stond de camera? Het standpunt terugrekenen uit de kalibratie.

Bij het kalibreren duidt de gebruiker aan waar hij stond: midden achter het veld, links
achter, op de zijlijn, in een hoek. Die keuze is geen etiket — ze bepaalt wat er van de meting
te verwachten valt, en ze is **narekenbaar**. Uit de homografie alleen volgt namelijk al waar
de camera stond, in meters, en hoe hoog. Zegt de fit iets heel anders dan wat de gebruiker
koos, dan is er bij het aanduiden iets misgegaan — en dat wil je wéten voor er een uur
gerekend wordt.

De afleiding
------------
De homografie ``H`` brengt beeld → veld (het vlak z=0). Haar inverse ``G = H⁻¹`` brengt veld →
beeld, en voor een camera met interne matrix ``K`` en houding ``[R|t]`` geldt

    G  ∝  K · [r₁  r₂  t]

met r₁, r₂ de eerste twee kolommen van de rotatiematrix. Met de kolommen g₁, g₂, g₃ van G en

    K = [[f, 0, cx], [0, f, cy], [0, 0, 1]]      (vierkante pixels, hoofdpunt in het midden)

is ``K⁻¹gᵢ = ((aᵢ − cx·cᵢ)/f , (bᵢ − cy·cᵢ)/f , cᵢ)``. Noem ``aᵢ' = aᵢ − cx·cᵢ`` en
``bᵢ' = bᵢ − cy·cᵢ``.

Omdat r₁ en r₂ kolommen van een rotatiematrix zijn, staan ze loodrecht op elkaar en zijn ze
even lang. Dat zijn twee vergelijkingen met één onbekende (f), dus twee ONAFHANKELIJKE
schattingen van de brandpuntsafstand:

    r₁ ⟂ r₂        →  (a₁'a₂' + b₁'b₂')/f² + c₁c₂ = 0
                   →  f²  =  −(a₁'a₂' + b₁'b₂') / (c₁c₂)

    ‖r₁‖ = ‖r₂‖    →  (a₁'² + b₁'²)/f² + c₁² = (a₂'² + b₂'²)/f² + c₂²
                   →  f²  =  [(a₁'² + b₁'²) − (a₂'² + b₂'²)] / (c₂² − c₁²)

Allebei juist op papier — maar niet allebei bruikbaar. De eerste deelt door c₁c₂, en bij een
camera die in de lengte van het veld kijkt ligt de x-as van het veld bijna evenwijdig met het
beeldvlak: c₁ ≈ 0, en dan deelt de formule door bijna niets. Nagemeten op een camera achter
het veld met een échte brandpuntsafstand van 1400 px: de loodrechtheidsformule gaf 4336 px,
de gelijke-lengteformule 1400,0.

Daarom wordt f niet uit één van beide gehaald, maar gezocht als de waarde die ze samen het
best waarmaakt. Met hᵢ(f) = K⁻¹gᵢ minimaliseren we

    E(f)  =  ( h₁·h₂ / (‖h₁‖‖h₂‖) )²  +  ( (‖h₁‖² − ‖h₂‖²) / (‖h₁‖² + ‖h₂‖²) )²

Beide termen zijn dimensieloos en genormaliseerd, dus ze wegen even zwaar en de uitkomst hangt
niet af van de schaal van de homografie. E is nul precies wanneer h₁ en h₂ loodrecht én even
lang zijn — wat kolommen van een rotatiematrix per definitie doen. Grof zoeken over een
logaritmisch raster (van fisheye tot lange tele), dan verfijnen met de gulden snede. De
restfout in het minimum is meteen de kwaliteitsmaat: ver boven nul betekent dat deze
homografie niet bij een gewone camera hoort.

Met f bekend volgt de rest:

    λ  = 1 / ‖K⁻¹g₁‖            (schaal; teken zo dat het veld vóór de camera ligt)
    r₁ = λ·K⁻¹g₁ ,  r₂ = λ·K⁻¹g₂ ,  t = λ·K⁻¹g₃ ,  r₃ = r₁ × r₂
    C  = −Rᵀ·t                  (het cameramiddelpunt, in VELDMETERS)

C is meteen leesbaar: hoeveel meter naast/achter het veld, en hoe hoog.

Grenzen
-------
Dit veronderstelt vierkante pixels en het hoofdpunt in het midden van het beeld. Voor een gsm
of actiecam klopt dat goed genoeg om een standpunt te herkennen (meters, niet centimeters);
het is een controle, geen landmeting. Bij een sterk gecropte of gestabiliseerde opname schuift
het hoofdpunt en wordt de schatting navenant slechter — daarom telt vooral het oordeel
"klopt dit met wat je koos", niet de laatste decimaal.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import veld  # noqa: E402
import volg_veld  # noqa: E402

Matrix = list[list[float]]

# Hoe sterk het perspectief minstens moet zijn om een standpunt te durven teruggeven. Gemeten:
# 0,27 gaf 61 m fout, 0,80 gaf een exact standpunt. Zie `camerastandpunt`.
MIN_PERSPECTIEF = 0.15
# Zoveel mag het teruggerekende standpunt schuiven als je één aangeduid punt weglaat, voor we
# er nog iets over durven zeggen. Daarboven is het standpunt niet door de data bepaald.
MAX_WANKEL_M = 1.5


# ---------------------------------------------------------------------------
# De standpunten waaruit gekozen kan worden
# ---------------------------------------------------------------------------

# Rond het veld, met per standpunt waar de camera dan ongeveer hoort te staan. De grenzen zijn
# ruim: het gaat om "klopt dit ongeveer", niet om een landmeting. Coördinaten in veldmeters,
# met x over de breedte (0 = links) en y over de lengte (0 = thuis-achterlijn).
POSITIES: dict[str, dict] = {
    'achter-thuis-midden': {'naam': 'Midden achter de thuislijn', 'kant': 'achter-thuis', 'x': 'midden'},
    'achter-thuis-links': {'naam': 'Links achter de thuislijn', 'kant': 'achter-thuis', 'x': 'links'},
    'achter-thuis-rechts': {'naam': 'Rechts achter de thuislijn', 'kant': 'achter-thuis', 'x': 'rechts'},
    'achter-uit-midden': {'naam': 'Midden achter de uitlijn', 'kant': 'achter-uit', 'x': 'midden'},
    'achter-uit-links': {'naam': 'Links achter de uitlijn', 'kant': 'achter-uit', 'x': 'links'},
    'achter-uit-rechts': {'naam': 'Rechts achter de uitlijn', 'kant': 'achter-uit', 'x': 'rechts'},
    'zijlijn-links-midden': {'naam': 'Midden aan de linkerzijlijn', 'kant': 'zijlijn-links', 'y': 'midden'},
    'zijlijn-links-thuis': {'naam': 'Linkerzijlijn, thuiskant', 'kant': 'zijlijn-links', 'y': 'thuis'},
    'zijlijn-links-uit': {'naam': 'Linkerzijlijn, uitkant', 'kant': 'zijlijn-links', 'y': 'uit'},
    'zijlijn-rechts-midden': {'naam': 'Midden aan de rechterzijlijn', 'kant': 'zijlijn-rechts', 'y': 'midden'},
    'zijlijn-rechts-thuis': {'naam': 'Rechterzijlijn, thuiskant', 'kant': 'zijlijn-rechts', 'y': 'thuis'},
    'zijlijn-rechts-uit': {'naam': 'Rechterzijlijn, uitkant', 'kant': 'zijlijn-rechts', 'y': 'uit'},
    'hoek-thuis-links': {'naam': 'Hoek bij de thuislijn, links', 'kant': 'hoek', 'x': 'links', 'y': 'thuis'},
    'hoek-thuis-rechts': {'naam': 'Hoek bij de thuislijn, rechts', 'kant': 'hoek', 'x': 'rechts', 'y': 'thuis'},
    'hoek-uit-links': {'naam': 'Hoek bij de uitlijn, links', 'kant': 'hoek', 'x': 'links', 'y': 'uit'},
    'hoek-uit-rechts': {'naam': 'Hoek bij de uitlijn, rechts', 'kant': 'hoek', 'x': 'rechts', 'y': 'uit'},
}


def basispositie(positie: str) -> str:
    """Terug naar de vier grondvormen die `veld.aanbevolen_labels` kent."""
    kant = POSITIES[positie]['kant'] if positie in POSITIES else positie
    if kant in ('zijlijn-links', 'zijlijn-rechts'):
        return 'zijlijn'
    if kant in ('achter-thuis', 'achter-uit', 'hoek'):
        return kant
    return 'zijlijn'


def verwacht_gebied(
    positie: str,
    breedte: float = veld.BREEDTE_M,
    lengte: float | None = None,
) -> tuple[tuple[float, float], tuple[float, float]]:
    """Waar hoort de camera te staan bij dit standpunt: ((x_min, x_max), (y_min, y_max)).

    Ruim genomen — een camera "midden achter" staat zelden exact op de as, en de afstand tot
    de lijn varieert van drie meter (langs de omheining) tot dertig (op een tribune).
    """
    lengte = veld.totale_lengte_m() if lengte is None else lengte
    info = POSITIES.get(positie)
    if info is None:
        raise ValueError(f'onbekend standpunt: {positie}')
    kant = info['kant']
    ruim = 60.0  # zo ver mag een camera van het veld af staan

    if kant == 'achter-thuis':
        y = (-ruim, 1.0)
    elif kant == 'achter-uit':
        y = (lengte - 1.0, lengte + ruim)
    elif kant == 'hoek':
        y = (-ruim, 1.0) if info.get('y') == 'thuis' else (lengte - 1.0, lengte + ruim)
    else:  # zijlijn
        plaats = info.get('y', 'midden')
        y = {'thuis': (-2.0, lengte / 2), 'midden': (lengte / 4, 3 * lengte / 4),
             'uit': (lengte / 2, lengte + 2.0)}[plaats]

    if kant == 'zijlijn-links':
        x = (-ruim, 1.0)
    elif kant == 'zijlijn-rechts':
        x = (breedte - 1.0, breedte + ruim)
    elif kant == 'hoek':
        x = (-ruim, 1.0) if info.get('x') == 'links' else (breedte - 1.0, breedte + ruim)
    else:  # achter het veld
        plaats = info.get('x', 'midden')
        x = {'links': (-ruim, breedte / 2), 'midden': (breedte / 4, 3 * breedte / 4),
             'rechts': (breedte / 2, breedte + ruim)}[plaats]
    return x, y


def past_bij(
    positie: str,
    x_m: float,
    y_m: float,
    breedte: float = veld.BREEDTE_M,
    lengte: float | None = None,
) -> bool:
    """Ligt een teruggerekend standpunt binnen wat bij deze keuze hoort?"""
    (x0, x1), (y0, y1) = verwacht_gebied(positie, breedte, lengte)
    return x0 <= x_m <= x1 and y0 <= y_m <= y1


# ---------------------------------------------------------------------------
# Het standpunt terugrekenen (de formules uit de kop)
# ---------------------------------------------------------------------------


def _inverteer(m: Matrix) -> Matrix | None:
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-15:
        return None
    adj = [
        [e * i - f * h, c * h - b * i, b * f - c * e],
        [f * g - d * i, a * i - c * g, c * d - a * f],
        [d * h - e * g, b * g - a * h, a * e - b * d],
    ]
    return [[w / det for w in rij] for rij in adj]


def brandpunt_gesloten_vorm(
    veld_naar_beeld: Matrix, cx: float, cy: float
) -> tuple[float | None, float | None]:
    """De twee gesloten formules uit de kop, als diagnose.

    Ze zijn allebei juist op papier, maar niet allebei even bruikbaar. De loodrechtheid deelt
    door c₁c₂, en bij een camera die in de lengte van het veld kijkt ligt de x-as van het veld
    bijna evenwijdig met het beeldvlak: dan is c₁ ≈ 0 en deelt de formule door bijna niets.
    Nagemeten op een camera achter het veld met een echte brandpuntsafstand van 1400 px gaf de
    loodrechtheidsformule 4336 px en de gelijke-lengteformule 1400,0. Vandaar dat het echte
    antwoord uit `brandpunt_uit_homografie` komt, die beide voorwaarden samen minimaliseert;
    deze functie blijft staan om te kunnen zien hoe elk van de twee zich gedraagt.
    """
    g = veld_naar_beeld
    a = [g[0][0] - cx * g[2][0], g[0][1] - cx * g[2][1]]
    b = [g[1][0] - cy * g[2][0], g[1][1] - cy * g[2][1]]
    c = [g[2][0], g[2][1]]

    loodrecht = None
    if abs(c[0] * c[1]) > 1e-15:
        f2 = -(a[0] * a[1] + b[0] * b[1]) / (c[0] * c[1])
        if f2 > 1.0:
            loodrecht = math.sqrt(f2)

    gelijk = None
    if abs(c[1] ** 2 - c[0] ** 2) > 1e-15:
        f2 = ((a[0] ** 2 + b[0] ** 2) - (a[1] ** 2 + b[1] ** 2)) / (c[1] ** 2 - c[0] ** 2)
        if f2 > 1.0:
            gelijk = math.sqrt(f2)
    return loodrecht, gelijk


def _brandpuntfout(veld_naar_beeld: Matrix, cx: float, cy: float, f: float) -> float:
    """Hoe erg schendt deze brandpuntsafstand de twee voorwaarden? (Dimensieloos, ≥ 0.)

    Beide termen zijn genormaliseerd op de lengtes van h₁ en h₂, zodat ze even zwaar wegen en
    de uitkomst niet afhangt van de schaal van de homografie. Nul betekent: h₁ en h₂ staan
    precies loodrecht én zijn precies even lang — exact wat kolommen van een rotatiematrix doen.
    """
    g = veld_naar_beeld
    h = []
    for j in (0, 1):
        h.append([
            (g[0][j] - cx * g[2][j]) / f,
            (g[1][j] - cy * g[2][j]) / f,
            g[2][j],
        ])
    n1 = sum(w * w for w in h[0])
    n2 = sum(w * w for w in h[1])
    if n1 <= 0 or n2 <= 0:
        return float('inf')
    inproduct = sum(p * q for p, q in zip(h[0], h[1]))
    return (inproduct / math.sqrt(n1 * n2)) ** 2 + ((n1 - n2) / (n1 + n2)) ** 2


def brandpunt_uit_homografie(
    veld_naar_beeld: Matrix, cx: float, cy: float, beeldbreedte: float
) -> tuple[float | None, float]:
    """De brandpuntsafstand (px) die beide voorwaarden het best tegelijk waarmaakt.

    Een zoektocht in plaats van een gesloten formule, en met opzet: de gesloten vormen kunnen
    elk apart door bijna nul delen, terwijl de gecombineerde fout altijd goed gedefinieerd is.
    Eerst grof over een logaritmisch raster (een brandpuntsafstand ligt tussen een fisheye en
    een lange tele), dan verfijnd met de gulden snede.

    Geeft (f, restfout). Een restfout ver boven nul betekent: deze homografie hoort niet bij
    een gewone camera — bijvoorbeeld een verkeerd aangeduid punt, of zware lensvervorming.
    """
    laag, hoog = 0.1 * beeldbreedte, 30.0 * beeldbreedte
    stappen = 400
    beste_f, beste_e = None, float('inf')
    for i in range(stappen + 1):
        f = laag * (hoog / laag) ** (i / stappen)
        e = _brandpuntfout(veld_naar_beeld, cx, cy, f)
        if e < beste_e:
            beste_f, beste_e = f, e
    if beste_f is None:
        return None, float('inf')

    # Verfijnen rond het beste rasterpunt (gulden snede op de logaritmische as).
    span = (hoog / laag) ** (1 / stappen)
    a, b = beste_f / span, beste_f * span
    phi = (math.sqrt(5) - 1) / 2
    for _ in range(60):
        c1 = b - phi * (b - a)
        c2 = a + phi * (b - a)
        if _brandpuntfout(veld_naar_beeld, cx, cy, c1) < _brandpuntfout(veld_naar_beeld, cx, cy, c2):
            b = c2
        else:
            a = c1
    f = (a + b) / 2
    return f, _brandpuntfout(veld_naar_beeld, cx, cy, f)


def perspectiefsterkte(
    veld_naar_beeld: Matrix,
    breedte: float = veld.BREEDTE_M,
    lengte: float | None = None,
) -> float | None:
    """Hoe sterk vertekent dit beeld? Nul = geen perspectief (een landkaart).

    Gemeten aan de noemer w = c₁x + c₂y + c₃ van de projectie: die bepaalt hoeveel iets krimpt
    naarmate het verder ligt. Loopt w over de vier veldhoeken sterk uiteen, dan zit er veel
    perspectief in het beeld; is w overal gelijk, dan is er niets waaruit een standpunt volgt.

    Bewust op de hoeken van het véld gemeten en gedeeld door het gemiddelde: zo hangt het
    getal niet af van waar het assenkruis toevallig ligt of hoe de homografie geschaald is.
    (Een eerdere versie deelde door c₃ en gaf daardoor voor dezelfde opstelling links en rechts
    van het veld een ander cijfer.)
    """
    lengte = veld.totale_lengte_m() if lengte is None else lengte
    c1, c2, c3 = veld_naar_beeld[2]
    ws = [c1 * x + c2 * y + c3 for x in (0.0, breedte) for y in (0.0, lengte)]
    gemiddeld = sum(abs(w) for w in ws) / len(ws)
    if gemiddeld < 1e-15:
        return None
    return (max(ws) - min(ws)) / gemiddeld


def camerastandpunt(
    beeld_naar_veld: Matrix,
    beeldbreedte: float,
    beeldhoogte: float,
    breedte_m: float = veld.BREEDTE_M,
    lengte_m: float | None = None,
) -> dict | None:
    """Waar stond de camera, in veldmeters? Zie de afleiding in de kop van deze module.

    Geeft x_m/y_m (op het veldvlak) en hoogte_m, plus de brandpuntsafstand en hoe goed de twee
    schattingen daarvan overeenkomen — dat laatste is de eerlijke maat voor hoe hard dit is.
    Niets teruggeven is een geldig antwoord: niet elke homografie hoort bij een echte camera.
    """
    lengte_m = veld.totale_lengte_m() if lengte_m is None else lengte_m
    veld_naar_beeld = _inverteer(beeld_naar_veld)
    if veld_naar_beeld is None:
        return None
    cx, cy = beeldbreedte / 2.0, beeldhoogte / 2.0

    # Alles hangt aan het perspectief. Kijkt een camera recht op het veld neer, of staat ze zó
    # ver met zo'n lange lens dat het daarop lijkt, dan is de derde rij van G nagenoeg nul:
    # elke brandpuntsafstand voldoet dan even goed, en hoogte en afstand schuiven evenredig mee.
    #
    # Nagemeten hoe hard dat aankomt (bekende opstelling, exacte punten):
    #   perspectief 2,92 → standpunt exact          (camera achter het veld)
    #   perspectief 0,80 → standpunt exact          (zijlijn, normale lens)
    #   perspectief 0,27 → 61 m ernaast             (zijlijn, lange lens, 4 punten in beeld)
    # Onder MIN_PERSPECTIEF geven we dus niets terug: geen antwoord is hier beter dan een
    # antwoord dat er als een meting uitziet.
    perspectief = perspectiefsterkte(veld_naar_beeld, breedte_m, lengte_m)
    if perspectief is None or perspectief < MIN_PERSPECTIEF:
        return None

    f, restfout = brandpunt_uit_homografie(veld_naar_beeld, cx, cy, beeldbreedte)
    if not f:
        return None
    loodrecht, gelijk = brandpunt_gesloten_vorm(veld_naar_beeld, cx, cy)

    # K⁻¹ toegepast op de drie kolommen.
    g = veld_naar_beeld
    kolommen = []
    for j in range(3):
        kolommen.append([
            (g[0][j] - cx * g[2][j]) / f,
            (g[1][j] - cy * g[2][j]) / f,
            g[2][j],
        ])
    n1 = math.dist((0, 0, 0), kolommen[0])
    n2 = math.dist((0, 0, 0), kolommen[1])
    if n1 < 1e-12 or n2 < 1e-12:
        return None
    lam = 2.0 / (n1 + n2)
    # Het veld ligt vóór de camera: de diepte van de veldoorsprong hoort positief te zijn.
    if kolommen[2][2] < 0:
        lam = -lam
    r1 = [w * lam for w in kolommen[0]]
    r2 = [w * lam for w in kolommen[1]]
    t = [w * lam for w in kolommen[2]]
    r3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]]

    # C = −Rᵀt, met R = [r1 r2 r3] als kolommen: dus rijen van Rᵀ zijn r1, r2, r3.
    centrum = [
        -sum(r * w for r, w in zip(r1, t)),
        -sum(r * w for r, w in zip(r2, t)),
        -sum(r * w for r, w in zip(r3, t)),
    ]
    return {
        'x_m': round(centrum[0], 2),
        'y_m': round(centrum[1], 2),
        'hoogte_m': round(abs(centrum[2]), 2),
        'brandpunt_px': round(f, 1),
        'perspectief': round(perspectief, 3),
        # Hoe goed de homografie bij een gewone camera past: 0 is perfect. Boven ~0,02 is er
        # iets mis met de aangeduide punten (of de lens vervormt te veel voor één homografie).
        'restfout': round(restfout, 5),
        'brandpunt_loodrecht_px': None if loodrecht is None else round(loodrecht, 1),
        'brandpunt_gelijke_lengte_px': None if gelijk is None else round(gelijk, 1),
    }


def stabiliteit(
    punten: list[dict],
    beeldbreedte: float,
    beeldhoogte: float,
    breedte_m: float = veld.BREEDTE_M,
    lengte_m: float | None = None,
) -> float | None:
    """Hoeveel schuift het teruggerekende standpunt als je één aangeduid punt weglaat?

    De eerlijkste maat voor "is dit door de data bepaald". Een homografie kan namelijk perfect
    op alle aangeduide punten passen en tóch bij een heel andere camera horen — gemeten op een
    camera 8 m naast de zijlijn en 2 m hoog: acht punten, reprojectiefout 0,0 px, en de
    ontbinding gaf (0,9 m; 0,2 m hoog) waar de camera echt op (−8 m; 2 m hoog) stond. Daar
    laat de laat-één-punt-weg-proef zich niet door foppen: de fit klapte er zelfs helemaal in
    elkaar.

    Geeft de grootste verschuiving in meters, of None als een deelverzameling geen bruikbare
    homografie meer oplevert (dan is de kalibratie sowieso niet betrouwbaar te ontbinden).
    """
    lengte_m = veld.totale_lengte_m() if lengte_m is None else lengte_m
    if len(punten) < 5:
        return None
    paren = [((p['beeld_px'][0], p['beeld_px'][1]), (p['veld_m'][0], p['veld_m'][1])) for p in punten]
    heel = volg_veld.homografie_uit_paren(paren)
    if heel is None:
        return None
    basis = camerastandpunt(heel, beeldbreedte, beeldhoogte, breedte_m, lengte_m)
    if basis is None:
        return None
    ergste = 0.0
    for i in range(len(paren)):
        deel = volg_veld.homografie_uit_paren(paren[:i] + paren[i + 1:])
        if deel is None:
            return None
        uit = camerastandpunt(deel, beeldbreedte, beeldhoogte, breedte_m, lengte_m)
        if uit is None:
            return None
        ergste = max(ergste, max(abs(uit['x_m'] - basis['x_m']),
                                 abs(uit['y_m'] - basis['y_m']),
                                 abs(uit['hoogte_m'] - basis['hoogte_m'])))
    return round(ergste, 2)


def beoordeel(
    positie: str | None,
    beeld_naar_veld: Matrix,
    beeldbreedte: float,
    beeldhoogte: float,
    breedte: float = veld.BREEDTE_M,
    lengte: float | None = None,
    punten: list[dict] | None = None,
) -> dict:
    """Het teruggerekende standpunt, en of het strookt met wat de gebruiker koos.

    Nadrukkelijk een hulpmiddel, geen rechter. Een kalibratie kan perfect op alle aangeduide
    punten passen en tóch bij een andere camera horen; daarom wordt er alleen geoordeeld als de
    laat-één-punt-weg-proef laat zien dat het standpunt écht door de data bepaald is. Kan dat
    niet, dan is de uitkomst 'onzeker' en blijft de keuze van de gebruiker gewoon staan.
    """
    gemeten = camerastandpunt(beeld_naar_veld, beeldbreedte, beeldhoogte, breedte, lengte)
    uit: dict = {'gemeten': gemeten}
    if gemeten is None:
        uit['oordeel'] = 'onbekend'
        return uit
    # Een camera onder de grond of in de stratosfeer betekent: de fit hoort niet bij een echte
    # opstelling. Dan zegt het cijfer niets, hoe netjes het er ook uitziet.
    if not (0.3 <= gemeten['hoogte_m'] <= 80.0):
        uit['oordeel'] = 'onmogelijk'
        return uit
    if punten is not None:
        wankel = stabiliteit(punten, beeldbreedte, beeldhoogte, breedte, lengte)
        uit['stabiliteit_m'] = wankel
        if wankel is None or wankel > MAX_WANKEL_M:
            uit['oordeel'] = 'onzeker'
            return uit
    if positie is None:
        uit['oordeel'] = 'geen keuze'
        return uit
    uit['oordeel'] = 'klopt' if past_bij(positie, gemeten['x_m'], gemeten['y_m'], breedte, lengte) else 'wijkt af'
    return uit
