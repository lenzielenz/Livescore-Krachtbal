#!/usr/bin/env python3
"""Controle-overlay: zie met eigen ogen wat het systeem trackt.

Cijfers in een rapport zeggen niet of de meting klópt. Deze module legt over de
wedstrijdvideo wat de pijplijn denkt te zien, zodat je het in één oogopslag kunt
beoordelen:

* **het veldmodel** — waar het systeem de lijnen verwacht, geprojecteerd met de
  homografie van dát moment. Vallen die samen met de echte krijtlijnen, dan klopt
  de kalibratie; schuiven ze weg, dan zie je precies wanneer en hoeveel.
* **de gedetecteerde lijnstukken** — wat de lijndetector werkelijk vond. Het
  verschil met het model is de correctie die de herankering moet maken.
* **het balspoor** — van het punt waar de bal losgelaten wordt tot waar hij de
  grond raakt, met beide punten gemarkeerd.
* **de spelersposities** uit de tracking, en een statusregel met tijd, herkomst
  van de homografie (gevolgd of herankerd) en de gemeten afwijking.

    python3 cv/overlay.py --video match.mp4 --homografie homografie.jsonl \\
        --balspoor balspoor.jsonl --posities posities.jsonl --uit controle.mp4

Bij een vaste camera geef je in plaats van --homografie gewoon --kalibratie mee.
Met --tot beperk je de uitvoer tot de eerste seconden — handig om snel te kijken
of het klopt voor je een hele helft laat renderen.

De geometrie hieronder (wat waar getekend wordt, en wat buiten beeld valt) is
pure stdlib en apart getest; alleen het inlezen en wegschrijven van beeld vraagt
opencv.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import veld  # noqa: E402
from volg_veld import (  # noqa: E402
    HomografieSpoor,
    Matrix,
    inverteer,
    normaliseer,
    projecteer,
    veldlijnen,
)

# Kleuren in BGR (zoals opencv ze wil), gekozen om op gras te blijven opvallen.
KLEUR_MODEL = (60, 240, 60)       # veldmodel: fel groen
KLEUR_GEDETECTEERD = (255, 190, 0)  # gevonden lijnstukken: cyaanblauw
KLEUR_BAL = (60, 60, 255)         # balspoor: rood
KLEUR_LOS = (0, 200, 255)         # loslaatpunt: oranje
KLEUR_LANDING = (255, 255, 255)   # landingspunt: wit
KLEUR_SPELER = (230, 130, 255)    # spelers: roze
KLEUR_WAARSCHUWING = (0, 0, 255)

# Alle tekst die IN het beeld gebrand wordt, moet ASCII zijn: het lettertype van opencv
# (Hershey) kent geen accenten of typografische tekens en tekent er '??' voor in de plaats.
LEGENDE = 'groen = veldmodel | blauw = gevonden lijnen | rood = bal | roze = spelers'


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


def lees_jsonl(pad: Path) -> list[dict]:
    rijen = []
    with pad.open(encoding='utf-8') as f:
        for regel in f:
            regel = regel.strip()
            if regel:
                rijen.append(json.loads(regel))
    return rijen


# ---------------------------------------------------------------------------
# Wat er getekend moet worden (puur — getest zonder video)
# ---------------------------------------------------------------------------


def knip_op_beeld(
    p0: tuple[float, float],
    p1: tuple[float, float],
    breedte: int,
    hoogte: int,
    marge: int = 40,
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """Knip een lijnstuk op het beeldkader (Liang-Barsky).

    Een veldlijn loopt vaak door tot ver buiten beeld; die punten mogen niet naar
    de tekenroutine, anders krijg je enorme coördinaten en trage of foute uitvoer.
    Geeft None wanneer het segment volledig buiten beeld valt.
    """
    xmin, ymin = -marge, -marge
    xmax, ymax = breedte + marge, hoogte + marge
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, p0[0] - xmin), (dx, xmax - p0[0]), (-dy, p0[1] - ymin), (dy, ymax - p0[1])):
        if abs(p) < 1e-12:
            if q < 0:
                return None  # evenwijdig en buiten
            continue
        r = q / p
        if p < 0:
            if r > t1:
                return None
            t0 = max(t0, r)
        else:
            if r < t0:
                return None
            t1 = min(t1, r)
    if t0 > t1:
        return None
    return ((p0[0] + t0 * dx, p0[1] + t0 * dy), (p0[0] + t1 * dx, p0[1] + t1 * dy))


def veldmodel_in_beeld(
    m: Matrix,
    breedte: int,
    hoogte: int,
    diepte_m: float = veld.STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte_m: float = veld.BREEDTE_M,
    speelveld_m: float = veld.SPEELVELD_LENGTE_M,
) -> list[tuple[str, tuple[float, float], tuple[float, float]]]:
    """De veldlijnen zoals ze met deze matrix in beeld liggen, geknipt op het kader.

    Dit is de kern van de controle: valt dit groene rooster samen met de échte
    krijtlijnen in het beeld, dan meet de pijplijn op de juiste plek.
    """
    try:
        naar_beeld = inverteer(m)
    except ValueError:
        return []
    uit: list[tuple[str, tuple[float, float], tuple[float, float]]] = []
    for naam, a, b in veldlijnen(diepte_m, breedte_m, speelveld_m):
        p0 = projecteer(naar_beeld, *a)
        p1 = projecteer(naar_beeld, *b)
        if p0[0] != p0[0] or p1[0] != p1[0]:
            continue
        geknipt = knip_op_beeld(p0, p1, breedte, hoogte)
        if geknipt is not None:
            uit.append((naam, geknipt[0], geknipt[1]))
    return uit


def balspoor_op_moment(
    sporen: list[dict], t: float, venster_s: float = 6.0,
) -> tuple[list[tuple[float, float]], tuple[float, float] | None, tuple[float, float] | None]:
    """Het balspoor dat op dit moment getoond wordt: (punten, loslaatpunt, landing).

    Alleen worpen waarvan het venster nog loopt: de bal van tien worpen geleden
    hoort niet meer in beeld te hangen.
    """
    for worp in sporen:
        start = float(worp['video_time_s'])
        if not (start - 0.5 <= t <= start + venster_s):
            continue
        punten = [(float(p[1]), float(p[2])) for p in worp.get('spoor', []) if float(p[0]) <= t]
        if not punten:
            continue
        los = tuple(worp['los_px']) if worp.get('los_px') else None
        landing = None
        if worp.get('landing_px') and worp.get('landing_t') is not None and t >= float(worp['landing_t']):
            landing = tuple(worp['landing_px'])
        return punten, los, landing  # type: ignore[return-value]
    return [], None, None


def posities_op_moment(
    posities: list[dict], m: Matrix, t: float, venster_s: float = 0.4,
) -> list[tuple[int, tuple[float, float]]]:
    """Spelersposities (veldmeters) van rond dit moment, terug in beeldpixels."""
    try:
        naar_beeld = inverteer(m)
    except ValueError:
        return []
    uit: list[tuple[int, tuple[float, float]]] = []
    for rij in posities:
        if abs(float(rij['t']) - t) > venster_s:
            continue
        px, py = projecteer(naar_beeld, float(rij['x_m']), float(rij['y_m']))
        if px == px and py == py:
            uit.append((int(rij['track']), (px, py)))
    return uit


def statusregel(t: float, moment: dict | None) -> str:
    """De regel linksboven: waar staan we, en hoe zeker is de stand van het veld."""
    klok = f'{int(t) // 60}:{t % 60:04.1f}'
    if moment is None:
        return f'{klok}  GEEN VELDSTAND - hier wordt niets gemeten'
    bron = {'lijnen': 'herankerd op de veldlijnen', 'flow': 'gevolgd', 'kalibratie': 'kalibratie',
            'ijkbeeld': 'aangeduid ijkbeeld', 'teruggerekend': 'teruggerekend naar het ijkbeeld',
            'gladgestreken': 'gladgestreken tussen twee ijkpunten'}.get(
        str(moment.get('bron')), str(moment.get('bron'))
    )
    fout = moment.get('fout_m')
    staart = f' | afwijking {fout:.2f} m' if isinstance(fout, (int, float)) else ''
    return f'{klok}  veldstand: {bron}{staart}'


# ---------------------------------------------------------------------------
# Tekenen (opencv)
# ---------------------------------------------------------------------------


def _laad_cv2():
    try:
        import cv2  # noqa: PLC0415
        return cv2
    except ImportError:
        _fout('opencv ontbreekt — installeer met: pip install -r cv/requirements.txt')


def _teken_frame(cv2, frame, breedte: int, hoogte: int, gegevens: dict) -> None:
    """Alles over één frame heen. Volgorde is bewust: veld onderaan, bal bovenop."""
    # Veldmodel: waar het systeem de lijnen verwacht.
    for naam, p0, p1 in gegevens['model']:
        dik = 3 if naam in ('middellijn', 'doellijn_thuis', 'doellijn_uit') else 2
        cv2.line(frame, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])), KLEUR_MODEL, dik, cv2.LINE_AA)

    # Wat de lijndetector werkelijk vond (dun, zodat het model leesbaar blijft).
    for p0, p1 in gegevens.get('gedetecteerd', []):
        cv2.line(frame, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])), KLEUR_GEDETECTEERD, 1, cv2.LINE_AA)

    # Spelers.
    for track, (px, py) in gegevens.get('spelers', []):
        cv2.circle(frame, (int(px), int(py)), 7, KLEUR_SPELER, 2, cv2.LINE_AA)
        cv2.putText(frame, str(track), (int(px) + 9, int(py) - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, KLEUR_SPELER, 1, cv2.LINE_AA)

    # Balspoor: de lijn die de bal aflegde, met loslaat- en landingspunt.
    spoor = gegevens.get('bal', [])
    for i in range(1, len(spoor)):
        cv2.line(frame, (int(spoor[i - 1][0]), int(spoor[i - 1][1])),
                 (int(spoor[i][0]), int(spoor[i][1])), KLEUR_BAL, 2, cv2.LINE_AA)
    if spoor:
        cv2.circle(frame, (int(spoor[-1][0]), int(spoor[-1][1])), 6, KLEUR_BAL, -1, cv2.LINE_AA)
    if gegevens.get('los'):
        lx, ly = gegevens['los']
        cv2.circle(frame, (int(lx), int(ly)), 10, KLEUR_LOS, 2, cv2.LINE_AA)
        cv2.putText(frame, 'los', (int(lx) + 12, int(ly)), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    KLEUR_LOS, 1, cv2.LINE_AA)
    if gegevens.get('landing'):
        gx, gy = gegevens['landing']
        cv2.drawMarker(frame, (int(gx), int(gy)), KLEUR_LANDING, cv2.MARKER_TILTED_CROSS, 22, 2, cv2.LINE_AA)
        cv2.putText(frame, 'grond', (int(gx) + 12, int(gy)), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    KLEUR_LANDING, 1, cv2.LINE_AA)

    # Statusbalk linksboven, op een donkere strook zodat ze op elk beeld leesbaar is.
    tekst = gegevens['status']
    kleur = KLEUR_WAARSCHUWING if 'GEEN VELDSTAND' in tekst else (255, 255, 255)
    cv2.rectangle(frame, (0, 0), (breedte, 34), (0, 0, 0), -1)
    cv2.putText(frame, tekst, (10, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.6, kleur, 1, cv2.LINE_AA)
    cv2.rectangle(frame, (0, hoogte - 26), (breedte, hoogte), (0, 0, 0), -1)
    cv2.putText(frame, LEGENDE, (10, hoogte - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                (200, 200, 200), 1, cv2.LINE_AA)


def maak_overlay(args: argparse.Namespace) -> dict:
    cv2 = _laad_cv2()
    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')

    spoor = None
    vaste_matrix = None
    diepte = args.diepte
    breedte_m, speelveld_m = veld.BREEDTE_M, veld.SPEELVELD_LENGTE_M
    if args.homografie is not None:
        if not args.homografie.is_file():
            _fout(f'homografiebestand niet gevonden: {args.homografie} (maak het met cv/volg_veld.py)')
        spoor = HomografieSpoor.lees(args.homografie)
        if not spoor.punten:
            _fout(f'{args.homografie} bevat geen momenten')
    if args.kalibratie is not None:
        if not args.kalibratie.is_file():
            _fout(f'kalibratiebestand niet gevonden: {args.kalibratie}')
        kal = json.loads(args.kalibratie.read_text(encoding='utf-8'))
        vaste_matrix = normaliseer(kal['matrix_beeld_naar_veld'])
        info = kal.get('veld') or {}
        diepte = float(kal.get('doelgebied_diepte_m') or info.get('doelgebied_diepte_m') or diepte)
        breedte_m = float(info.get('breedte_m') or breedte_m)
        speelveld_m = float(info.get('speelveld_m') or speelveld_m)
    if spoor is None and vaste_matrix is None:
        _fout('geef --homografie (bewegende camera) of --kalibratie (vaste camera)')

    balsporen = lees_jsonl(args.balspoor) if args.balspoor else []
    posities = lees_jsonl(args.posities) if args.posities else []

    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        _fout(f'video kan niet geopend worden: {args.video}')
    bron_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    breedte = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    hoogte = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
    schrijver = cv2.VideoWriter(str(args.uit), cv2.VideoWriter_fourcc(*'mp4v'), bron_fps, (breedte, hoogte))
    if not schrijver.isOpened():
        cap.release()
        _fout(f'uitvoervideo kan niet geschreven worden: {args.uit}')

    # De lijndetector meedraaien kost tijd maar toont precies wat de herankering ziet.
    detecteer = None
    if args.lijnen:
        from volg_veld import detecteer_lijnsegmenten  # noqa: PLC0415
        detecteer = detecteer_lijnsegmenten

    geschreven = 0
    zonder_stand = 0
    t = 0.0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if args.tot is not None and t > args.tot:
            break
        moment = None
        if spoor is not None:
            m = spoor.op(t)
            if m is not None:
                # Het moment zelf (voor bron en fout in de statusregel).
                dichtst = min(spoor.punten, key=lambda p: abs(float(p['t']) - t))
                moment = dichtst
        else:
            m = vaste_matrix
            moment = {'bron': 'kalibratie', 'fout_m': None}
        if m is None:
            zonder_stand += 1
            _teken_frame(cv2, frame, breedte, hoogte, {'model': [], 'status': statusregel(t, None)})
        else:
            bal, los, landing = balspoor_op_moment(balsporen, t)
            gegevens = {
                'model': veldmodel_in_beeld(m, breedte, hoogte, diepte, breedte_m, speelveld_m),
                'gedetecteerd': detecteer(cv2, frame) if detecteer is not None else [],
                'bal': bal,
                'los': los,
                'landing': landing,
                'spelers': posities_op_moment(posities, m, t),
                'status': statusregel(t, moment),
            }
            _teken_frame(cv2, frame, breedte, hoogte, gegevens)
        schrijver.write(frame)
        geschreven += 1
        t += 1.0 / bron_fps
    cap.release()
    schrijver.release()
    return {'frames': geschreven, 'zonder_veldstand': zonder_stand, 'duur_s': round(t, 1)}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Controle-overlay: teken veldmodel, gevonden lijnen, bal en spelers over de video.'
    )
    parser.add_argument('--video', type=Path, required=True, help='de wedstrijdvideo')
    parser.add_argument('--uit', type=Path, required=True, help='uitvoervideo (mp4)')
    parser.add_argument('--homografie', type=Path, default=None,
                        help='homografie-JSONL van volg_veld.py (bewegende camera)')
    parser.add_argument('--kalibratie', type=Path, default=None,
                        help='kalibratie-JSON van calibrate.py (vaste camera)')
    parser.add_argument('--balspoor', type=Path, default=None,
                        help='balspoor-JSONL van landing.py --balspoor')
    parser.add_argument('--posities', type=Path, default=None,
                        help='posities-JSONL van tracking.py (spelers)')
    parser.add_argument('--lijnen', action='store_true',
                        help='ook tekenen wat de lijndetector vindt (trager, maar toont waaróp herankerd wordt)')
    parser.add_argument('--tot', type=float, default=None,
                        help='stop na zoveel seconden — handig om snel te kijken vóór je een hele helft rendert')
    parser.add_argument('--diepte', type=float, default=veld.STANDAARD_DOELGEBIED_DIEPTE_M,
                        help='doelgebied-diepte in meters (standaard 10; komt anders uit de kalibratie)')
    args = parser.parse_args(argv)

    if args.tot is not None and args.tot <= 0:
        _fout('--tot moet groter zijn dan 0')

    rapport = maak_overlay(args)
    print(f'{rapport["frames"]} frames ({rapport["duur_s"]:g} s) → {args.uit}')
    if rapport['zonder_veldstand']:
        print(f'  {rapport["zonder_veldstand"]} frames zonder veldstand — daar staat "GEEN VELDSTAND" '
              f'in beeld en wordt er niets gemeten')
    print('Groen = waar het systeem de veldlijnen verwacht. Vallen ze samen met het krijt, dan klopt '
          'de meting; schuiven ze weg, dan zie je meteen wanneer.')


if __name__ == '__main__':
    main()
