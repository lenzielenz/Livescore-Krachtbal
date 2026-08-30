#!/usr/bin/env python3
"""Fase 5: speler-tracking — posities op het veld doorheen de tijd.

Bemonstert de wedstrijdvideo op een lage frequentie, vindt de spelers, zet hun
voetpunt via de homografie om naar veldmeters en rijgt de waarnemingen aaneen
tot sporen. Uitvoer: posities-JSONL, één regel per waarneming:

    {"t": 12.5, "track": 3, "x_m": 6.8, "y_m": 21.4}

Die posities voeden ``heatmap.py`` en ``fysiek.py``. v0.2: twee detectoren die
elkaar aanvullen — HOG (herkent stilstaande mensen, maar mist kleine/verre
figuren) en MOG2-achtergrondsubtractie (vindt álles wat beweegt, dus ook verre
spelers, maar niets dat stilstaat). Standaard draaien ze samen (``--detector
beide``); dubbele waarnemingen worden samengevoegd en flikker-sporen korter dan
``--min-duur`` weggegooid. Wissels van identiteit bij occlusie blijven mogelijk;
``fysiek.py`` vangt dat op (meerdere sporen op één rugnummer tellen op).

VIDEO (vereist opencv + kalibratie van calibrate.py):
    python3 cv/tracking.py --video match.mp4 --kalibratie kalibratie.json \
        --fps 2 --uit posities.jsonl

DEMO (geen video — oefent heatmap.py, reproduceerbaar):
    python3 cv/tracking.py --demo --seed 7 --duur 600 --uit posities.jsonl
    Acht spelers (vier per helft) wandelen als begrensde toevalspaden over het
    veld — genoeg om de heatmap-lus end-to-end te draaien.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import veld  # noqa: E402
from landing import _projecteer, klem_op_veld  # noqa: E402

# Sneller dan dit loopt niemand met een krachtbal in de handen: waarnemingen die een
# grotere sprong vergen horen niet bij hetzelfde spoor.
MAX_SNELHEID_M_S = 8.0
MAX_GAT_S = 2.0  # een spoor zonder waarneming langer dan dit wordt afgesloten


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


# ---------------------------------------------------------------------------
# De koppelaar (puur — getest zonder video)
# ---------------------------------------------------------------------------


class Koppelaar:
    """Rijgt losse waarnemingen aaneen tot sporen (dichtstbijzijnde buur).

    Per tijdstap: koppel elke waarneming aan het dichtstbijzijnde open spoor
    binnen de snelheidslimiet (dichtstbijzijnde paar eerst, één-op-één); wat
    overblijft start een nieuw spoor. Sporen die te lang niets zagen, sluiten.
    """

    def __init__(self, max_snelheid: float = MAX_SNELHEID_M_S, max_gat: float = MAX_GAT_S) -> None:
        self.max_snelheid = max_snelheid
        self.max_gat = max_gat
        self.volgende_id = 1
        self.open: dict[int, tuple[float, float, float]] = {}  # id → (t, x, y)

    def stap(self, t: float, punten: list[tuple[float, float]]) -> list[tuple[int, float, float]]:
        # Verlopen sporen sluiten.
        self.open = {tid: w for tid, w in self.open.items() if t - w[0] <= self.max_gat}

        paren: list[tuple[float, int, int]] = []
        for tid, (t0, x0, y0) in self.open.items():
            dt = max(1e-6, t - t0)
            for pi, (x, y) in enumerate(punten):
                afstand = ((x - x0) ** 2 + (y - y0) ** 2) ** 0.5
                if afstand / dt <= self.max_snelheid:
                    paren.append((afstand, tid, pi))
        paren.sort()
        spoor_vrij = set(self.open)
        punt_vrij = set(range(len(punten)))
        uit: list[tuple[int, float, float]] = []
        for _, tid, pi in paren:
            if tid in spoor_vrij and pi in punt_vrij:
                spoor_vrij.discard(tid)
                punt_vrij.discard(pi)
                x, y = punten[pi]
                self.open[tid] = (t, x, y)
                uit.append((tid, x, y))
        for pi in sorted(punt_vrij):
            x, y = punten[pi]
            tid = self.volgende_id
            self.volgende_id += 1
            self.open[tid] = (t, x, y)
            uit.append((tid, x, y))
        return uit


# ---------------------------------------------------------------------------
# Waarnemingen opschonen (puur — getest zonder video)
# ---------------------------------------------------------------------------


def bemonster_duur(frame_count: float, fps: float) -> float:
    """Bovengrens voor de bemonsteringslus, uit de video-metadata.

    Niet elke container kent zijn framecount (webm en geremuxte streams geven 0):
    dan is er geen bruikbare bovengrens en lezen we tot cap.read() faalt — anders
    zou de lus na één frame stoppen en bleef de tracking leeg.
    """
    if frame_count <= 0 or fps <= 0:
        return float('inf')
    return frame_count / fps


def dedupliceer(punten: list[tuple[float, float]], min_afstand_m: float = 0.8) -> list[tuple[float, float]]:
    """Voeg waarnemingen samen die dichter bij elkaar liggen dan één speler breed is.

    HOG en MOG2 zien vaak dezelfde speler allebei; twee punten op < min_afstand
    zijn één persoon. Greedy op volgorde — goed genoeg op speler-afstanden.
    """
    uit: list[tuple[float, float]] = []
    for x, y in punten:
        if all(((x - ux) ** 2 + (y - uy) ** 2) ** 0.5 >= min_afstand_m for ux, uy in uit):
            uit.append((x, y))
    return uit


def filter_korte_sporen(rijen: list[dict], min_duur_s: float) -> list[dict]:
    """Gooi flikker-sporen weg: een spoor dat korter leeft dan min_duur is ruis
    (een schaduw, een vlag, een dubbele detectie), geen speler."""
    if min_duur_s <= 0:
        return rijen
    bereik: dict[int, tuple[float, float]] = {}
    for r in rijen:
        t, track = float(r['t']), int(r['track'])
        t0, t1 = bereik.get(track, (t, t))
        bereik[track] = (min(t0, t), max(t1, t))
    goed = {track for track, (t0, t1) in bereik.items() if t1 - t0 >= min_duur_s}
    return [r for r in rijen if int(r['track']) in goed]


# ---------------------------------------------------------------------------
# Demo: toevalspaden over het veld
# ---------------------------------------------------------------------------


def demo_posities(
    seed: int,
    duur_s: float,
    diepte_m: float,
    stap_s: float = 0.5,
    breedte_m: float = veld.BREEDTE_M,
    speelveld_m: float = veld.SPEELVELD_LENGTE_M,
) -> list[dict]:
    """Acht begrensde toevalspaden (vier per helft) — voer voor heatmap.py."""
    rng = random.Random(seed)
    lengte = veld.totale_lengte_m(diepte_m, speelveld_m)
    spelers = []
    for i in range(8):
        # Elke ploeg blijft grotendeels op de eigen helft, zoals in het echte spel.
        eigen_helft = i < 4
        y0 = rng.uniform(lengte * 0.1, lengte * 0.45) if eigen_helft else rng.uniform(lengte * 0.55, lengte * 0.9)
        spelers.append([rng.uniform(2.0, breedte_m - 2.0), y0])
    rijen: list[dict] = []
    t = 0.0
    while t <= duur_s:
        for track, pos in enumerate(spelers, start=1):
            pos[0] += rng.gauss(0.0, 0.6)
            pos[1] += rng.gauss(0.0, 0.6)
            pos[0], pos[1] = klem_op_veld(pos[0], pos[1], diepte_m, breedte_m, speelveld_m)
            rijen.append({'t': round(t, 2), 'track': track, 'x_m': round(pos[0], 2), 'y_m': round(pos[1], 2)})
        t += stap_s
    return rijen


# ---------------------------------------------------------------------------
# Video: HOG-detectie → voetpunt → veldmeters → sporen
# ---------------------------------------------------------------------------


def video_posities(args: argparse.Namespace) -> list[dict]:
    try:
        import cv2  # noqa: PLC0415
    except ImportError:
        _fout(
            'opencv ontbreekt — installeer met: pip install -r cv/requirements.txt '
            '(of oefen de heatmap-lus zonder video via --demo)'
        )
    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')
    if not args.kalibratie.is_file():
        _fout(f'kalibratiebestand niet gevonden: {args.kalibratie} (maak het met cv/calibrate.py)')
    kalibratie = json.loads(args.kalibratie.read_text(encoding='utf-8'))
    matrix = kalibratie['matrix_beeld_naar_veld']
    veld_info = kalibratie.get('veld') or {}
    diepte = float(kalibratie.get('doelgebied_diepte_m') or veld_info.get('doelgebied_diepte_m') or args.diepte)
    breedte = float(veld_info.get('breedte_m') or veld.BREEDTE_M)
    speelveld = float(veld_info.get('speelveld_m') or veld.SPEELVELD_LENGTE_M)
    lengte = veld.totale_lengte_m(diepte, speelveld)

    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        _fout(f'video kan niet geopend worden: {args.video}')
    hog = None
    if args.detector in ('hog', 'beide'):
        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    # MOG2 leert de achtergrond al kijkend; detectShadows uit, anders worden
    # schaduwen op het gras aparte "spelers".
    mog2 = cv2.createBackgroundSubtractorMOG2(history=200, detectShadows=False) if args.detector in ('mog2', 'beide') else None

    koppelaar = Koppelaar()
    rijen: list[dict] = []
    # De échte stopvoorwaarde is cap.read(); de metadata-duur is enkel een bovengrens
    # wanneer de container ze kent (zie bemonster_duur).
    duur = bemonster_duur(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0, cap.get(cv2.CAP_PROP_FPS) or 0.0)
    t = 0.0
    while t <= duur:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            break
        voeten: list[tuple[float, float]] = []
        if hog is not None:
            vakken, _ = hog.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)
            # Het voetpunt (onderkant-midden van het kader) staat óp de grond: alleen dat punt
            # mag door de grondvlak-homografie — het hoofd projecteren zou meters schelen.
            voeten += [(float(x + b / 2), float(y + h)) for x, y, b, h in vakken]
        if mog2 is not None:
            masker = mog2.apply(frame)
            masker = cv2.morphologyEx(masker, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
            contouren, _ = cv2.findContours(masker, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contouren:
                x, y, b, h = cv2.boundingRect(c)
                # Een speler is hoger dan breed en niet minuscuul; de rest is bal, vlag of ruis.
                if cv2.contourArea(c) >= args.mog2_min_px and h > b * 0.8:
                    voeten.append((float(x + b / 2), float(y + h)))
        punten: list[tuple[float, float]] = []
        for bx, by in voeten:
            vx, vy = _projecteer(matrix, bx, by)
            if vx != vx or vy != vy:
                continue
            # Buiten het veld (publiek, kantine) telt niet mee.
            if -1.0 <= vx <= breedte + 1.0 and -1.0 <= vy <= lengte + 1.0:
                px, py = klem_op_veld(vx, vy, diepte, breedte, speelveld)
                punten.append((px, py))
        for track, x_m, y_m in koppelaar.stap(t, dedupliceer(punten)):
            rijen.append({'t': round(t, 2), 'track': track, 'x_m': round(x_m, 2), 'y_m': round(y_m, 2)})
        t += 1.0 / args.fps
    cap.release()
    return rijen


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Fase 5: speler-posities op het veld doorheen de tijd (voer voor heatmap.py).'
    )
    parser.add_argument('--uit', type=Path, required=True, help='uitvoerbestand (posities-JSONL)')
    parser.add_argument('--diepte', type=float, default=veld.STANDAARD_DOELGEBIED_DIEPTE_M,
                        help='doelgebied-diepte in meters (standaard 10)')
    # videomodus
    parser.add_argument('--video', type=Path, default=None, help='wedstrijdvideo (videomodus)')
    parser.add_argument('--kalibratie', type=Path, default=None, help='kalibratie-JSON van calibrate.py')
    parser.add_argument('--fps', type=float, default=2.0, help='bemonsteringsfrequentie (standaard 2/s)')
    parser.add_argument('--detector', choices=('hog', 'mog2', 'beide'), default='beide',
                        help='persoonsdetectie: HOG (stilstaand), MOG2-beweging (ver/klein) of beide (standaard)')
    parser.add_argument('--mog2-min-px', type=int, default=150,
                        help='minimale contourgrootte in pixels voor een MOG2-detectie (standaard 150)')
    parser.add_argument('--min-duur', type=float, default=3.0,
                        help='sporen korter dan dit (s) zijn ruis en worden weggegooid (standaard 3; 0 = alles houden)')
    # demomodus
    parser.add_argument('--demo', action='store_true', help='oefenmodus zonder video (vereist --seed)')
    parser.add_argument('--seed', type=int, default=None, help='reproduceerbare toevalspaden')
    parser.add_argument('--duur', type=float, default=600.0, help='demolengte in seconden (standaard 600)')
    parser.add_argument('--breedte', type=float, default=None,
                        help='opgemeten veldbreedte in meters (demo; standaard reglementair 14)')
    parser.add_argument('--speelveld', type=float, default=None,
                        help='opgemeten speelveldlengte in meters (demo; standaard reglementair 26)')
    args = parser.parse_args(argv)

    if args.demo and args.video is not None:
        parser.error('--demo gaat niet samen met --video — kies één modus')
    if args.demo:
        if args.seed is None:
            _fout('--demo vereist --seed (reproduceerbaarheid is de hele bedoeling)')
        if args.duur <= 0:
            _fout('--duur moet groter zijn dan 0')
        rijen = demo_posities(args.seed, args.duur, args.diepte,
                              breedte_m=args.breedte or veld.BREEDTE_M,
                              speelveld_m=args.speelveld or veld.SPEELVELD_LENGTE_M)
        print(f'Demo (seed {args.seed}): 8 sporen over {args.duur:g} s → {len(rijen)} posities')
    else:
        if args.video is None or args.kalibratie is None:
            _fout('videomodus vereist --video én --kalibratie (of gebruik --demo)')
        if args.fps <= 0:
            _fout('--fps moet groter zijn dan 0')
        rijen = video_posities(args)
        ruw = len({r['track'] for r in rijen})
        rijen = filter_korte_sporen(rijen, args.min_duur)
        sporen = len({r['track'] for r in rijen})
        print(
            f'{len(rijen)} posities in {sporen} sporen ({ruw - sporen} flikker-sporen < {args.min_duur:g} s '
            f'weggefilterd) → wijs de sporen toe met fysiek.py --sjabloon; identiteitswissels bij '
            f'occlusie tellen daar gewoon op bij dezelfde speler'
        )

    with args.uit.open('w', encoding='utf-8') as f:
        for rij in rijen:
            f.write(json.dumps(rij, ensure_ascii=False) + '\n')
    print(f'→ {args.uit}')


if __name__ == '__main__':
    main()
