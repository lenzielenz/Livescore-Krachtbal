#!/usr/bin/env python3
"""Fase 3: spelersidentificatie — team van de werper, en waar mogelijk het rugnummer.

Verrijkt de (al dan niet door fase 2 verrijkte) detecties met een
``speler``-object: ``{"team": "home"|"away", "rugnummer": int|null}``. Een leeg
rugnummer is een bewuste uitkomst, geen falen: bij laag vertrouwen hoort het
veld leeg te blijven zodat de reviewer het invult (fase 1-reviewpaneel).

Twee modi:

VIDEO (vereist opencv):
    python3 cv/spelers.py --video match.mp4 --detecties det.jsonl \
        --uit verrijkt.jsonl [--wissel]
    Baseline zonder modeldownload: rond elk worp-event worden personen gevonden
    met OpenCV's ingebouwde HOG-persoonsdetector; van elke persoon-crop nemen we
    het kleurenhistogram van de torso (tinten, HSV) en verdelen alle crops van
    de wedstrijd met 2-means in twee truitjeskleuren. De werper = de persoon
    het dichtst bij het beeldmidden op het worpmoment (v0.1-aanname; de
    reviewer corrigeert). Welke cluster "home" is weet de camera niet — de
    grootste cluster wordt home en ``--wissel`` draait de toewijzing om.
    Rugnummers: nog niet ingevuld in v0.1 (de OCR-stap uit het plan — pose-crop
    + PARSeq — is een latere, optionele backend); het veld blijft null.

DEMO (geen video nodig — oefent de lus en de fase 3-metriek):
    python3 cv/spelers.py --demo --detecties det.jsonl --labels labels.jsonl \
        --seed 7 --uit verrijkt.jsonl
    Neemt de gelabelde speler van het dichtstbijzijnde weak label en verstoort
    die reproduceerbaar: het team klapt om met kans --team-fout, het rugnummer
    blijft leeg met kans --nummer-leeg of wordt fout met kans --nummer-fout.
    Valse positieven krijgen een willekeurig team zonder rugnummer.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from evaluate import lees_jsonl, match_greedy  # noqa: E402

MODEL_VIDEO = 'hog+kleurcluster'
MODEL_DEMO = 'demo-ruis-speler'
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
# Demo: gelabelde speler + ruis
# ---------------------------------------------------------------------------


def demo_spelers(
    detecties: list[dict],
    labels: list[dict],
    seed: int,
    team_fout: float,
    nummer_leeg: float,
    nummer_fout: float,
    venster_s: float = DEMO_VENSTER_S,
) -> tuple[list[dict], dict]:
    """Verrijk detecties met de (verstoorde) gelabelde speler van hun match."""
    rng = random.Random(seed)
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
        label_speler = labels[li].get('speler') if li is not None else None
        if label_speler and label_speler.get('team') in ('home', 'away'):
            met_label += 1
            team = label_speler['team']
            if rng.random() < team_fout:
                team = 'away' if team == 'home' else 'home'
            rugnummer = label_speler.get('rugnummer')
            if rugnummer is not None:
                if rng.random() < nummer_leeg:
                    rugnummer = None
                elif rng.random() < nummer_fout:
                    fout = rng.randrange(0, 100)
                    rugnummer = fout if fout != rugnummer else (fout + 1) % 100
        else:
            team = rng.choice(['home', 'away'])
            rugnummer = None
        det['speler'] = {'team': team, 'rugnummer': rugnummer}
        prov = dict(det.get('provenance') or {})
        prov['model'] = f"{prov.get('model', '?')}+{MODEL_DEMO}"
        det['provenance'] = prov
        verrijkt.append(det)
    return verrijkt, {'detecties': len(detecties), 'met_label': met_label, 'zonder_label': len(detecties) - met_label}


# ---------------------------------------------------------------------------
# Video: HOG-personen + truitjeskleur-clustering
# ---------------------------------------------------------------------------

# OpenCV-hue loopt van 0 t/m 179 en is circulair: 0 en 179 zijn allebei rood.
# Alles wat met tinten rekent moet dus op de cirkel rekenen — een lineaire
# mediaan of afstand splijt een rood truitje in tweeën (metingen op ~3 én ~176)
# en laat de mediaan van wrap-overspannende pixels in cyaan/groen landen.
HUE_PERIODE = 180.0


def circulaire_afstand(a: float, b: float) -> float:
    """Afstand tussen twee tinten op de hue-cirkel (0 en 179 liggen vlak bij elkaar)."""
    d = abs(a - b) % HUE_PERIODE
    return min(d, HUE_PERIODE - d)


def circulair_gemiddelde(tinten) -> float:
    """Gemiddelde tint als hoek op de hue-cirkel, terug in [0, 180).

    Elke tint wordt een eenheidsvector op de cirkel; het gemiddelde is de hoek
    van de somvector. Zo blijft rood rond de wrap gewoon rood, waar een lineair
    gemiddelde (of mediaan) midden op de schaal zou uitkomen.
    """
    som_cos = som_sin = 0.0
    for t in tinten:
        hoek = float(t) * (2.0 * math.pi / HUE_PERIODE)
        som_cos += math.cos(hoek)
        som_sin += math.sin(hoek)
    return (math.atan2(som_sin, som_cos) * HUE_PERIODE / (2.0 * math.pi)) % HUE_PERIODE


def _laad_cv2():
    try:
        import cv2  # noqa: PLC0415
    except ImportError:
        _fout(
            'opencv ontbreekt — installeer met: pip install -r cv/requirements.txt '
            '(of oefen de lus zonder video via --demo)'
        )
    return cv2


def torso_tint(cv2, frame, vak: tuple[int, int, int, int]) -> float | None:
    """Gemiddelde tint (HSV-hue) van de torso-regio van een persoon-crop.

    De torso is grofweg het middelste derde van de bounding box — daar zit het
    truitje, niet de broek of het gras.
    """
    x, y, b, h = vak
    ty0, ty1 = y + h // 5, y + h // 2
    tx0, tx1 = x + b // 4, x + 3 * b // 4
    crop = frame[max(0, ty0):ty1, max(0, tx0):tx1]
    if crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    import numpy as np  # noqa: PLC0415  (komt mee met opencv)

    # Enkel verzadigde pixels tellen: wit/grijs/gras-schaduw zegt niets over het truitje.
    masker = hsv[:, :, 1] > 60
    if int(masker.sum()) < 20:
        return None
    # Circulair middelen, niet de mediaan: een rood truitje meet pixels aan
    # beide kanten van de hue-wrap en de mediaan daarvan zou in cyaan landen.
    return circulair_gemiddelde(hsv[:, :, 0][masker])


def wijs_teams_toe(tinten: list[float | None], wissel: bool = False) -> list[str | None]:
    """Pas 2 van de videomodus, puur: cluster de tinten in twee truitjeskleuren
    en geef per meting 'home'/'away' terug (None = geen tint gemeten).

    1-dimensionale 2-means, maar dan op de hue-cirkel: startcentra zijn het
    circulair verst uiteenliggende paar (min/max is op een cirkel betekenisloos
    — bij rood liggen 3 en 176 vlák bij elkaar), en per groep wordt circulair
    gemiddeld. Zo blijft een rood truitje dat afhankelijk van de belichting
    soms ~3 en soms ~176 meet één cluster, in plaats van over beide teams
    verdeeld te raken.
    """
    geldig = [t for t in tinten if t is not None]
    c1, c2 = max(
        ((a, b) for i, a in enumerate(geldig) for b in geldig[i + 1:]),
        key=lambda paar: circulaire_afstand(paar[0], paar[1]),
    )
    for _ in range(20):
        groep1 = [t for t in geldig if circulaire_afstand(t, c1) <= circulaire_afstand(t, c2)]
        groep2 = [t for t in geldig if circulaire_afstand(t, c1) > circulaire_afstand(t, c2)]
        n1 = circulair_gemiddelde(groep1) if groep1 else c1
        n2 = circulair_gemiddelde(groep2) if groep2 else c2
        if circulaire_afstand(n1, c1) < 1e-6 and circulaire_afstand(n2, c2) < 1e-6:
            break
        c1, c2 = n1, n2
    # De grootste cluster heet home; --wissel draait dat om (de camera kent de opstelling niet).
    grootste_is_1 = len([t for t in geldig if circulaire_afstand(t, c1) <= circulaire_afstand(t, c2)]) >= len(geldig) / 2
    home_centrum = c1 if grootste_is_1 != wissel else c2
    away_centrum = c2 if home_centrum == c1 else c1
    return [
        None if t is None
        else ('home' if circulaire_afstand(t, home_centrum) <= circulaire_afstand(t, away_centrum) else 'away')
        for t in tinten
    ]


def video_spelers(args: argparse.Namespace, detecties: list[dict]) -> tuple[list[dict], dict]:
    cv2 = _laad_cv2()
    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')
    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        _fout(f'video kan niet geopend worden: {args.video}')

    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    # Pas 1: per event de werper-tint bepalen (persoon dichtst bij het beeldmidden).
    tinten: list[float | None] = []
    for det in detecties:
        cap.set(cv2.CAP_PROP_POS_MSEC, float(det['video_time_s']) * 1000.0)
        ok, frame = cap.read()
        tint = None
        if ok:
            hoogte, breedte = frame.shape[:2]
            vakken, _ = hog.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)
            beste = None
            for x, y, b, h in vakken:
                afstand = abs((x + b / 2) - breedte / 2) + abs((y + h / 2) - hoogte / 2)
                if beste is None or afstand < beste[0]:
                    beste = (afstand, (int(x), int(y), int(b), int(h)))
            if beste is not None:
                tint = torso_tint(cv2, frame, beste[1])
        tinten.append(tint)
    cap.release()

    # Pas 2: 2-means op de hue-cirkel over de gevonden tinten → twee truitjeskleuren.
    if len([t for t in tinten if t is not None]) < 2:
        _fout('te weinig personen gevonden om twee ploegen te onderscheiden — reviewen op het oog')
    teams = wijs_teams_toe(tinten, wissel=args.wissel)

    verrijkt: list[dict] = []
    toegewezen = 0
    for det, team in zip(detecties, teams):
        det = dict(det)
        if team is not None:
            det['speler'] = {'team': team, 'rugnummer': None}
            toegewezen += 1
        prov = dict(det.get('provenance') or {})
        prov['model'] = f"{prov.get('model', '?')}+{MODEL_VIDEO}"
        prov['model_version'] = MODEL_VERSIE
        det['provenance'] = prov
        verrijkt.append(det)
    return verrijkt, {'detecties': len(detecties), 'toegewezen': toegewezen, 'zonder': len(detecties) - toegewezen}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Fase 3: verrijk kandidaat-worpen met de speler (team + eventueel rugnummer).'
    )
    parser.add_argument('--detecties', type=Path, required=True, help='detectie-JSONL (fase 1/2)')
    parser.add_argument('--uit', type=Path, required=True, help='uitvoerbestand (verrijkte JSONL)')
    # videomodus
    parser.add_argument('--video', type=Path, default=None, help='wedstrijdvideo (videomodus)')
    parser.add_argument('--wissel', action='store_true',
                        help='draai de home/away-toewijzing van de kleurclusters om')
    # demomodus
    parser.add_argument('--demo', action='store_true', help='oefenmodus zonder video (vereist --labels en --seed)')
    parser.add_argument('--labels', type=Path, default=None, help='weak-labels-JSONL (demomodus)')
    parser.add_argument('--seed', type=int, default=None, help='reproduceerbare ruis (verplicht bij --demo)')
    parser.add_argument('--team-fout', type=float, default=0.1, help='kans dat het team omklapt (demo)')
    parser.add_argument('--nummer-leeg', type=float, default=0.3, help='kans dat het rugnummer leeg blijft (demo)')
    parser.add_argument('--nummer-fout', type=float, default=0.1, help='kans op een fout rugnummer (demo)')
    args = parser.parse_args(argv)

    if args.demo and args.video is not None:
        parser.error('--demo gaat niet samen met --video — kies één modus')
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
        for naam, waarde in (('--team-fout', args.team_fout), ('--nummer-leeg', args.nummer_leeg), ('--nummer-fout', args.nummer_fout)):
            if not 0.0 <= waarde <= 1.0:
                _fout(f'{naam} moet in [0, 1] liggen')
        labels = lees_jsonl(args.labels)
        verrijkt, rapport = demo_spelers(
            detecties, labels, seed=args.seed,
            team_fout=args.team_fout, nummer_leeg=args.nummer_leeg, nummer_fout=args.nummer_fout,
        )
        print(
            f'Demo-spelers (seed {args.seed}): {rapport["met_label"]} detecties kregen de gelabelde speler '
            f'met ruis (team-fout {args.team_fout:g}, nummer leeg {args.nummer_leeg:g}, fout {args.nummer_fout:g}); '
            f'{rapport["zonder_label"]} valse positieven kregen een gok'
        )
    else:
        if args.video is None:
            _fout('videomodus vereist --video (of gebruik --demo)')
        verrijkt, rapport = video_spelers(args, detecties)
        print(
            f'Team toegewezen voor {rapport["toegewezen"]} van {rapport["detecties"]} events '
            f'({rapport["zonder"]} zonder herkende werper); rugnummers blijven leeg in v0.1 — '
            f'de reviewer vult ze in het paneel aan'
        )

    schrijf_jsonl(args.uit, verrijkt)
    print(f'{len(verrijkt)} events → {args.uit}')


if __name__ == '__main__':
    main()
