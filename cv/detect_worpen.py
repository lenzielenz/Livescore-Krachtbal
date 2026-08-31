#!/usr/bin/env python3
"""Kandidaat-worpen detecteren in een wedstrijdvideo (fase 1).

Baseline die altijd werkt (enkel opencv nodig, en zelfs dat niet in --demo):
een bewegingsenergie-spotter. Per geanalyseerd frame berekenen we de
genormaliseerde frame-verschil-energie (grijswaarden → blur → absdiff met het
vorige frame → gemiddelde), strijken die glad met een lopend gemiddelde en
zoeken lokale maxima boven een adaptieve drempel (mediaan + k × MAD). Tussen
twee pieken zit een minimale afstand — een worpbeurt duurt seconden. De
confidence is de genormaliseerde piekhoogte, afgekapt op [0.05, 0.95].

Optionele verfijning (--pose, lazy import): pose-schatting via rtmlib
(Apache-2.0, ONNX, geen torch). Polsen boven de schouders rond de piek plus de
zwaairichting classificeren nekworp (voorwaartse zwaai) versus rugworp
(achterwaarts, ruggelings over het hoofd). Zonder rtmlib blijft ``worp_type``
null en geldt een lager confidence-plafond; de CLI meldt netjes dat pose uit
staat. Installatie: ``pip install -r cv/requirements-pose.txt``.

Uitvoer: events-JSONL volgens het event-JSON van de brug (zie cv/README.md),
event_type altijd ``worp``, klaar voor ``cv/upload.py`` — de voorstellen komen
dan op de review-tijdlijn waar een mens ze bevestigt of corrigeert.

Gebruik (echte video):
    python3 cv/detect_worpen.py wedstrijd.mp4 --match 42 --uit detecties.jsonl

Demo-modus (géén video en géén opencv nodig — oefen de hele review-lus):
leest een weak-labels-JSONL (fase 0-sync), verstoort de tijden met jitter,
laat een instelbaar deel vallen en voegt valse positieven toe. --seed is
verplicht zodat elke run exact reproduceerbaar is (random.Random(seed)).

    python3 cv/detect_worpen.py --demo labels_match42.jsonl --seed 7 \
        --uit detecties_demo.jsonl

Alle regels/score blijven het domein van de match-engine (event-sourcing) —
deze detector levert uitsluitend VOORSTELLEN met confidence en provenance.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
from pathlib import Path

MODEL_VERSION = '0.1.0'
MODEL_BASELINE = 'bewegingsenergie'
MODEL_MET_POSE = 'bewegingsenergie+rtmpose'
MODEL_DEMO = 'demo-ruis'

# Confidence: afgekapt op [CONF_MIN, plafond]; zonder pose ligt het plafond
# lager — we kunnen het worptype dan niet eens zien, dus ook de piek zelf
# verdient minder vertrouwen.
CONF_MIN = 0.05
CONF_PLAFOND = 0.95
CONF_PLAFOND_ZONDER_POSE = 0.75

# COCO-17-keypointindexen zoals rtmlib ze levert (Body, to_openpose=False).
_NEUS, _L_SCHOUDER, _R_SCHOUDER, _L_POLS, _R_POLS = 0, 5, 6, 9, 10


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    sys.exit(code)


# ---------------------------------------------------------------------------
# Signaalverwerking (puur Python, geen cv2 — unit-getest zonder video)
# ---------------------------------------------------------------------------


def glad_lopend_gemiddelde(reeks: list[float], venster: int) -> list[float]:
    """Strijk de reeks glad met een centraal lopend gemiddelde over `venster` samples."""
    if venster <= 1 or not reeks:
        return list(reeks)
    half = venster // 2
    uit = []
    for i in range(len(reeks)):
        lo = max(0, i - half)
        hi = min(len(reeks), i + half + 1)
        uit.append(sum(reeks[lo:hi]) / (hi - lo))
    return uit


def adaptieve_drempel(reeks: list[float], k: float = 3.0) -> float:
    """Adaptieve drempel: mediaan + k × MAD (mediaan van |x − mediaan|).

    Robuust tegen de rustige basislijn van een wedstrijdvideo: spelmomenten
    tillen het gemiddelde op, maar mediaan en MAD nauwelijks.
    """
    if not reeks:
        return 0.0
    med = statistics.median(reeks)
    mad = statistics.median(abs(x - med) for x in reeks)
    return med + k * mad


def vind_pieken(
    reeks: list[float],
    drempel: float | None = None,
    k: float = 3.0,
    min_afstand: int = 1,
) -> list[tuple[int, float]]:
    """Lokale maxima boven de (adaptieve) drempel, met minimale onderlinge afstand.

    Een piek is stríkt groter dan beide buren — plateaus (bv. een camerazwaai
    die de energie seconden hoog houdt) leveren dus géén piek op. Bij pieken
    dichter dan `min_afstand` samples wint de hoogste (greedy, hoogste eerst).
    Geeft (index, waarde)-paren terug, gesorteerd op index.
    """
    if drempel is None:
        drempel = adaptieve_drempel(reeks, k)
    kandidaten = [
        (i, reeks[i])
        for i in range(1, len(reeks) - 1)
        if reeks[i] > drempel and reeks[i] > reeks[i - 1] and reeks[i] > reeks[i + 1]
    ]
    # hoogste eerst; bij gelijke hoogte de vroegste, zodat de keuze deterministisch is
    kandidaten.sort(key=lambda p: (-p[1], p[0]))
    gekozen: list[tuple[int, float]] = []
    for i, w in kandidaten:
        if all(abs(i - j) >= min_afstand for j, _ in gekozen):
            gekozen.append((i, w))
    gekozen.sort(key=lambda p: p[0])
    return gekozen


def bereken_confidences(
    hoogten: list[float], drempel: float, plafond: float = CONF_PLAFOND
) -> list[float]:
    """Genormaliseerde piekhoogte → confidence, afgekapt op [CONF_MIN, plafond].

    De hoogste piek van de run krijgt het plafond; een piek die de drempel
    amper haalt zakt naar CONF_MIN. Zonder pieken: lege lijst.
    """
    if not hoogten:
        return []
    max_h = max(hoogten)
    uit = []
    for h in hoogten:
        relatief = (h - drempel) / (max_h - drempel) if max_h > drempel else 1.0
        uit.append(round(min(plafond, max(CONF_MIN, relatief * plafond)), 3))
    return uit


# ---------------------------------------------------------------------------
# Video → energiereeks (lazy cv2 — enkel nodig buiten --demo)
# ---------------------------------------------------------------------------


def _laad_cv2():
    try:
        import cv2  # lazy: --demo en de tests hebben geen opencv nodig
    except ImportError:
        _fout(
            'opencv niet geïnstalleerd — nodig om video te lezen. '
            'Installeer met: pip install -r cv/requirements.txt '
            '(of gebruik --demo, dat draait puur op stdlib)'
        )
    return cv2


# Wat de laatste run gedaan heeft — de app leest dit uit om te tonen wat er écht gebeurd is.
_RAPPORT: dict = {}


def duur_van_video(videopad: Path) -> float | None:
    """De lengte van de video in seconden, of None als de container het niet zegt."""
    cv2 = _laad_cv2()
    cap = cv2.VideoCapture(str(videopad))
    if not cap.isOpened():
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    cap.release()
    return frames / fps if fps > 0 and frames > 0 else None


def bereken_energie_video(
    videopad: Path, analyse_fps: float
) -> tuple[list[float], list[float], float]:
    """Lees de video en bereken per geanalyseerd frame de bewegingsenergie.

    Energie = gemiddelde van |frame − vorig frame| op geblurde grijswaarden,
    genormaliseerd naar [0,1] (delen door 255). Geeft (tijden_s, energie,
    fps_bron) terug; er wordt gesubsampled naar ± `analyse_fps`.
    """
    cv2 = _laad_cv2()
    cap = cv2.VideoCapture(str(videopad))
    if not cap.isOpened():
        _fout(f'kan video niet openen: {videopad}', code=1)
    fps_bron = cap.get(cv2.CAP_PROP_FPS) or 0.0
    if fps_bron <= 0:
        fps_bron = 30.0  # sommige containers melden geen fps; redelijke aanname
    stap = max(1, round(fps_bron / analyse_fps))

    tijden: list[float] = []
    energie: list[float] = []
    vorig = None
    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx % stap == 0:
            grijs = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            grijs = cv2.GaussianBlur(grijs, (5, 5), 0)
            if vorig is not None:
                verschil = cv2.absdiff(grijs, vorig)
                tijden.append(frame_idx / fps_bron)
                energie.append(float(verschil.mean()) / 255.0)
            vorig = grijs
        frame_idx += 1
    cap.release()
    if not energie:
        _fout(f'geen frames kunnen lezen uit {videopad}', code=1)
    return tijden, energie, fps_bron


# ---------------------------------------------------------------------------
# Optionele pose-verfijning (lazy rtmlib) — nekworp vs rugworp
# ---------------------------------------------------------------------------


def _laad_rtmlib():
    """Lazy import van rtmlib; None als het (of onnxruntime) niet geïnstalleerd is."""
    try:
        from rtmlib import Body
    except ImportError:
        return None
    return Body


def classificeer_worp_types(
    videopad: Path, piek_tijden: list[float]
) -> list[str | None] | None:
    """Classificeer nekworp/rugworp per piek via pose (rtmlib), of None zonder rtmlib.

    Heuristiek v0.1.0 (te valideren op echte beelden — dáárvoor dient het
    evaluatierapport): rond de piek zoeken we de persoon met de polsen het
    hoogst boven de schouders (de werper houdt de bal boven het hoofd).
    - Polsen vóór de piek boven de schouders en erna eronder → voorwaartse
      zwaai → **nekworp**.
    - Polsen die pas óp/na de piek boven de schouders uitkomen (achterwaartse
      zwaai over het hoofd, ruggelings) → **rugworp**.
    - Anders (geen persoon, te lage keypoint-scores): None voor die piek.
    """
    Body = _laad_rtmlib()
    if Body is None:
        return None
    cv2 = _laad_cv2()
    body = Body(mode='balanced', backend='onnxruntime', device='cpu')
    cap = cv2.VideoCapture(str(videopad))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    def _pols_boven_schouder(frame) -> float | None:
        """Grootste 'polsen boven schouders'-marge (px) over alle personen, of None."""
        try:
            keypoints, scores = body(frame)
        except Exception:
            return None
        beste = None
        for persoon, score in zip(keypoints, scores):
            if min(score[_L_POLS], score[_R_POLS], score[_L_SCHOUDER], score[_R_SCHOUDER]) < 0.3:
                continue
            pols_y = min(persoon[_L_POLS][1], persoon[_R_POLS][1])
            schouder_y = min(persoon[_L_SCHOUDER][1], persoon[_R_SCHOUDER][1])
            marge = schouder_y - pols_y  # >0 = polsen boven de schouders (beeld-y daalt omhoog)
            if beste is None or marge > beste:
                beste = marge
        return beste

    def _frame_op(t: float):
        cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, round(t * fps)))
        ok, frame = cap.read()
        return frame if ok else None

    uit: list[str | None] = []
    for piek_t in piek_tijden:
        voor = _frame_op(piek_t - 0.4)
        na = _frame_op(piek_t + 0.4)
        marge_voor = _pols_boven_schouder(voor) if voor is not None else None
        marge_na = _pols_boven_schouder(na) if na is not None else None
        if marge_voor is None or marge_na is None:
            uit.append(None)
        elif marge_voor > 0 and marge_na <= 0:
            uit.append('nekworp')  # voorwaartse zwaai: van boven het hoofd naar voren/onder
        elif marge_voor <= 0 and marge_na > 0:
            uit.append('rugworp')  # achterwaartse zwaai: pas ná de piek over het hoofd
        else:
            uit.append(None)
    cap.release()
    return uit


# ---------------------------------------------------------------------------
# Demo-modus: de hele lus zonder video (weak labels + gecontroleerde ruis)
# ---------------------------------------------------------------------------


def demo_detecties(
    labels: list[dict],
    seed: int,
    jitter_s: float = 0.5,
    mis_fractie: float = 0.2,
    vals: int = 2,
    worptype_fout: float = 0.1,
) -> tuple[list[dict], dict]:
    """Simuleer detecties uit weak labels: jitter, gemiste worpen, valse positieven.

    Deterministisch via random.Random(seed) — zelfde seed = exact zelfde
    uitvoer. Het aantal weggelaten labels is exact round(mis_fractie × n) en
    het aantal valse positieven exact `vals` — exact bij GENERATIE; de
    metrieken van evaluate.py kunnen daar licht van afwijken wanneer jitter
    een event buiten het venster duwt of een valse positief toevallig naast
    een (weggelaten) label landt en daar terecht als match telt. `worptype_fout` wisselt bij dat deel van
    de overgenomen labels nekworp ↔ rugworp, zodat ook de verwarringsmatrix
    iets te zien krijgt. Geeft (events, rapport) terug.
    """
    rng = random.Random(seed)
    n = len(labels)
    n_weg = max(0, min(n, round(mis_fractie * n)))
    weggelaten = set(rng.sample(range(n), n_weg))

    events: list[dict] = []
    for i, label in enumerate(labels):
        if i in weggelaten:
            continue
        tijd = max(0.0, float(label['video_time_s']) + rng.gauss(0.0, jitter_s))
        worp_type = label.get('worp_type')
        if worp_type in ('nekworp', 'rugworp') and rng.random() < worptype_fout:
            worp_type = 'rugworp' if worp_type == 'nekworp' else 'nekworp'
        events.append(_demo_event(label.get('match_id'), tijd, worp_type, rng.uniform(0.5, 0.95)))

    max_tijd = max((float(l['video_time_s']) for l in labels), default=0.0)
    for _ in range(vals):
        tijd = rng.uniform(0.0, max_tijd + 30.0)
        worp_type = rng.choice(['nekworp', 'rugworp', None])
        events.append(_demo_event(labels[0].get('match_id') if labels else None,
                                  tijd, worp_type, rng.uniform(CONF_MIN, 0.5)))

    events.sort(key=lambda e: e['video_time_s'])
    return events, {'gelezen': n, 'weggelaten': n_weg, 'vals': vals}


def _demo_event(match_id, tijd: float, worp_type: str | None, confidence: float) -> dict:
    return maak_event(
        match_id=match_id,
        video_time_s=round(tijd, 3),
        frame=None,
        worp_type=worp_type,
        confidence=round(min(CONF_PLAFOND, max(CONF_MIN, confidence)), 3),
        model=MODEL_DEMO,
    )


# ---------------------------------------------------------------------------
# Event-JSON (brugcontract, zie cv/README.md) + I/O
# ---------------------------------------------------------------------------


def maak_event(
    match_id: int | None,
    video_time_s: float,
    frame: int | None,
    worp_type: str | None,
    confidence: float,
    model: str,
) -> dict:
    """Eén kandidaat-worp in het event-JSON van de brug (altijd event_type 'worp')."""
    return {
        'match_id': match_id,
        'video_time_s': video_time_s,
        'frame': frame,
        'event_type': 'worp',
        'worp_type': worp_type,
        # zone/afstand/speler/score blijven aan de match-engine en latere fases;
        # deze detector claimt enkel: "hier gebeurde (waarschijnlijk) een worp".
        'zone': None,
        'afstand_m': None,
        'speler': None,
        'score_delta': 0,
        'confidence': confidence,
        'provenance': {'model': model, 'model_version': MODEL_VERSION},
    }


def lees_jsonl(pad: Path) -> list[dict]:
    """Lees een JSONL-bestand (één event-object per regel; lege regels mogen)."""
    events = []
    for nummer, regel in enumerate(pad.read_text(encoding='utf-8').splitlines(), start=1):
        regel = regel.strip()
        if not regel:
            continue
        try:
            events.append(json.loads(regel))
        except json.JSONDecodeError as e:
            _fout(f'{pad}:{nummer}: ongeldige JSON ({e})')
    return events


def schrijf_jsonl(pad: Path, events: list[dict]) -> None:
    with pad.open('w', encoding='utf-8') as f:
        for event in events:
            f.write(json.dumps(event, ensure_ascii=False) + '\n')


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Detecteer kandidaat-worpen (bewegingsenergie, optioneel pose) → events-JSONL.'
    )
    parser.add_argument('video', type=Path, nargs='?', default=None,
                        help='wedstrijdvideo (mp4/webm/…); weglaten in --demo-modus')
    parser.add_argument('--match', type=int, default=None,
                        help='match-id voor de events (anders null; upload.py wil dan --match)')
    parser.add_argument('--uit', type=Path, default=None,
                        help='uitvoer-JSONL (standaard detecties[_match<id>].jsonl)')
    parser.add_argument('--fps', type=float, default=None,
                        help='extractie-fps van de frames-pipeline; vult frame = '
                             'round(video_time_s × fps) in (zoals sync.py)')
    # spotter-parameters
    parser.add_argument('--analyse-fps', type=float, default=10.0,
                        help='hoeveel frames per seconde de spotter bekijkt (standaard 10)')
    parser.add_argument('--glad', type=float, default=0.5,
                        help='venster van het lopend gemiddelde in seconden (standaard 0.5)')
    parser.add_argument('--k', type=float, default=3.0,
                        help='drempel = mediaan + k × MAD (standaard 3.0)')
    parser.add_argument('--min-afstand', type=float, default=4.0,
                        help='minimale afstand tussen pieken in seconden — een worpbeurt '
                             'duurt seconden (standaard 4.0)')
    parser.add_argument('--pose', action='store_true',
                        help='nekworp/rugworp classificeren via rtmlib (optioneel; '
                             'pip install -r cv/requirements-pose.txt)')
    # demo-parameters
    parser.add_argument('--demo', type=Path, default=None, metavar='LABELS_JSONL',
                        help='geen video: simuleer detecties uit een weak-labels-JSONL '
                             '(fase 0-sync) met jitter/misses/valse positieven')
    parser.add_argument('--seed', type=int, default=None,
                        help='verplicht bij --demo: seed voor random.Random, zodat elke '
                             'run exact reproduceerbaar is')
    parser.add_argument('--jitter', type=float, default=0.5,
                        help='demo: standaardafwijking (s) van de tijdsverstoring (0.5)')
    parser.add_argument('--mis-fractie', type=float, default=0.2,
                        help='demo: deel van de labels dat de "detector" mist (0.2)')
    parser.add_argument('--vals', type=int, default=2,
                        help='demo: aantal toegevoegde valse positieven (2)')
    parser.add_argument('--worptype-fout', type=float, default=0.1,
                        help='demo: deel van de overgenomen worpen met verwisseld '
                             'nekworp/rugworp (0.1)')
    args = parser.parse_args(argv)

    if (args.video is None) == (args.demo is None):
        _fout('geef óf een video óf --demo <labels.jsonl> op (precies één van beide)')

    if args.demo is not None:
        events = _draai_demo(args)
    else:
        events = _draai_video(args)

    match_ids = {e.get('match_id') for e in events if e.get('match_id') is not None}
    match_id = next(iter(match_ids)) if len(match_ids) == 1 else None
    uitpad = args.uit if args.uit is not None else Path(
        f'detecties_match{match_id}.jsonl' if match_id is not None else 'detecties.jsonl'
    )
    schrijf_jsonl(uitpad, events)
    # Het rapport ernaast: de app leest het uit om te tonen wat er écht gebeurd is (hoeveel
    # video bekeken, hoe fijn gekeken, hoeveel kandidaten). Zonder dat blijft "9 voorstellen"
    # een getal zonder betekenis.
    if _RAPPORT:
        _RAPPORT['kandidaten'] = len(events)
        uitpad.with_suffix(uitpad.suffix + '.rapport.json').write_text(
            json.dumps(_RAPPORT, ensure_ascii=False), encoding='utf-8')
    print(f'{len(events)} kandidaat-worpen → {uitpad}')
    if _RAPPORT.get('bekeken_s'):
        per_minuut = len(events) / max(1e-9, _RAPPORT['bekeken_s'] / 60)
        print(f'  {_RAPPORT["bekeken_s"] / 60:.1f} minuten bekeken bij {_RAPPORT["analyse_fps"]:g} '
              f'metingen/s → {per_minuut:.1f} kandidaten per minuut')
    if match_id is None:
        print('  let op: geen (eenduidige) match_id — geef bij upload.py --match mee')


def _draai_demo(args: argparse.Namespace) -> list[dict]:
    if args.seed is None:
        _fout('--demo vereist --seed (reproduceerbaarheid is de hele bedoeling)')
    if not args.demo.is_file():
        _fout(f'labels-bestand niet gevonden: {args.demo}')
    if not 0.0 <= args.mis_fractie < 1.0:
        _fout('--mis-fractie moet in [0, 1) liggen')
    if args.vals < 0:
        _fout('--vals kan niet negatief zijn')
    labels = lees_jsonl(args.demo)
    if not labels:
        _fout(f'{args.demo} bevat geen labels')
    for nummer, label in enumerate(labels, start=1):
        if not isinstance(label.get('video_time_s'), (int, float)):
            _fout(f'{args.demo}: label {nummer} mist een numerieke video_time_s')
    if args.match is not None:
        labels = [{**l, 'match_id': args.match} for l in labels]
    events, rapport = demo_detecties(
        labels, seed=args.seed, jitter_s=args.jitter,
        mis_fractie=args.mis_fractie, vals=args.vals, worptype_fout=args.worptype_fout,
    )
    # Zelfde frame-semantiek als sync.py: enkel bij expliciete --fps ingevuld.
    if args.fps is not None:
        for event in events:
            event['frame'] = round(event['video_time_s'] * args.fps)
    print(
        f'Demo (seed {args.seed}): {rapport["gelezen"]} labels gelezen, '
        f'{rapport["weggelaten"]} weggelaten (mis-fractie {args.mis_fractie:g}), '
        f'{rapport["vals"]} valse positieven toegevoegd, jitter σ={args.jitter:g} s'
    )
    return events


def _draai_video(args: argparse.Namespace) -> list[dict]:
    if not args.video.is_file():
        _fout(f'videobestand niet gevonden: {args.video}')
    for naam, waarde in (('--analyse-fps', args.analyse_fps), ('--glad', args.glad),
                         ('--min-afstand', args.min_afstand)):
        if waarde <= 0:
            _fout(f'{naam} moet groter zijn dan 0')

    print(f'Bewegingsenergie berekenen uit {args.video} (± {args.analyse_fps:g} fps) …')
    tijden, energie, _fps_bron = bereken_energie_video(args.video, args.analyse_fps)

    # Hoeveel van de video is er écht bekeken? Een opname die halverwege niet meer te lezen is,
    # levert een keurig ogende uitkomst over een kwart van de wedstrijd — zonder dit getal
    # merkt niemand dat.
    duur_bestand = duur_van_video(args.video)
    bekeken = (tijden[-1] - tijden[0]) if len(tijden) > 1 else 0.0
    _RAPPORT['bekeken_s'] = round(bekeken, 1)
    _RAPPORT['duur_s'] = None if duur_bestand is None else round(duur_bestand, 1)
    _RAPPORT['metingen'] = len(tijden)
    _RAPPORT['analyse_fps'] = args.analyse_fps
    if duur_bestand and bekeken < 0.9 * duur_bestand:
        print(f'  LET OP: slechts {bekeken / 60:.1f} van de {duur_bestand / 60:.1f} minuten '
              f'kon gelezen worden — de rest van de opname is niet bekeken.')

    # sample-afstand tussen de energiepunten (subsampling maakt hem ≥ 1/analyse_fps)
    stap_s = (tijden[-1] - tijden[0]) / (len(tijden) - 1) if len(tijden) > 1 else 1.0
    glad = glad_lopend_gemiddelde(energie, max(1, round(args.glad / stap_s)))
    drempel = adaptieve_drempel(glad, args.k)
    pieken = vind_pieken(glad, drempel=drempel,
                         min_afstand=max(1, round(args.min_afstand / stap_s)))
    piek_tijden = [tijden[i] for i, _ in pieken]

    worp_types: list[str | None] = [None] * len(pieken)
    model = MODEL_BASELINE
    plafond = CONF_PLAFOND_ZONDER_POSE
    if args.pose:
        geclassificeerd = classificeer_worp_types(args.video, piek_tijden)
        if geclassificeerd is None:
            print('Pose staat uit: rtmlib niet geïnstalleerd '
                  '(pip install -r cv/requirements-pose.txt) — worp_type blijft null.')
        else:
            worp_types, model, plafond = geclassificeerd, MODEL_MET_POSE, CONF_PLAFOND
    else:
        print('Pose staat uit (geen --pose) — worp_type blijft null.')

    confs = bereken_confidences([w for _, w in pieken], drempel, plafond)
    return [
        maak_event(
            match_id=args.match,
            video_time_s=round(t, 3),
            frame=round(t * args.fps) if args.fps is not None else None,
            worp_type=wt,
            confidence=conf,
            model=model,
        )
        for t, wt, conf in zip(piek_tijden, worp_types, confs)
    ]


if __name__ == '__main__':
    main()
