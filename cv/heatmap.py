#!/usr/bin/env python3
"""Fase 5: heatmaps — waar op het veld speelt zich het spel af?

Zet de posities-JSONL van ``tracking.py`` om naar een raster over het veld:
hoeveel tijd werd er in elke cel doorgebracht. Uitvoer is altijd een
JSON-raster (puur stdlib, overal bruikbaar); met opencv erbij komt er ook een
PNG met een kleurenverloop en de veldlijnen eroverheen.

    # Alles samen:
    python3 cv/heatmap.py --posities posities.jsonl --uit heatmap.json --png heatmap.png

    # Eén spoor (bv. track 3 uit tracking.py):
    python3 cv/heatmap.py --posities posities.jsonl --track 3 --uit spoor3.json

Het JSON-raster: {"cel_m": 0.5, "breedte": 28, "lengte": 92, "max": 1.0,
"raster": [[…rij per lengte-cel…]]} — genormaliseerd op de drukste cel, zodat
elke weergave (PNG, later de analysepagina) dezelfde schaal hanteert.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import veld  # noqa: E402

CEL_M = 0.5


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


def lees_posities(pad: Path) -> list[dict]:
    rijen = []
    for nummer, regel in enumerate(pad.read_text(encoding='utf-8').splitlines(), start=1):
        regel = regel.strip()
        if not regel:
            continue
        try:
            rij = json.loads(regel)
        except json.JSONDecodeError as e:
            _fout(f'{pad}:{nummer}: ongeldige JSON ({e})')
        if not isinstance(rij.get('x_m'), (int, float)) or not isinstance(rij.get('y_m'), (int, float)):
            _fout(f'{pad}:{nummer}: positie mist numerieke x_m/y_m')
        rijen.append(rij)
    return rijen


def bouw_raster(
    posities: list[dict],
    diepte_m: float,
    cel_m: float = CEL_M,
    track: int | None = None,
) -> dict:
    """Tel de posities per veldcel en normaliseer op de drukste cel.

    Cellen zijn [i·cel, (i+1)·cel); een punt exact op de buitenrand van het
    veld valt in de laatste cel (niet erbuiten) — het veld is inclusief.
    """
    lengte = veld.totale_lengte_m(diepte_m)
    nx = max(1, round(veld.BREEDTE_M / cel_m))
    ny = max(1, round(lengte / cel_m))
    raster = [[0 for _ in range(nx)] for _ in range(ny)]
    geteld = 0
    for rij in posities:
        if track is not None and rij.get('track') != track:
            continue
        x, y = float(rij['x_m']), float(rij['y_m'])
        if not (0.0 <= x <= veld.BREEDTE_M and 0.0 <= y <= lengte):
            continue
        ix = min(nx - 1, int(x / cel_m))
        iy = min(ny - 1, int(y / cel_m))
        raster[iy][ix] += 1
        geteld += 1
    piek = max((maxi for r in raster for maxi in r), default=0)
    genormaliseerd = [[(c / piek if piek else 0.0) for c in r] for r in raster]
    return {
        'cel_m': cel_m,
        'breedte': nx,
        'lengte': ny,
        'posities': geteld,
        'piek': piek,
        'raster': [[round(c, 4) for c in r] for r in genormaliseerd],
    }


def schrijf_png(raster: dict, diepte_m: float, pad: Path) -> None:
    """PNG met kleurenverloop + veldlijnen — vereist opencv (anders nette melding)."""
    try:
        import cv2  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
    except ImportError:
        _fout('PNG-uitvoer vereist opencv — installeer met: pip install -r cv/requirements.txt (het JSON-raster staat er wél)')
    schaal = 12  # pixels per cel → 28×92 cellen ≈ 336×1104 px
    grijs = (np.array(raster['raster'], dtype=np.float32) * 255).astype(np.uint8)
    beeld = cv2.applyColorMap(cv2.resize(grijs, (raster['breedte'] * schaal, raster['lengte'] * schaal), interpolation=cv2.INTER_CUBIC), cv2.COLORMAP_TURBO)

    # Veldlijnen erover: doellijnen, vrijeworplijnen en de middellijn (wit, dun).
    lengte = veld.totale_lengte_m(diepte_m)
    hoogte_px = raster['lengte'] * schaal
    breedte_px = raster['breedte'] * schaal
    for y_m in (
        diepte_m, diepte_m + veld.VRIJEWORP_OFFSET_M, lengte / 2,
        lengte - diepte_m - veld.VRIJEWORP_OFFSET_M, lengte - diepte_m,
    ):
        py = int(y_m / lengte * hoogte_px)
        cv2.line(beeld, (0, py), (breedte_px, py), (255, 255, 255), 1)
    cv2.rectangle(beeld, (0, 0), (breedte_px - 1, hoogte_px - 1), (255, 255, 255), 2)
    if not cv2.imwrite(str(pad), beeld):
        _fout(f'PNG wegschrijven mislukt: {pad}')


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Fase 5: heatmap-raster (JSON, optioneel PNG) uit posities-JSONL.'
    )
    parser.add_argument('--posities', type=Path, required=True, help='posities-JSONL van tracking.py')
    parser.add_argument('--uit', type=Path, required=True, help='uitvoerbestand (JSON-raster)')
    parser.add_argument('--png', type=Path, default=None, help='ook een PNG-weergave (vereist opencv)')
    parser.add_argument('--track', type=int, default=None, help='enkel dit spoor (standaard: alles)')
    parser.add_argument('--cel', type=float, default=CEL_M, help='celgrootte in meters (standaard 0,5)')
    parser.add_argument('--diepte', type=float, default=veld.STANDAARD_DOELGEBIED_DIEPTE_M,
                        help='doelgebied-diepte in meters (standaard 10)')
    args = parser.parse_args(argv)

    if not args.posities.is_file():
        _fout(f'positiesbestand niet gevonden: {args.posities}')
    if args.cel <= 0:
        _fout('--cel moet groter zijn dan 0')
    posities = lees_posities(args.posities)
    if not posities:
        _fout(f'{args.posities} bevat geen posities')

    raster = bouw_raster(posities, args.diepte, cel_m=args.cel, track=args.track)
    if raster['posities'] == 0:
        _fout('geen posities over na filtering (verkeerde --track, of alles buiten het veld?)')
    args.uit.write_text(json.dumps(raster, ensure_ascii=False) + '\n', encoding='utf-8')
    print(
        f'{raster["posities"]} posities → raster {raster["breedte"]}×{raster["lengte"]} '
        f'(cel {args.cel:g} m, piek {raster["piek"]}) → {args.uit}'
    )
    if args.png is not None:
        schrijf_png(raster, args.diepte, args.png)
        print(f'PNG → {args.png}')


if __name__ == '__main__':
    main()
