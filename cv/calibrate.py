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


def verzamel_interactief(beeldpad: Path, diepte: float) -> list[dict]:
    """Interactieve modus: klik de genummerde kruispunten aan in een OpenCV-venster."""
    cv2 = _laad_cv2()
    beeld = cv2.imread(str(beeldpad))
    if beeld is None:
        _fout(f'kon beeld niet lezen: {beeldpad}')

    doelen = veld.kruispunten(diepte)
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
) -> None:
    data = {
        'versie': 1,
        'aangemaakt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'beeld': {'pad': str(beeldpad) if beeldpad else None},
        'veld': {
            'doelgebied_diepte_m': diepte,
            'breedte_m': veld.BREEDTE_M,
            'totale_lengte_m': veld.totale_lengte_m(diepte),
        },
        'punten': punten,
        'matrix_beeld_naar_veld': matrix,
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


def druk_reprojectierapport(matrix: list[list[float]], punten: list[dict]) -> None:
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
        '--uit', type=Path, default=Path('kalibratie.json'),
        help='uitvoerbestand voor de kalibratie-JSON (standaard kalibratie.json)',
    )
    parser.add_argument(
        '--test', type=Path, nargs='?', const=None, default=argparse.SUPPRESS,
        metavar='KALIBRATIE.JSON',
        help='druk enkel het reprojectiefout-rapport af (van dit bestand, of van --uit)',
    )
    args = parser.parse_args(argv)

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
        druk_reprojectierapport(data['matrix_beeld_naar_veld'], data['punten'])
        return

    # Punten verzamelen: headless (--punt) of interactief (--beeld)
    if args.punt:
        labels = veld.kruispunt_per_label(args.diepte)
        punten = [parse_punt_argument(tekst, labels) for tekst in args.punt]
        dubbel = {p['label'] for p in punten if [q['label'] for q in punten].count(p['label']) > 1}
        if dubbel:
            _fout(f'label(s) meermaals opgegeven: {", ".join(sorted(dubbel))}')
    elif args.beeld is not None:
        punten = verzamel_interactief(args.beeld, args.diepte)
    else:
        parser.error('geef --beeld (interactief) of minstens vier --punt argumenten (headless)')

    if len(punten) < 4:
        _fout(f'minstens 4 punten nodig voor een homografie, kreeg er {len(punten)}')

    matrix = fit_homografie(punten)
    schrijf_kalibratie(args.uit, matrix, punten, args.diepte, args.beeld)
    druk_reprojectierapport(matrix, punten)


if __name__ == '__main__':
    main()
