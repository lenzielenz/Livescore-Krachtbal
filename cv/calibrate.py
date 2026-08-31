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
# Homografie fitten en opslaan
# ---------------------------------------------------------------------------

def fit_homografie(punten: list[dict]) -> list[list[float]]:
    """Fit de homografie beeld(px) → veld(m) op ≥4 puntenparen."""
    cv2 = _laad_cv2()
    import numpy as np  # noqa: PLC0415 — komt mee met opencv-python

    bron = np.array([p['beeld_px'] for p in punten], dtype=np.float64)
    doel = np.array([p['veld_m'] for p in punten], dtype=np.float64)
    matrix, _masker = cv2.findHomography(bron, doel, method=0)
    if matrix is None:
        _fout('cv2.findHomography vond geen oplossing — liggen de punten niet op één lijn?', code=1)
    return [[float(w) for w in rij] for rij in matrix]


def schrijf_kalibratie(
    pad: Path, matrix: list[list[float]], punten: list[dict], diepte: float, beeldpad: Path | None,
    breedte: float = veld.BREEDTE_M, speelveld: float = veld.SPEELVELD_LENGTE_M,
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
    }
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


def draai_kalibratie_180(data: dict) -> dict:
    """Draai een kalibratie 180° in het veldvlak: (x, y) → (B−x, L−y).

    Voor wanneer de verkeerde achterlijn als "thuis" (y=0) gekozen werd: de
    matrix wordt gecomponeerd met de rotatie en elk punt krijgt zijn gedraaide
    veldcoördinaat én label, zodat het bestand consistent blijft en het
    reprojectierapport identiek. Puur stdlib — geen herklikken, geen cv2.
    """
    diepte, speelveld = veldinfo_uit(data)
    lengte = veld.totale_lengte_m(diepte, speelveld)
    b = float((data.get('veld') or {}).get('breedte_m') or veld.BREEDTE_M)
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
    return {**data, 'matrix_beeld_naar_veld': nieuw_h, 'punten': nieuwe_punten}


def veldinfo_uit(data: dict) -> tuple[float, float]:
    """(diepte, speelveld) uit een kalibratiebestand — schrijf_kalibratie zet ze onder 'veld';
    oudere bestanden hadden 'doelgebied_diepte_m' op het hoogste niveau."""
    info = data.get('veld') or {}
    diepte = float(data.get('doelgebied_diepte_m') or info.get('doelgebied_diepte_m')
                   or veld.STANDAARD_DOELGEBIED_DIEPTE_M)
    return diepte, float(info.get('speelveld_m') or veld.SPEELVELD_LENGTE_M)


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
) -> None:
    """Rapporteer per punt de reprojectiefout in pixels (veld → beeld via H⁻¹),
    plus de fout in meters (beeld → veld via H), en het gemiddelde."""
    invers = _inverteer_3x3(matrix)
    print('Reprojectierapport:')
    print(f'  {"kruispunt":28s} {"fout (px)":>10s} {"fout (m)":>9s}')
    fouten_px: list[float] = []
    fouten_m: list[float] = []
    for p in punten:
        px, py = p['beeld_px']
        vx, vy = p['veld_m']
        # veld → beeld: hoe ver ligt de terugprojectie van het aangeklikte pixel?
        tx, ty = _projecteer(invers, vx, vy)
        fout_px = ((tx - px) ** 2 + (ty - py) ** 2) ** 0.5
        # beeld → veld: fout op het veld, in meters
        mx, my = _projecteer(matrix, px, py)
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
    # tussen een bruikbare en een waardeloze meting op de overkant.
    kaart = precisiekaart(matrix, diepte, _rapport_speelveld or veld.SPEELVELD_LENGTE_M)
    if kaart:
        stukken = ' · '.join(f'{naam} {kaart[naam]:.2f}'
                             for naam in ('thuis', 'midden', 'uit') if naam in kaart)
        print(f'  Meters per pixel: {stukken}')
        if kaart.get('slechtste', 0) > 0.25:
            print(f'  LET OP: op het slechtste punt is één pixel {kaart["slechtste"]:.2f} m waard. '
                  f'Daar is een landingspunt hooguit een schatting — een standpunt op de zijlijn '
                  f'(of hoger) meet die kant veel scherper.')


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
    parser.add_argument(
        '--positie', choices=veld.CAMERA_POSITIES, default=None,
        help='camerapositie: beperkt de interactieve kliklijst tot de daar zichtbare, '
             'betrouwbare kruispunten en drukt de conventie af (zie veld.aanbevolen_labels)',
    )
    parser.add_argument(
        '--draai-180', type=Path, default=None, metavar='KALIBRATIE.JSON', dest='draai_180',
        help='draai een bestaande kalibratie 180° in het veldvlak (thuis↔uit, links↔rechts) — '
             'voor wanneer de verkeerde achterlijn als thuis gekozen werd; schrijft naar --uit',
    )
    args = parser.parse_args(argv)

    # 180°-draai van een bestaand bestand: eigen modus, geen cv2 en geen herklikken nodig.
    if args.draai_180 is not None:
        if args.punt or args.beeld is not None or hasattr(args, 'test'):
            parser.error('--draai-180 gaat niet samen met --punt/--beeld/--test — draai ze apart')
        if not args.draai_180.is_file():
            _fout(f'kalibratiebestand niet gevonden: {args.draai_180}')
        data = json.loads(args.draai_180.read_text(encoding='utf-8'))
        gedraaid = draai_kalibratie_180(data)
        args.uit.write_text(json.dumps(gedraaid, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'180° gedraaid (thuis↔uit, links↔rechts) → {args.uit}')
        druk_reprojectierapport(gedraaid['matrix_beeld_naar_veld'], gedraaid['punten'],
                                *veldinfo_uit(gedraaid))
        return

    # --test combineert niet met een nieuwe kalibratie: dat zou stilletjes fitten
    # en wegschrijven terwijl de gebruiker enkel een rapport verwachtte.
    if hasattr(args, 'test') and (args.punt or args.beeld is not None):
        parser.error('--test gaat niet samen met --punt/--beeld — draai ze apart')
    # --test zonder nieuwe punten: rapport van een bestaande kalibratie (geen cv2 nodig)
    alleen_test = hasattr(args, 'test') and not args.punt and args.beeld is None
    if alleen_test:
        pad = args.test if args.test is not None else args.uit
        if not pad.is_file():
            _fout(f'kalibratiebestand niet gevonden: {pad}')
        data = json.loads(pad.read_text(encoding='utf-8'))
        controleer_orientatie(data['matrix_beeld_naar_veld'], data['punten'])
        druk_reprojectierapport(data['matrix_beeld_naar_veld'], data['punten'], *veldinfo_uit(data))
        return

    # Punten verzamelen: headless (--punt) of interactief (--beeld)
    if args.punt:
        labels = veld.kruispunt_per_label(args.diepte, args.breedte, args.speelveld)
        punten = [parse_punt_argument(tekst, labels) for tekst in args.punt]
        dubbel = {p['label'] for p in punten if [q['label'] for q in punten].count(p['label']) > 1}
        if dubbel:
            _fout(f'label(s) meermaals opgegeven: {", ".join(sorted(dubbel))}')
    elif args.beeld is not None:
        punten = verzamel_interactief(args.beeld, args.diepte, positie=args.positie,
                                      breedte=args.breedte, speelveld=args.speelveld)
    else:
        parser.error('geef --beeld (interactief) of minstens vier --punt argumenten (headless)')

    if len(punten) < 4:
        _fout(f'minstens 4 punten nodig voor een homografie, kreeg er {len(punten)}')

    matrix = fit_homografie(punten)
    # Spiegel-detectie vóór het wegschrijven: een gespiegelde kalibratie verziekt élke meting.
    controleer_orientatie(matrix, punten)
    schrijf_kalibratie(args.uit, matrix, punten, args.diepte, args.beeld,
                       breedte=args.breedte, speelveld=args.speelveld)
    druk_reprojectierapport(matrix, punten, args.diepte, args.speelveld)


if __name__ == '__main__':
    main()
