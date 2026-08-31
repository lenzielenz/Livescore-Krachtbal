#!/usr/bin/env python3
"""Fase 2: bal-landingspunt → zone + afstand (verrijkt de detecties van fase 1).

Neemt de kandidaat-worpen uit ``detect_worpen.py`` en vult per event het
landingspunt in: zone (in het doelgebied of niet, met veldcoördinaten in
meters), de geschatte worpafstand en de score_delta die daarbij hoort
(+1 nekworp-doelpunt, +2 rugworp-doelpunt — reglement §6.6, anders 0).

Twee modi:

VIDEO (vereist opencv + een kalibratie-JSON van calibrate.py):
    python3 cv/landing.py --video match.mp4 --detecties det.jsonl \
        --kalibratie kalibratie.json --uit verrijkt.jsonl
    Per worp-event wordt in het venster erná (standaard 0,4–6 s) de bal gezocht
    met achtergrondsubtractie (MOG2) gefilterd op balgrootte; de landing is het
    moment waarop de neerwaartse beeldbeweging van de bal eindigt. Dat punt gaat
    door de homografie naar veldmeters. Dit is een v0.1-baseline: bij occlusie
    of een slecht zichtbare bal blijft de zone leeg (het voorstel behoudt dan
    enkel zijn tijdstip) — beter géén zone dan een verzonnen zone.

DEMO (geen video nodig — oefent de hele lus en de metriek):
    python3 cv/landing.py --demo --detecties det.jsonl --labels labels.jsonl \
        --seed 7 --sigma-m 0.8 --uit verrijkt.jsonl
    Elke detectie krijgt de gelabelde landing van het dichtstbijzijnde weak
    label (±venster), verstoord met gaussische ruis van --sigma-m meter; valse
    positieven (geen label in de buurt) krijgen een willekeurig veldpunt. Zo is
    de zone-accuraatheid en landing-MAE van evaluate.py hard te verifiëren.

De afstand: het reglement meet van werpplaats tot landing. De werpplaats is
voor de camera lastig; in videomodus schatten we ze als het eerste balpunt van
het gevolgde traject (vlak na de worp), in demomodus blijft afstand_m leeg.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import veld  # noqa: E402
from evaluate import lees_jsonl, match_greedy  # noqa: E402

MODEL_VIDEO = 'bal-achtergrondsubtractie'
MODEL_DEMO = 'demo-ruis-landing'
MODEL_VERSIE = '0.1.0'
DEMO_VENSTER_S = 2.0


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


def schrijf_jsonl(pad: Path, events: list[dict]) -> None:
    with pad.open('w', encoding='utf-8') as f:
        for event in events:
            f.write(json.dumps(event, ensure_ascii=False) + '\n')


# ---------------------------------------------------------------------------
# Zone + score uit een landingspunt in meters
# ---------------------------------------------------------------------------


def zone_en_score(
    x_m: float,
    y_m: float,
    worp_type: str | None,
    diepte_m: float,
    breedte_m: float = veld.BREEDTE_M,
    speelveld_m: float = veld.SPEELVELD_LENGTE_M,
) -> tuple[dict, int]:
    """Veldpunt (meters) → zone-object + score_delta volgens het reglement.

    Rugworp-doelpunt telt dubbel (§6.6) — dé krachtbal-specifieke regel die
    generieke sport-CV niet kent en die daarom hier expliciet leeft.
    """
    lengte = veld.totale_lengte_m(diepte_m, speelveld_m)
    x_norm = x_m / breedte_m
    y_norm = y_m / lengte
    binnen = veld.in_doelgebied(y_norm, diepte_m, x_norm=x_norm, speelveld_m=speelveld_m)
    zone = {'in_doelgebied': binnen, 'x_m': round(x_m, 2), 'y_m': round(y_m, 2)}
    if not binnen:
        return zone, 0
    return zone, 2 if worp_type == 'rugworp' else 1


def klem_op_veld(
    x_m: float,
    y_m: float,
    diepte_m: float,
    breedte_m: float = veld.BREEDTE_M,
    speelveld_m: float = veld.SPEELVELD_LENGTE_M,
) -> tuple[float, float]:
    lengte = veld.totale_lengte_m(diepte_m, speelveld_m)
    return max(0.0, min(breedte_m, x_m)), max(0.0, min(lengte, y_m))


# ---------------------------------------------------------------------------
# Demo: gelabelde landing + ruis
# ---------------------------------------------------------------------------


def demo_landing(
    detecties: list[dict],
    labels: list[dict],
    seed: int,
    sigma_m: float,
    diepte_m: float,
    venster_s: float = DEMO_VENSTER_S,
    breedte_m: float = veld.BREEDTE_M,
    speelveld_m: float = veld.SPEELVELD_LENGTE_M,
) -> tuple[list[dict], dict]:
    """Verrijk detecties met de (verstoorde) gelabelde landing van hun match.

    Zelfde greedy één-op-één-matching als evaluate.py, zodat de demo en de
    meting dezelfde koppeling zien. Valse positieven krijgen een uniform
    willekeurig veldpunt — precies wat de zone-metriek moet kunnen bestraffen.
    """
    rng = random.Random(seed)
    lengte = veld.totale_lengte_m(diepte_m, speelveld_m)
    paren = match_greedy(
        [float(l['video_time_s']) for l in labels],
        [float(d['video_time_s']) for d in detecties],
        venster_s,
    )
    label_bij_detectie = {di: li for li, di, _ in paren}

    verrijkt: list[dict] = []
    met_label = 0
    for di, det in enumerate(detecties):
        det = dict(det)
        li = label_bij_detectie.get(di)
        label_zone = labels[li].get('zone') if li is not None else None
        if label_zone is not None:
            met_label += 1
            x_m = float(label_zone['x_m']) + rng.gauss(0.0, sigma_m)
            y_m = float(label_zone['y_m']) + rng.gauss(0.0, sigma_m)
        else:
            x_m = rng.uniform(0.0, breedte_m)
            y_m = rng.uniform(0.0, lengte)
        x_m, y_m = klem_op_veld(x_m, y_m, diepte_m, breedte_m, speelveld_m)
        zone, score = zone_en_score(x_m, y_m, det.get('worp_type'), diepte_m, breedte_m, speelveld_m)
        det['zone'] = zone
        det['score_delta'] = score
        prov = dict(det.get('provenance') or {})
        prov['model'] = f"{prov.get('model', '?')}+{MODEL_DEMO}"
        det['provenance'] = prov
        verrijkt.append(det)
    return verrijkt, {'detecties': len(detecties), 'met_label': met_label, 'zonder_label': len(detecties) - met_label}


# ---------------------------------------------------------------------------
# Video: bal volgen na de worp-piek en de landing projecteren
# ---------------------------------------------------------------------------


def _laad_cv2():
    try:
        import cv2  # noqa: PLC0415
    except ImportError:
        _fout(
            'opencv ontbreekt — installeer met: pip install -r cv/requirements.txt '
            '(of oefen de lus zonder video via --demo)'
        )
    return cv2


def _projecteer(matrix: list[list[float]], x: float, y: float) -> tuple[float, float]:
    """Homografie beeld→veld (zelfde wiskunde als calibrate.py, hier stdlib)."""
    m = matrix
    w = m[2][0] * x + m[2][1] * y + m[2][2]
    if abs(w) < 1e-12:
        return float('nan'), float('nan')
    return (
        (m[0][0] * x + m[0][1] * y + m[0][2]) / w,
        (m[1][0] * x + m[1][1] * y + m[1][2]) / w,
    )


def volg_bal_na_worp(
    cap,
    cv2,
    start_s: float,
    einde_s: float,
    bal_px: tuple[int, int],
) -> list[tuple[float, float, float]]:
    """Volg kleine bewegende blobs in [start_s, einde_s]; geef (t, x, y)-spoor terug.

    Achtergrondsubtractie (MOG2) + contourfilter op balgrootte. We houden per
    frame de blob die het dichtst bij de vorige balpositie ligt — simpel, maar
    zonder modeldownload en snel genoeg voor een venster van enkele seconden.
    """
    min_px, max_px = bal_px
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.set(cv2.CAP_PROP_POS_MSEC, start_s * 1000.0)
    achtergrond = cv2.createBackgroundSubtractorMOG2(history=60, varThreshold=24, detectShadows=False)
    spoor: list[tuple[float, float, float]] = []
    vorige: tuple[float, float] | None = None
    t = start_s
    while t <= einde_s:
        ok, frame = cap.read()
        if not ok:
            break
        masker = achtergrond.apply(frame)
        masker = cv2.morphologyEx(masker, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        contouren, _ = cv2.findContours(masker, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        kandidaten: list[tuple[float, float]] = []
        for c in contouren:
            (cx, cy), straal = cv2.minEnclosingCircle(c)
            if min_px <= 2 * straal <= max_px:
                kandidaten.append((float(cx), float(cy)))
        if kandidaten:
            if vorige is None:
                # Eerste zicht: neem de hoogste blob (de bal hangt in de lucht na de worp).
                keuze = min(kandidaten, key=lambda p: p[1])
            else:
                keuze = min(kandidaten, key=lambda p: (p[0] - vorige[0]) ** 2 + (p[1] - vorige[1]) ** 2)
            vorige = keuze
            spoor.append((t, keuze[0], keuze[1]))
        t += 1.0 / fps
    return spoor


def landing_uit_spoor(spoor: list[tuple[float, float, float]]) -> tuple[float, float, float] | None:
    """Het landingsmoment: waar de neerwaartse beeldbeweging (y neemt toe) eindigt.

    In beeldcoördinaten wijst y omlaag, dus een vallende bal heeft stijgende y.
    De landing is het laatste punt van de langste dalende reeks — of het
    laatste spoorpunt wanneer de bal uit beeld/opgeraapt verdwijnt.
    """
    if len(spoor) < 3:
        return None
    beste_einde = None
    reeks = 0
    for i in range(1, len(spoor)):
        if spoor[i][2] >= spoor[i - 1][2] - 1.0:
            reeks += 1
            if reeks >= 2:
                beste_einde = i
        else:
            reeks = 0
    if beste_einde is None:
        return None
    return spoor[beste_einde]


def video_landing(args: argparse.Namespace, detecties: list[dict]) -> tuple[list[dict], dict]:
    cv2 = _laad_cv2()
    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')

    # Bewegende camera: het spoor van volg_veld.py geeft per moment de matrix. Er is dan
    # geen vaste matrix — die van het startframe zou al na een pan onbruikbaar zijn.
    spoor = None
    if args.homografie is not None:
        if not args.homografie.is_file():
            _fout(f'homografiebestand niet gevonden: {args.homografie} (maak het met cv/volg_veld.py)')
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from volg_veld import HomografieSpoor  # noqa: PLC0415
        spoor = HomografieSpoor.lees(args.homografie)
        if not spoor.punten:
            _fout(f'{args.homografie} bevat geen momenten')

    if args.kalibratie is None:
        # Alleen een spoor: de veldmaten staan dan in de kalibratie die volg_veld gebruikte,
        # dus vallen we terug op de vlaggen/het reglement.
        kalibratie = {}
    else:
        if not args.kalibratie.is_file():
            _fout(f'kalibratiebestand niet gevonden: {args.kalibratie} (maak het met cv/calibrate.py)')
        kalibratie = json.loads(args.kalibratie.read_text(encoding='utf-8'))
    matrix = kalibratie.get('matrix_beeld_naar_veld')
    veld_info = kalibratie.get('veld') or {}
    diepte = float(kalibratie.get('doelgebied_diepte_m') or veld_info.get('doelgebied_diepte_m') or args.diepte)
    breedte = float(args.breedte or veld_info.get('breedte_m') or veld.BREEDTE_M)
    speelveld = float(args.speelveld or veld_info.get('speelveld_m') or veld.SPEELVELD_LENGTE_M)

    # Vooraf gevonden balbanen (cv/bal.py): per worptijd de baan met loslaat- en landingspunt.
    vooraf: dict[float, dict] = {}
    if getattr(args, 'balbanen', None) is not None:
        if not args.balbanen.is_file():
            _fout(f'balbanenbestand niet gevonden: {args.balbanen} (maak het met cv/bal.py)')
        with args.balbanen.open(encoding='utf-8') as f:
            for regel in f:
                regel = regel.strip()
                if regel:
                    baan = json.loads(regel)
                    vooraf[round(float(baan['worp_s']), 2)] = baan

    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        _fout(f'video kan niet geopend worden: {args.video}')

    verrijkt: list[dict] = []
    balsporen: list[dict] = []
    gevonden = 0
    zonder_matrix = 0
    for det in detecties:
        det = dict(det)
        t0 = float(det['video_time_s'])
        if spoor is not None:
            # De matrix zoals ze op dít moment gold. Geen betrouwbare stand (de camera keek
            # bijvoorbeeld even weg van het veld)? Dan liever geen meting dan een foute.
            matrix = spoor.op(t0)
            if matrix is None:
                zonder_matrix += 1
                prov = dict(det.get('provenance') or {})
                prov['model'] = f"{prov.get('model', '?')}+{MODEL_VIDEO}"
                det['provenance'] = prov
                verrijkt.append(det)
                continue
        # LET OP: dit is het BALspoor, niet de homografie-reeks hierboven. Die twee deelden
        # eerder één variabele, waardoor `spoor.op(t0)` bij de tweede worp over een lijst
        # struikelde — precies op het pad voor een bewegende camera.
        klaar = vooraf.get(round(t0, 2))
        if klaar is not None:
            # De baan uit cv/bal.py: camerabeweging weggerekend en een balbaan gefit, dus ook
            # bruikbaar bij een pannende camera. Landing gemeten op 0,40 m op een proefvideo.
            balspoor = [(p[0], p[1], p[2]) for p in klaar['spoor']]
            punt = (klaar['landing']['t'], klaar['landing']['x'], klaar['landing']['y'])
            if balspoor:
                balspoor[0] = (klaar['los']['t'], klaar['los']['x'], klaar['los']['y'])
        else:
            balspoor = volg_bal_na_worp(cap, cv2, t0 + args.venster_start, t0 + args.venster_einde,
                                        (args.bal_min_px, args.bal_max_px))
            punt = landing_uit_spoor(balspoor)
        if args.balspoor is not None and balspoor:
            # Alles wat we van deze worp zagen, in beeldpixels: het spoor zelf, welk punt we
            # als landing kozen, en waar de bal het eerst gezien werd (bij benadering de
            # werpplaats). Precies wat er straks over de video getekend wordt.
            balsporen.append({
                'video_time_s': round(t0, 3),
                'worp_type': det.get('worp_type'),
                'spoor': [[round(w, 2) for w in punt3] for punt3 in balspoor],
                'landing_px': [round(punt[1], 2), round(punt[2], 2)] if punt is not None else None,
                'landing_t': round(punt[0], 3) if punt is not None else None,
                'los_px': [round(balspoor[0][1], 2), round(balspoor[0][2], 2)],
            })
        if punt is not None:
            # De camera kan tussen worp en landing meebewogen zijn: neem de matrix van het
            # landingsmoment, niet die van de worp.
            land_matrix = matrix
            if spoor is not None:
                op_landing = spoor.op(punt[0])
                if op_landing is not None:
                    land_matrix = op_landing
            x_m, y_m = _projecteer(land_matrix, punt[1], punt[2])
            if x_m == x_m and y_m == y_m:  # geen NaN
                x_m, y_m = klem_op_veld(x_m, y_m, diepte, breedte, speelveld)
                zone, score = zone_en_score(x_m, y_m, det.get('worp_type'), diepte, breedte, speelveld)
                det['zone'] = zone
                det['score_delta'] = score
                # Afstand: eerste balpunt van het spoor als benadering van de werpplaats.
                sx, sy = _projecteer(land_matrix, balspoor[0][1], balspoor[0][2])
                if sx == sx and sy == sy:
                    det['afstand_m'] = round(((x_m - sx) ** 2 + (y_m - sy) ** 2) ** 0.5, 2)
                gevonden += 1
        prov = dict(det.get('provenance') or {})
        prov['model'] = f"{prov.get('model', '?')}+{MODEL_VIDEO}"
        prov['model_version'] = MODEL_VERSIE
        det['provenance'] = prov
        verrijkt.append(det)
    cap.release()
    if args.balspoor is not None:
        with args.balspoor.open('w', encoding='utf-8') as f:
            for rij in balsporen:
                f.write(json.dumps(rij, ensure_ascii=False) + '\n')
        print(f'Balsporen van {len(balsporen)} worpen → {args.balspoor}')
    rapport = {'detecties': len(detecties), 'met_landing': gevonden,
               'zonder_landing': len(detecties) - gevonden}
    if spoor is not None:
        rapport['zonder_homografie'] = zonder_matrix
    return verrijkt, rapport


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Fase 2: verrijk kandidaat-worpen met landingszone, afstand en score_delta.'
    )
    parser.add_argument('--detecties', type=Path, required=True, help='detectie-JSONL uit detect_worpen.py')
    parser.add_argument('--uit', type=Path, required=True, help='uitvoerbestand (verrijkte JSONL)')
    parser.add_argument('--diepte', type=float, default=veld.STANDAARD_DOELGEBIED_DIEPTE_M,
                        help='doelgebied-diepte in meters van deze wedstrijd (standaard 10)')
    parser.add_argument('--breedte', type=float, default=None,
                        help='opgemeten veldbreedte in meters (standaard: uit de kalibratie, anders 14)')
    parser.add_argument('--speelveld', type=float, default=None,
                        help='opgemeten speelveldlengte in meters (standaard: uit de kalibratie, anders 26)')
    # videomodus
    parser.add_argument('--video', type=Path, default=None, help='wedstrijdvideo (videomodus)')
    parser.add_argument('--kalibratie', type=Path, default=None, help='kalibratie-JSON van calibrate.py')
    parser.add_argument('--balbanen', type=Path, default=None,
                        help='balbanen uit cv/bal.py: gebruikt die baan in plaats van zelf de '
                             'bal te zoeken. Nodig bij een bewegende camera — de eigen zoeker '
                             'hier gebruikt achtergrondsubtractie en die veronderstelt een '
                             'stilstaande camera.')
    parser.add_argument('--balspoor', type=Path, default=None,
                        help='schrijf het gevolgde balspoor per worp weg (JSONL) — voer voor '
                             'cv/overlay.py, zodat je in beeld ziet wat er gevolgd is')
    parser.add_argument('--homografie', type=Path, default=None,
                        help='homografie-JSONL van volg_veld.py — voor een BEWEGENDE camera: '
                             'per moment de juiste matrix in plaats van één vaste kalibratie')
    parser.add_argument('--venster-start', type=float, default=0.4, help='zoekvenster ná de worp: begin (s)')
    parser.add_argument('--venster-einde', type=float, default=6.0, help='zoekvenster ná de worp: einde (s)')
    parser.add_argument('--bal-min-px', type=int, default=6, help='minimale baldiameter in pixels')
    parser.add_argument('--bal-max-px', type=int, default=60, help='maximale baldiameter in pixels')
    # demomodus
    parser.add_argument('--demo', action='store_true', help='oefenmodus zonder video (vereist --labels en --seed)')
    parser.add_argument('--labels', type=Path, default=None, help='weak-labels-JSONL (demomodus)')
    parser.add_argument('--seed', type=int, default=None, help='reproduceerbare ruis (verplicht bij --demo)')
    parser.add_argument('--sigma-m', type=float, default=0.8, help='ruis op de gelabelde landing, in meters')
    args = parser.parse_args(argv)

    if args.demo and args.video is not None:
        parser.error('--demo gaat niet samen met --video — kies één modus')
    if args.homografie is not None and args.demo:
        parser.error('--homografie hoort bij de videomodus, niet bij --demo')
    if not args.detecties.is_file():
        _fout(f'detectiebestand niet gevonden: {args.detecties}')
    detecties = lees_jsonl(args.detecties)
    if not detecties:
        _fout(f'{args.detecties} bevat geen detecties')

    if args.demo:
        if args.seed is None:
            _fout('--demo vereist --seed (reproduceerbaarheid is de hele bedoeling)')
        if args.labels is None or not args.labels.is_file():
            _fout('--demo vereist --labels met een bestaand weak-labels-bestand')
        if args.sigma_m < 0:
            _fout('--sigma-m kan niet negatief zijn')
        labels = lees_jsonl(args.labels)
        verrijkt, rapport = demo_landing(
            detecties, labels, seed=args.seed, sigma_m=args.sigma_m, diepte_m=args.diepte,
            breedte_m=args.breedte or veld.BREEDTE_M, speelveld_m=args.speelveld or veld.SPEELVELD_LENGTE_M,
        )
        print(
            f'Demo-landing (seed {args.seed}, σ={args.sigma_m:g} m): {rapport["met_label"]} detecties kregen de '
            f'gelabelde landing met ruis, {rapport["zonder_label"]} (valse positieven) een willekeurig veldpunt'
        )
    else:
        if args.video is None or args.kalibratie is None:
            _fout('videomodus vereist --video én --kalibratie (of gebruik --demo)')
        verrijkt, rapport = video_landing(args, detecties)
        print(
            f'Landing gevonden voor {rapport["met_landing"]} van {rapport["detecties"]} events; '
            f'{rapport["zonder_landing"]} zonder zichtbare bal (zone blijft leeg — reviewen op het oog)'
        )

    schrijf_jsonl(args.uit, verrijkt)
    print(f'{len(verrijkt)} events → {args.uit}')


if __name__ == '__main__':
    main()
