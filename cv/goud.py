#!/usr/bin/env python3
"""De gouden referentiewedstrijd: één commando dat de échte keten in meters afrekent.

Waarom dit bestaat
------------------
Elke module in cv/ wordt apart getest op verzonnen invoer, maar de fouten die pijn doen
zitten in de óverdracht tussen de lagen: een worp die de zoekpassage mist, een landing die
door de verkeerde matrix gaat, een uitbal die als doelpunt telt. Die zie je alleen door één
wedstrijd mét gekende waarheid door de vólledige keten te halen en het verschil te meten —
in meters en in worpen, niet in "de test slaagt".

Twee gezichten, één bestand:

1. **De maatlat** — video + labels erin, één rapport eruit::

       python3 cv/goud.py --video match.mp4 --labels labels.jsonl \
           --kalibratie kalibratie.json --uit rapport.json

   Draait de keten zoals de server dat doet (houding → bal → landing, via hun Python-API's,
   zonder subprocessen) en scoort per as:

   - **worpen**: precisie/recall/F1 (zelfde greedy koppeling als evaluate.py);
   - **moment**: mediaan |Δt| van de gekoppelde paren;
   - **landing**: mediaan en p90 van de afstand in meters tussen gemeten en gelabeld punt;
   - **worptype**: nekworp/rugworp-accuraatheid over paren met beide een type;
   - **uitbal**: hoe vaak een gelabelde uitbal als doelpunt gemeten werd (en omgekeerd) —
     dé verwarring die een score-afleiding corrumpeert.

   Ontbreekt het houdingsmodel (rtmlib), dan draait wat kán: de worpmomenten komen dan uit
   de labels zelf zodat de landing-as tóch gemeten wordt, en het rapport zegt eerlijk welke
   assen daardoor níét gemeten zijn. Geen stille gaten: elke niet-gemeten as staat benoemd,
   mét reden.

2. **De synthetische gouden wedstrijd** — een kunstwedstrijd waarvan wij de waarheid per
   constructie kennen::

       python3 cv/goud.py --maak-synthetisch map/           # vaste camera
       python3 cv/goud.py --maak-synthetisch map/ --pan     # pannende camera

   Rendert met cv2 een korte wedstrijd (±60 s): een veld met echte lijnen op de juiste
   plekken, een gekende camera (en dus een gekende homografie), spelers als bewegende
   rechthoeken met truitjeskleur, en een bal die volgens een echte parabool naar gekende
   landingspunten vliegt — met minstens één uitbal en één doelgebied-landing. De labels
   (zelfde JSONL-dialect als sync.py), het kalibratiebestand (zelfde JSON-dialect als
   calibrate.py) en bij --pan het homografiespoor (dialect van volg_veld.py) worden ernaast
   geschreven. Zo bewijst de maatlat zichzélf zonder echte beelden, en kan het geheel in CI.

De rekenkern (labels lezen, koppelen, per as scoren, het rapport vormen) is puur en wordt
zonder video getest; alleen het draaien van de keten en het renderen hebben cv2 nodig.
"""

from __future__ import annotations

import argparse
import datetime
import json
import math
import random
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))

import landing  # noqa: E402
import veld  # noqa: E402
from evaluate import WORP_EVENT_TYPES, WORP_TYPES, lees_jsonl, match_greedy  # noqa: E402

GOUD_VERSIE = '0.1.0'
RAPPORT_VERSIE = 1
STANDAARD_VENSTER_S = 2.0
# De assen waarop de maatlat afrekent — in deze volgorde in rapport en samenvatting.
ASSEN = ('worpen', 'moment', 'landing', 'worptype', 'uitbal')

# houding.worp_type zegt 'nek'/'rug', de labels van sync.py zeggen 'nekworp'/'rugworp'.
# De maatlat spreekt beide dialecten, anders telt élk juist worptype als fout.
_WORP_TYPE_ALIAS = {'nek': 'nekworp', 'rug': 'rugworp'}


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


# ---------------------------------------------------------------------------
# Rekenkern: puur, zonder video — labels vs detecties → cijfers per as
# ---------------------------------------------------------------------------


def _mediaan(waarden: list[float]) -> float | None:
    if not waarden:
        return None
    s = sorted(waarden)
    n = len(s)
    if n % 2:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


def _p90(waarden: list[float]) -> float | None:
    """Het 90e percentiel (nearest-rank): het cijfer dat "op één uitschieter na" dekt."""
    if not waarden:
        return None
    s = sorted(waarden)
    return s[min(len(s) - 1, max(0, math.ceil(0.9 * len(s)) - 1))]


def normaliseer_worp_type(waarde) -> str | None:
    """'nek'/'rug' (houding.py) en 'nekworp'/'rugworp' (labels) naar één spelling."""
    if waarde is None:
        return None
    tekst = str(waarde).strip().lower()
    tekst = _WORP_TYPE_ALIAS.get(tekst, tekst)
    return tekst if tekst in WORP_TYPES else None


def worp_labels_uit(labels: list[dict]) -> tuple[list[dict], int, int]:
    """Filter de labels tot worp-momenten, zoals evaluate.py dat doet.

    Twee dialecten zijn welkom: het sync.py-dialect (met event_type worp/vangst/doelpunt/
    buitenspel — allemaal worpen, enkel de afloop verschilt) én het platte dialect
    {video_time_s, x_m, y_m, worp_type, uitbal?} zonder event_type. Door een mens
    afgewezen voorstellen (verdict 'afgewezen') zijn per definitie géén worp.
    """
    bruikbaar: list[dict] = []
    genegeerd = 0
    afgewezen = 0
    for label in labels:
        soort = label.get('event_type')
        if soort is not None and soort not in WORP_EVENT_TYPES:
            genegeerd += 1
            continue
        if label.get('verdict') == 'afgewezen':
            afgewezen += 1
            continue
        bruikbaar.append(label)
    return bruikbaar, genegeerd, afgewezen


def label_punt(label: dict) -> tuple[float, float] | None:
    """Het gelabelde landingspunt in meters: uit zone{x_m,y_m} of plat x_m/y_m."""
    zone = label.get('zone')
    if isinstance(zone, dict):
        try:
            return float(zone['x_m']), float(zone['y_m'])
        except (KeyError, TypeError, ValueError):
            pass
    try:
        return float(label['x_m']), float(label['y_m'])
    except (KeyError, TypeError, ValueError):
        return None


def detectie_punt(detectie: dict) -> tuple[float, float] | None:
    """Het geméten landingspunt: de zone, of bij een uitbal het echte punt erbuiten."""
    zone = detectie.get('zone')
    if isinstance(zone, dict):
        try:
            return float(zone['x_m']), float(zone['y_m'])
        except (KeyError, TypeError, ValueError):
            pass
    try:
        return float(detectie['uitbal_x_m']), float(detectie['uitbal_y_m'])
    except (KeyError, TypeError, ValueError):
        return None


def label_is_uit(label: dict) -> bool:
    """Een gelabelde uitbal: het platte uitbal-veld, of event_type 'buitenspel' (sync.py)."""
    return bool(label.get('uitbal')) or label.get('event_type') == 'buitenspel'


def scoor_assen(labels: list[dict], detecties: list[dict], venster_s: float) -> dict:
    """Alle assen in één keer, puur: labels + detecties in, cijfers uit.

    De koppeling is dezelfde greedy één-op-één als evaluate.py (dichtstbijzijnde paar
    eerst), zodat de maatlat en het bestaande acceptatierapport dezelfde paren zien.
    ``per_worp`` geeft per label het volledige verhaal — daarmee is een ketenwijziging
    niet alleen in totalen maar per wórp af te rekenen (welke worp werd slechter?).
    """
    worp_labels, genegeerd, afgewezen = worp_labels_uit(labels)
    matches = match_greedy(
        [float(l['video_time_s']) for l in worp_labels],
        [float(d['video_time_s']) for d in detecties],
        venster_s,
    )
    detectie_bij_label = {li: (di, afwijking) for li, di, afwijking in matches}

    tp = len(matches)
    fp = len(detecties) - tp
    fn = len(worp_labels) - tp
    precision = tp / (tp + fp) if (tp + fp) > 0 else None
    recall = tp / (tp + fn) if (tp + fn) > 0 else None
    if precision is None or recall is None:
        f1 = None
    elif precision + recall == 0:
        f1 = 0.0
    else:
        f1 = 2 * precision * recall / (precision + recall)

    dts: list[float] = []
    landing_fouten: list[float] = []
    type_paren = 0
    type_juist = 0
    # Uitbal vs doelpunt: de verwarring die een score-afleiding echt corrumpeert.
    uit_labels_gekoppeld = 0
    uit_juist = 0
    uit_als_doelpunt = 0
    uit_als_veldworp = 0
    uit_zonder_meting = 0
    doelpunt_als_uitbal = 0

    per_worp: list[dict] = []
    for li, label in enumerate(worp_labels):
        rij: dict = {'label_t_s': round(float(label['video_time_s']), 3), 'gekoppeld': False}
        koppeling = detectie_bij_label.get(li)
        if koppeling is None:
            per_worp.append(rij)
            continue
        di, afwijking = koppeling
        detectie = detecties[di]
        rij['gekoppeld'] = True
        rij['dt_s'] = round(afwijking, 3)
        dts.append(afwijking)

        lp, dp = label_punt(label), detectie_punt(detectie)
        if lp is not None and dp is not None:
            fout = math.hypot(dp[0] - lp[0], dp[1] - lp[1])
            landing_fouten.append(fout)
            rij['landing_fout_m'] = round(fout, 2)

        lt = normaliseer_worp_type(label.get('worp_type'))
        dt_ = normaliseer_worp_type(detectie.get('worp_type'))
        rij['worp_type_label'] = lt
        rij['worp_type_gemeten'] = dt_
        if lt is not None and dt_ is not None:
            type_paren += 1
            type_juist += int(lt == dt_)

        det_zone = detectie.get('zone') if isinstance(detectie.get('zone'), dict) else None
        det_uit = bool(detectie.get('uitbal'))
        if label_is_uit(label):
            uit_labels_gekoppeld += 1
            rij['uitbal_label'] = True
            if det_uit:
                uit_juist += 1
                rij['uitbal_gemeten'] = 'uitbal'
            elif det_zone is not None and det_zone.get('in_doelgebied'):
                # Dít is de fout waar de klem-op-veld-regressie van leefde: over de
                # achterlijn en toch punten. Apart geteld, want hij vervalst de score.
                uit_als_doelpunt += 1
                rij['uitbal_gemeten'] = 'doelpunt'
            elif det_zone is not None:
                uit_als_veldworp += 1
                rij['uitbal_gemeten'] = 'veldworp'
            else:
                uit_zonder_meting += 1
                rij['uitbal_gemeten'] = None
        else:
            zone = label.get('zone')
            if isinstance(zone, dict) and zone.get('in_doelgebied') and det_uit:
                doelpunt_als_uitbal += 1
                rij['doelpunt_als_uitbal'] = True
        per_worp.append(rij)

    return {
        'venster_s': venster_s,
        'labels': len(worp_labels),
        'labels_genegeerd': genegeerd,
        'labels_afgewezen': afgewezen,
        'detecties': len(detecties),
        'worpen': {
            'tp': tp, 'fp': fp, 'fn': fn,
            'precision': precision, 'recall': recall, 'f1': f1,
        },
        'moment': {
            'paren': len(dts),
            'mediaan_dt_s': _mediaan(dts),
            'p90_dt_s': _p90(dts),
        },
        'landing': {
            'paren': len(landing_fouten),
            'mediaan_m': _mediaan(landing_fouten),
            'p90_m': _p90(landing_fouten),
        },
        'worptype': {
            'paren': type_paren,
            'accuraatheid': type_juist / type_paren if type_paren else None,
        },
        'uitbal': {
            'uit_labels': sum(1 for l in worp_labels if label_is_uit(l)),
            'uit_labels_gekoppeld': uit_labels_gekoppeld,
            'juist_uit': uit_juist,
            'als_doelpunt_gemeten': uit_als_doelpunt,
            'als_veldworp_gemeten': uit_als_veldworp,
            'zonder_meting': uit_zonder_meting,
            'doelpunt_als_uitbal_gemeten': doelpunt_als_uitbal,
        },
        'per_worp': per_worp,
    }


# ---------------------------------------------------------------------------
# De keten draaien zoals de server: houding → bal → landing (Python-API's)
# ---------------------------------------------------------------------------


def _pseudo_detecties_uit_labels(worp_labels: list[dict], match_id: int | None) -> list[dict]:
    """Worpmomenten uit de labels overnemen wanneer het houdingsmodel niet kan draaien.

    Alleen de tíjdstippen gaan mee — geen worptype en geen zone, anders zou de maatlat
    zijn eigen waarheid naspreken en zouden de niet-gemeten assen perfect "scoren".
    """
    return [
        {
            'match_id': match_id,
            'video_time_s': float(l['video_time_s']),
            'frame': None,
            'event_type': 'worp',
            'worp_type': None,
            'zone': None,
            'afstand_m': None,
            'speler': None,
            'score_delta': 0,
            'confidence': None,
            'provenance': {'model': 'worpmomenten-uit-labels', 'model_version': GOUD_VERSIE},
        }
        for l in worp_labels
    ]


def _draai_houding(args) -> tuple[list[dict] | None, str | None, dict]:
    """De worp-detectie (houding.py) via de Python-API, of de reden waarom niet.

    rtmlib is de enige zware afhankelijkheid van de keten; ontbreekt hij, dan meldt de
    maatlat dat als niet-gemeten as in plaats van te sneuvelen — de rest meet gewoon door.
    """
    if args.zonder_houding:
        return None, 'overgeslagen (--zonder-houding): worpmomenten uit de labels overgenomen', {}
    try:
        import rtmlib  # noqa: F401, PLC0415
    except ImportError:
        return None, 'houdingsmodel (rtmlib) ontbreekt: worpmomenten uit de labels overgenomen', {}

    import houding  # noqa: PLC0415

    model = houding.laad_model(args.mode)
    getraind = houding.laad_instellingen()
    drempel = getraind['drempel'] if getraind else houding.DREMPEL_SCORE
    min_afstand = getraind['min_afstand_s'] if getraind else houding.MIN_AFSTAND_S
    reeks = houding.meet_video(args.video, model, args.analyse_fps, tot=args.tot)
    momenten = houding.vind_worpmomenten(reeks, drempel, min_afstand)
    events = houding.maak_events(momenten, reeks, args.match, drempel)
    info = {'analyse_fps': args.analyse_fps, 'mode': args.mode, 'drempel': drempel,
            'min_afstand_s': min_afstand, 'metingen': len(reeks)}
    return events, None, info


def _draai_bal(args, detecties: list[dict], balbanen_pad: Path) -> int:
    """De balbaan-stap (bal.py) via de Python-API: één baan per worp, naar een JSONL.

    Zelfde volgorde als de server (bouwStappen in src/lib/cv-analyse.ts): eerst bal.py,
    daarna landing.py met --balbanen. Bij een bewegende camera gaat het homografiespoor
    mee, zodat de kandidaten eerst in één stelsel gezet worden.
    """
    import bal  # noqa: PLC0415

    rondes = args.rondes if args.rondes is not None else bal.RONDES
    matrix_op = None
    if args.homografie is not None:
        from volg_veld import HomografieSpoor  # noqa: PLC0415
        spoor = HomografieSpoor.lees(args.homografie)
        if spoor.punten:
            matrix_op = spoor.op
    banen = []
    for detectie in detecties:
        t = detectie.get('video_time_s')
        if t is None:
            continue
        baan = bal.baan_rond_worp(args.video, float(t), na_s=args.venster_einde,
                                  rondes=rondes, matrix_op=matrix_op)
        if baan is not None:
            banen.append(baan)
    with balbanen_pad.open('w', encoding='utf-8') as f:
        for baan in banen:
            f.write(json.dumps(baan, ensure_ascii=False) + '\n')
    return len(banen)


def draai_maatlat(args) -> dict:
    """De hele maatlat: keten draaien, scoren, rapport bouwen (nog niet wegschrijven)."""
    alle_labels = lees_jsonl(args.labels)
    worp_labels, _, _ = worp_labels_uit(alle_labels)
    if not worp_labels:
        _fout(f'{args.labels} bevat geen worp-labels — zonder waarheid valt er niets af te rekenen')

    niet_gemeten: dict[str, str] = {}
    keten: dict = {}

    # Stap 1 — worpen zoeken aan de houding (het echte begin van de keten).
    detecties, reden, houding_info = _draai_houding(args)
    if detecties is None:
        detecties = _pseudo_detecties_uit_labels(worp_labels, args.match)
        keten['houding'] = {'gedraaid': False, 'reden': reden}
        # Detecties die uit de labels zelf komen kúnnen deze assen niet meten: de
        # koppeling zou triviaal perfect zijn en niets over de keten zeggen.
        for as_ in ('worpen', 'moment', 'worptype'):
            niet_gemeten[as_] = reden
    else:
        keten['houding'] = {'gedraaid': True, 'detecties': len(detecties), **houding_info}

    # Stap 2 + 3 — bal volgen en landing projecteren; alleen mogelijk met een kalibratie.
    if args.kalibratie is None:
        reden = 'geen --kalibratie: zonder homografie is er geen projectie naar veldmeters'
        keten['bal'] = {'gedraaid': False, 'reden': reden}
        keten['landing'] = {'gedraaid': False, 'reden': reden}
        niet_gemeten['landing'] = reden
        niet_gemeten['uitbal'] = reden
        verrijkt = detecties
    else:
        # De balbanen zijn een tussenproduct (landing.py leest ze als bestand); ze
        # leven in een tijdelijke map die na de meting weer verdwijnt.
        werkmap = Path(tempfile.mkdtemp(prefix='goud-'))
        try:
            balbanen_pad = args.balbanen
            if balbanen_pad is None and not args.zonder_balbanen:
                balbanen_pad = werkmap / 'balbanen.jsonl'
                aantal = _draai_bal(args, detecties, balbanen_pad)
                keten['bal'] = {'gedraaid': True, 'banen': aantal}
            elif balbanen_pad is not None:
                keten['bal'] = {'gedraaid': False, 'reden': f'balbanen aangeleverd: {balbanen_pad}'}
            else:
                keten['bal'] = {'gedraaid': False, 'reden': 'overgeslagen (--zonder-balbanen)'}
            landing_args = SimpleNamespace(
                video=args.video, homografie=args.homografie, kalibratie=args.kalibratie,
                balbanen=balbanen_pad, balspoor=None,
                diepte=args.diepte, breedte=args.breedte, speelveld=args.speelveld,
                venster_start=args.venster_start, venster_einde=args.venster_einde,
                bal_min_px=args.bal_min_px, bal_max_px=args.bal_max_px,
            )
            verrijkt, landing_rapport = landing.video_landing(landing_args, detecties)
            keten['landing'] = {'gedraaid': True, **landing_rapport}
        finally:
            import shutil  # noqa: PLC0415
            shutil.rmtree(werkmap, ignore_errors=True)

    assen = scoor_assen(alle_labels, verrijkt, args.venster)
    return {
        'versie': RAPPORT_VERSIE,
        'gemaakt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'video': str(args.video),
        'labels_bestand': str(args.labels),
        'kalibratie': str(args.kalibratie) if args.kalibratie else None,
        'homografie': str(args.homografie) if args.homografie else None,
        'keten': keten,
        'assen': assen,
        # Eerlijkheid vóór volledigheid: wat hier staat is níét gemeten, mét reden —
        # een lezer mag een ontbrekend cijfer nooit voor een goed cijfer aanzien.
        'niet_gemeten': niet_gemeten,
    }


def _getal(waarde: float | None, decimalen: int = 3) -> str:
    return 'n.v.t.' if waarde is None else f'{waarde:.{decimalen}f}'


def druk_samenvatting(rapport: dict) -> None:
    """De leesbare kant van het rapport: per as één regel, plus wat er niet gemeten is."""
    assen = rapport['assen']
    niet = rapport['niet_gemeten']
    w, m, l, wt, u = (assen['worpen'], assen['moment'], assen['landing'],
                      assen['worptype'], assen['uitbal'])
    print('Gouden referentiewedstrijd — rapport '
          f'({assen["labels"]} worp-labels, {assen["detecties"]} detecties, '
          f'venster ±{assen["venster_s"]:g} s)')

    def regel(as_: str, tekst: str) -> None:
        if as_ in niet:
            print(f'  {as_:9s} NIET GEMETEN — {niet[as_]}')
        else:
            print(f'  {as_:9s} {tekst}')

    regel('worpen', f'precisie {_getal(w["precision"])} · recall {_getal(w["recall"])} · '
                    f'F1 {_getal(w["f1"])}  (tp {w["tp"]} · fp {w["fp"]} · fn {w["fn"]})')
    regel('moment', f'mediaan |Δt| {_getal(m["mediaan_dt_s"], 2)} s · '
                    f'p90 {_getal(m["p90_dt_s"], 2)} s  (over {m["paren"]} paren)')
    regel('landing', f'mediaan {_getal(l["mediaan_m"], 2)} m · p90 {_getal(l["p90_m"], 2)} m  '
                     f'(over {l["paren"]} paren)')
    regel('worptype', f'accuraatheid {_getal(wt["accuraatheid"])}  (over {wt["paren"]} paren)')
    regel('uitbal', f'{u["uit_labels"]} uitbal-label(s): {u["juist_uit"]} juist als uitbal, '
                    f'{u["als_doelpunt_gemeten"]} als DOELPUNT gemeten, '
                    f'{u["als_veldworp_gemeten"]} als veldworp, {u["zonder_meting"]} zonder meting; '
                    f'{u["doelpunt_als_uitbal_gemeten"]} doelpunt(en) als uitbal gemeten')
    if 'landing' not in niet and l['paren'] == 0:
        print('  LET OP: geen enkel gekoppeld paar had een gemeten én gelabeld landingspunt — '
              'de landing-as is gedraaid maar leeg (bal niet gezien?).')


# ---------------------------------------------------------------------------
# De synthetische gouden wedstrijd: gekende camera, gekende worpen, gekende waarheid
# ---------------------------------------------------------------------------

# Beeldmaat en camera. De camera staat hoog naast de zijlijn ter hoogte van de middellijn —
# het standaardprotocol uit veld.aanbevolen_labels('zijlijn'): alle 14 kruispunten zichtbaar.
SYNT_BEELD = (960, 540)
SYNT_FPS = 25.0
SYNT_DUUR_S = 60.0
_CAMERA_POS = (-25.0, 23.0, 14.0)  # (x, y, hoogte) in veldmeters; x<0 = naast de linkerzijlijn
_CAMERA_F = 560.0  # brandpunt in pixels — gekozen zodat het hele veld in 960×540 past
_PAN_AMPLITUDE_M = 4.0  # hoe ver het kijkdoel bij --pan langs de lengteas zwaait
_PAN_PERIODE_S = 20.0
_WERP_HOOGTE_M = 2.0  # loslaathoogte — dezelfde aanname als landing.WERP_HOOGTE_M
_VLUCHT_S = 2.0  # vluchtduur per worp: op het frameraster (25 fps), en < venster_einde (6 s)
_ZWAARTEKRACHT = 9.81

# Het worpenschema: van → naar in veldmeters, met bewust minstens één uitbal (over de
# zijlijn én over de achterlijn) en minstens één landing in élk doelgebied. De eerste worp
# is er meteen één in het doelgebied, zodat ook een korte (CI-)wedstrijd van ±10 s de
# kernmeting bevat. Elke 8 s één worp: ruim buiten het zoekvenster van landing.py (6 s),
# zodat de bal van worp n nooit in het venster van worp n−1 opduikt.
_WORP_SJABLONEN = (
    {'van': (10.0, 20.0), 'naar': (8.0, 42.8), 'worp_type': 'rugworp'},   # doelgebied uit
    {'van': (4.0, 18.0), 'naar': (15.6, 30.0), 'worp_type': 'nekworp'},   # uitbal zijlijn
    {'van': (7.0, 30.0), 'naar': (6.0, 12.0), 'worp_type': 'nekworp'},    # veldworp
    {'van': (8.0, 26.0), 'naar': (7.0, 3.6), 'worp_type': 'nekworp'},     # doelgebied thuis
    {'van': (3.0, 16.0), 'naar': (10.0, 33.0), 'worp_type': 'rugworp'},   # veldworp
    {'van': (11.0, 34.0), 'naar': (7.5, 47.2), 'worp_type': 'rugworp'},   # uitbal achterlijn
    {'van': (7.0, 22.0), 'naar': (2.5, 38.5), 'worp_type': 'nekworp'},    # veldworp
)
_EERSTE_WORP_S = 3.0
_WORP_INTERVAL_S = 8.0
# Spelers staan stil zolang er een bal vliegt (ze kijken ernaar — en belangrijker: zo is
# de bal de enige beweging in de zoekvensters van bal.py en landing.py, net als de blob-
# filters bedoelen). Ze bewegen weer zodra ook het zoekvenster (6 s) voorbij is.
_BEVRIES_VOOR_S = 0.5
_BEVRIES_NA_S = 6.8

# Zes spelers: drie rode en drie blauwe rechthoeken, elk met een eigen slingerbeweging.
_SPELERS = (
    {'basis': (3.0, 12.0), 'kleur': (40, 40, 200)},
    {'basis': (11.0, 15.0), 'kleur': (40, 40, 200)},
    {'basis': (6.5, 19.0), 'kleur': (40, 40, 200)},
    {'basis': (4.0, 30.0), 'kleur': (200, 90, 40)},
    {'basis': (10.5, 32.0), 'kleur': (200, 90, 40)},
    {'basis': (7.5, 40.5), 'kleur': (200, 90, 40)},
)
_GRAS = (45, 105, 55)  # BGR
_LIJN = (245, 245, 245)
_BAL_KLEUR = (250, 250, 250)
_BAL_STRAAL_PX = 6  # doorsnede 12 px: binnen de balfilters van bal.py (4–40) en landing.py (6–60)


def _norm(v: tuple[float, float, float]) -> tuple[float, float, float]:
    lengte = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    return (v[0] / lengte, v[1] / lengte, v[2] / lengte)


def _kruis(a, b) -> tuple[float, float, float]:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def synthetische_camera(t: float = 0.0, pan: bool = False) -> dict:
    """De gekende camera op moment t: rotatierijen, standpunt en intrinsieken.

    Bij --pan draait de camera (vanaf een vast standpunt) langzaam heen en weer langs de
    lengteas van het veld — precies de beweging waarvoor volg_veld.py/bal.py bestaan.
    """
    c = _CAMERA_POS
    doel_y = 23.0 + (_PAN_AMPLITUDE_M * math.sin(2.0 * math.pi * t / _PAN_PERIODE_S) if pan else 0.0)
    doel = (7.0, doel_y, 0.0)
    voorwaarts = _norm((doel[0] - c[0], doel[1] - c[1], doel[2] - c[2]))
    rechts = _norm(_kruis(voorwaarts, (0.0, 0.0, 1.0)))
    omlaag = _kruis(voorwaarts, rechts)  # wijst omlaag: beeld-y loopt naar beneden
    breedte_px, hoogte_px = SYNT_BEELD
    return {
        'rijen': (rechts, omlaag, voorwaarts),
        'c': c,
        'f': _CAMERA_F,
        'cx': breedte_px / 2.0,
        'cy': hoogte_px / 2.0,
    }


def projecteer_3d(camera: dict, punt: tuple[float, float, float]) -> tuple[float, float] | None:
    """Een 3D-veldpunt (meters, z omhoog) naar beeldpixels — None achter de camera."""
    c = camera['c']
    d = (punt[0] - c[0], punt[1] - c[1], punt[2] - c[2])
    rijen = camera['rijen']
    xc = rijen[0][0] * d[0] + rijen[0][1] * d[1] + rijen[0][2] * d[2]
    yc = rijen[1][0] * d[0] + rijen[1][1] * d[1] + rijen[1][2] * d[2]
    zc = rijen[2][0] * d[0] + rijen[2][1] * d[1] + rijen[2][2] * d[2]
    if zc < 0.1:
        return None
    return (camera['cx'] + camera['f'] * xc / zc, camera['cy'] + camera['f'] * yc / zc)


def homografie_veld_naar_beeld(camera: dict) -> list[list[float]]:
    """De exacte grondvlak-homografie veld(m) → beeld(px) van deze camera.

    Voor grondpunten (z=0) is de volledige projectie precies een homografie: de kolommen
    zijn de eerste twee rotatiekolommen en −R·C, geschaald met de intrinsieken.
    """
    rijen = camera['rijen']
    c = camera['c']
    a = [[rijen[i][0], rijen[i][1], -(rijen[i][0] * c[0] + rijen[i][1] * c[1] + rijen[i][2] * c[2])]
         for i in range(3)]
    k = [[camera['f'], 0.0, camera['cx']], [0.0, camera['f'], camera['cy']], [0.0, 0.0, 1.0]]
    return [[sum(k[i][m] * a[m][j] for m in range(3)) for j in range(3)] for i in range(3)]


def _inverteer_3x3(m: list[list[float]]) -> list[list[float]]:
    (a, b, c), (d, e, f), (g, h, i) = m
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-15:
        raise ValueError('homografie is singulier — dat kan bij een echte camera niet')
    adj = [
        [e * i - f * h, c * h - b * i, b * f - c * e],
        [f * g - d * i, a * i - c * g, c * d - a * f],
        [d * h - e * g, b * g - a * h, a * e - b * d],
    ]
    return [[w / det for w in rij] for rij in adj]


def homografie_beeld_naar_veld(camera: dict) -> list[list[float]]:
    """De inverse — het dialect van calibrate.py (matrix_beeld_naar_veld), genormaliseerd."""
    m = _inverteer_3x3(homografie_veld_naar_beeld(camera))
    schaal = m[2][2] if abs(m[2][2]) > 1e-15 else 1.0
    return [[w / schaal for w in rij] for rij in m]


def bal_positie(worp: dict, t: float) -> tuple[float, float, float] | None:
    """Waar de bal op moment t hangt: rechtlijnig over de grond, parabolisch in de hoogte.

    De bal verlaat de hand op 2 m (dezelfde loslaathoogte als landing.py aanneemt) en raakt
    de grond exact op ``landing_t`` — echte valversnelling, dus ook in beeld een echte
    parabool: precies wat bal.py's RANSAC hoort te herkennen.
    """
    tt = t - worp['t']
    if tt < 0.0 or tt > worp['T'] + 1e-9:
        return None
    duur = worp['T']
    (x0, y0), (x1, y1) = worp['van'], worp['naar']
    aandeel = tt / duur
    v0 = (0.5 * _ZWAARTEKRACHT * duur * duur - _WERP_HOOGTE_M) / duur
    z = _WERP_HOOGTE_M + v0 * tt - 0.5 * _ZWAARTEKRACHT * tt * tt
    return (x0 + aandeel * (x1 - x0), y0 + aandeel * (y1 - y0), max(0.0, z))


def worpen_plan(
    duur_s: float,
    diepte_m: float = veld.STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte_m: float = veld.BREEDTE_M,
    speelveld_m: float = veld.SPEELVELD_LENGTE_M,
) -> list[dict]:
    """Het worpenschema dat in ``duur_s`` seconden past, met de waarheid per worp erbij."""
    lengte = veld.totale_lengte_m(diepte_m, speelveld_m)
    plan: list[dict] = []
    for i, sjabloon in enumerate(_WORP_SJABLONEN):
        t = _EERSTE_WORP_S + _WORP_INTERVAL_S * i
        if t + _VLUCHT_S + 1.0 > duur_s:
            break
        x, y = sjabloon['naar']
        buiten = max(-x, x - breedte_m, -y, y - lengte, 0.0) > landing.KLEM_TOLERANTIE_M
        in_doel = (not buiten) and veld.in_doelgebied(
            y / lengte, diepte_m, x_norm=x / breedte_m, speelveld_m=speelveld_m)
        plan.append({
            't': t, 'T': _VLUCHT_S, 'landing_t': t + _VLUCHT_S,
            'van': sjabloon['van'], 'naar': sjabloon['naar'],
            'worp_type': sjabloon['worp_type'],
            'uitbal': buiten, 'in_doelgebied': in_doel,
        })
    return plan


def _label_van_worp(worp: dict, fps: float, diepte_m: float,
                    breedte_m: float, speelveld_m: float) -> dict:
    """Eén worp uit het plan → een label in het sync.py-dialect (plus de platte velden)."""
    x, y = worp['naar']
    if worp['uitbal']:
        soort, zone, score = 'buitenspel', None, 0
    else:
        zone, score = landing.zone_en_score(x, y, worp['worp_type'], diepte_m,
                                            breedte_m, speelveld_m)
        soort = 'doelpunt' if zone['in_doelgebied'] else 'worp'
    return {
        'match_id': 0,
        'video_time_s': round(worp['t'], 3),
        'frame': round(worp['t'] * fps),
        'event_type': soort,
        'worp_type': worp['worp_type'],
        'zone': zone,
        # Het platte dialect erbovenop: zo leest élke afnemer (ook de maatlat zelf) het
        # landingspunt, óók van een uitbal — die heeft per definitie geen zone.
        'x_m': round(x, 2),
        'y_m': round(y, 2),
        'uitbal': worp['uitbal'],
        'landing_time_s': round(worp['landing_t'], 3),
        'afstand_m': None,
        'speler': None,
        'score_delta': score,
        'confidence': 1.0,
        'provenance': {'model': 'synthetische-goudwedstrijd', 'model_version': GOUD_VERSIE},
    }


def _schrijf_kalibratie(pad: Path, camera: dict, diepte_m: float,
                        breedte_m: float, speelveld_m: float) -> list[list[float]]:
    """Het kalibratiebestand in het dialect van calibrate.schrijf_kalibratie.

    De punten zijn de 14 échte kruispunten, exact geprojecteerd — een kalibratie zoals een
    foutloze aanklikker ze zou maken. Het standpunt is het échte camerastandpunt, zodat ook
    de loslaathoogte-parallaxcorrectie van landing.py met de waarheid rekent.
    """
    import calibrate  # noqa: PLC0415

    punten = []
    for k in veld.kruispunten(diepte_m, breedte_m, speelveld_m):
        beeld = projecteer_3d(camera, (k.x_m, k.y_m, 0.0))
        if beeld is None:
            raise ValueError(f'kruispunt {k.label} ligt achter de camera — camera-opstelling deugt niet')
        punten.append({'label': k.label, 'beeld_px': [round(beeld[0], 2), round(beeld[1], 2)],
                       'veld_m': [k.x_m, k.y_m]})
    matrix = homografie_beeld_naar_veld(camera)
    # Zelfcontrole met de bestaande toetsen: een gespiegelde of ontaarde "gouden" kalibratie
    # zou elke meting erop waardeloos maken zonder dat iemand het merkt.
    if calibrate.orientatie_det(matrix, punten) >= 0:
        raise ValueError('synthetische kalibratie staat in spiegelbeeld — bug in de cameraopbouw')
    data = {
        'versie': 1,
        'aangemaakt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'beeld': {'pad': None},
        'veld': {
            'doelgebied_diepte_m': diepte_m,
            'breedte_m': breedte_m,
            'speelveld_m': speelveld_m,
            'totale_lengte_m': veld.totale_lengte_m(diepte_m, speelveld_m),
        },
        'punten': punten,
        'matrix_beeld_naar_veld': matrix,
        'precisie_m_per_px': calibrate.precisiekaart(matrix, diepte_m, breedte_m, speelveld_m),
        'camerapositie': 'zijlijn',
        'camerastandpunt': {
            'gemeten': {'x_m': _CAMERA_POS[0], 'y_m': _CAMERA_POS[1],
                        'hoogte_m': _CAMERA_POS[2], 'brandpunt_px': _CAMERA_F},
            'oordeel': 'klopt',
        },
    }
    pad.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return matrix


def _teken_veld(cv2, frame, camera: dict, diepte_m: float, breedte_m: float, lengte_m: float) -> None:
    """De echte veldlijnen: 7 dwarslijnen en 2 zijlijnen, geprojecteerd door de camera."""
    dwars = (0.0, diepte_m, diepte_m + veld.VRIJEWORP_OFFSET_M, lengte_m / 2.0,
             lengte_m - diepte_m - veld.VRIJEWORP_OFFSET_M, lengte_m - diepte_m, lengte_m)
    lijnen = [((0.0, y), (breedte_m, y)) for y in dwars]
    lijnen += [((x, 0.0), (x, lengte_m)) for x in (0.0, breedte_m)]
    for (x0, y0), (x1, y1) in lijnen:
        a = projecteer_3d(camera, (x0, y0, 0.0))
        b = projecteer_3d(camera, (x1, y1, 0.0))
        if a is None or b is None:
            continue
        cv2.line(frame, (int(round(a[0])), int(round(a[1]))),
                 (int(round(b[0])), int(round(b[1]))), _LIJN, 2, cv2.LINE_AA)


def _teken_speler(cv2, frame, camera: dict, positie: tuple[float, float], kleur) -> None:
    """Eén speler: een rechthoek van truitjeskleur, met de voeten óp zijn veldpunt."""
    voet = projecteer_3d(camera, (positie[0], positie[1], 0.0))
    kop = projecteer_3d(camera, (positie[0], positie[1], 1.85))
    if voet is None or kop is None:
        return
    hoogte = max(8.0, voet[1] - kop[1])
    halve_breedte = max(3, int(round(hoogte * 0.13)))
    cv2.rectangle(frame,
                  (int(round(voet[0])) - halve_breedte, int(round(kop[1]))),
                  (int(round(voet[0])) + halve_breedte, int(round(voet[1]))),
                  kleur, -1)


def maak_synthetisch(
    map_pad: Path,
    duur_s: float = SYNT_DUUR_S,
    fps: float = SYNT_FPS,
    pan: bool = False,
    seed: int = 7,
    diepte_m: float = veld.STANDAARD_DOELGEBIED_DIEPTE_M,
) -> dict:
    """Render de synthetische gouden wedstrijd en schrijf video, labels en kalibratie.

    Alles is deterministisch (de seed stuurt alleen de slingerbewegingen van de spelers),
    dus twee runs geven byte-voor-byte dezelfde labels — en CI kan erop bouwen.
    """
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    breedte_m, speelveld_m = veld.BREEDTE_M, veld.SPEELVELD_LENGTE_M
    lengte_m = veld.totale_lengte_m(diepte_m, speelveld_m)
    plan = worpen_plan(duur_s, diepte_m, breedte_m, speelveld_m)
    if not plan:
        _fout(f'--duur {duur_s:g} s is te kort voor ook maar één worp (minstens '
              f'{_EERSTE_WORP_S + _VLUCHT_S + 1.0:g} s nodig)')

    map_pad.mkdir(parents=True, exist_ok=True)
    breedte_px, hoogte_px = SYNT_BEELD

    # De video. mp4v is overal in opencv aanwezig; mocht dat hier toch niet zo zijn,
    # dan valt de schrijver terug op MJPG in een .avi — de keten leest beide.
    videopad = map_pad / 'wedstrijd.mp4'
    schrijver = cv2.VideoWriter(str(videopad), cv2.VideoWriter_fourcc(*'mp4v'),
                                fps, (breedte_px, hoogte_px))
    if not schrijver.isOpened():
        videopad = map_pad / 'wedstrijd.avi'
        schrijver = cv2.VideoWriter(str(videopad), cv2.VideoWriter_fourcc(*'MJPG'),
                                    fps, (breedte_px, hoogte_px))
        if not schrijver.isOpened():
            _fout('opencv kan geen video schrijven (mp4v noch MJPG) — controleer de installatie')

    # Slingerbewegingen per speler; de seed maakt ze reproduceerbaar.
    rng = random.Random(seed)
    slingers = [{'ax': rng.uniform(0.8, 1.6), 'ay': rng.uniform(0.8, 1.6),
                 'wx': 2.0 * math.pi / rng.uniform(7.0, 13.0),
                 'wy': 2.0 * math.pi / rng.uniform(7.0, 13.0),
                 'fx': rng.uniform(0.0, 6.28), 'fy': rng.uniform(0.0, 6.28)}
                for _ in _SPELERS]
    bevries = [(w['t'] - _BEVRIES_VOOR_S, w['t'] + _BEVRIES_NA_S) for w in plan]

    def bevroren(t: float) -> bool:
        return any(a <= t <= b for a, b in bevries)

    aantal_frames = int(round(duur_s * fps))
    speler_t = 0.0  # de "beleefde" tijd van de spelers: staat stil zolang de bal vliegt
    stap = 1.0 / fps
    for i in range(aantal_frames):
        t = i / fps
        if not bevroren(t):
            speler_t += stap
        camera = synthetische_camera(t, pan=pan)
        frame = np.full((hoogte_px, breedte_px, 3), _GRAS, np.uint8)
        _teken_veld(cv2, frame, camera, diepte_m, breedte_m, lengte_m)
        for speler, slinger in zip(_SPELERS, slingers):
            bx, by = speler['basis']
            pos = (bx + slinger['ax'] * math.sin(slinger['wx'] * speler_t + slinger['fx']),
                   by + slinger['ay'] * math.sin(slinger['wy'] * speler_t + slinger['fy']))
            _teken_speler(cv2, frame, camera, pos, speler['kleur'])
        # De bal het laatst: hij hoort óver de spelers heen zichtbaar te zijn.
        for worp in plan:
            positie = bal_positie(worp, t)
            if positie is None:
                continue
            beeld = projecteer_3d(camera, positie)
            if beeld is not None:
                cv2.circle(frame, (int(round(beeld[0])), int(round(beeld[1]))),
                           _BAL_STRAAL_PX, _BAL_KLEUR, -1, cv2.LINE_AA)
        schrijver.write(frame)
    schrijver.release()

    # De waarheid ernaast: labels (sync.py-dialect + platte velden) …
    labelspad = map_pad / 'labels.jsonl'
    with labelspad.open('w', encoding='utf-8') as f:
        for worp in plan:
            f.write(json.dumps(_label_van_worp(worp, fps, diepte_m, breedte_m, speelveld_m),
                               ensure_ascii=False) + '\n')

    # … de kalibratie op t=0 (dialect van calibrate.py; bij --pan is dit het ijkbeeld op 0) …
    kalibratiepad = map_pad / 'kalibratie.json'
    _schrijf_kalibratie(kalibratiepad, synthetische_camera(0.0, pan=pan),
                        diepte_m, breedte_m, speelveld_m)

    # … en bij --pan het homografiespoor per moment, in het dialect van volg_veld.py.
    homografiepad = None
    if pan:
        homografiepad = map_pad / 'homografie.jsonl'
        with homografiepad.open('w', encoding='utf-8') as f:
            t = 0.0
            while t <= duur_s + 1e-9:
                h = homografie_beeld_naar_veld(synthetische_camera(t, pan=True))
                f.write(json.dumps({'t': round(t, 3),
                                    'H': [[round(w, 9) for w in rij] for rij in h],
                                    'fout_m': 0.0, 'bron': 'ijkbeeld'}) + '\n')
                t += 0.1

    print(f'Synthetische gouden wedstrijd ({duur_s:g} s, {fps:g} fps'
          + (', pannende camera' if pan else ', vaste camera') + f') → {map_pad}')
    print(f'  {len(plan)} worpen, waarvan {sum(1 for w in plan if w["uitbal"])} uitbal '
          f'en {sum(1 for w in plan if w["in_doelgebied"])} in een doelgebied')
    print(f'  video      {videopad.name}')
    print(f'  labels     {labelspad.name}')
    print(f'  kalibratie {kalibratiepad.name}')
    if homografiepad is not None:
        print(f'  homografie {homografiepad.name}')
    print('Maatlat draaien: python3 cv/goud.py'
          f' --video {videopad} --labels {labelspad} --kalibratie {kalibratiepad}'
          + (f' --homografie {homografiepad}' if homografiepad is not None else '')
          + ' --uit rapport.json')
    return {
        'video': videopad, 'labels': labelspad, 'kalibratie': kalibratiepad,
        'homografie': homografiepad, 'worpen': plan, 'duur_s': duur_s, 'fps': fps,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Gouden referentiewedstrijd: de echte CV-keten afrekenen in meters en '
                    'worpen, of een synthetische wedstrijd met gekende waarheid genereren.')
    parser.add_argument('--video', type=Path, default=None, help='de wedstrijdvideo (maatlat)')
    parser.add_argument('--labels', type=Path, default=None,
                        help='ground truth (JSONL: sync.py-dialect of plat '
                             '{video_time_s, x_m, y_m, worp_type, uitbal?})')
    parser.add_argument('--uit', type=Path, default=None, help='rapport-JSON (maatlat)')
    parser.add_argument('--kalibratie', type=Path, default=None,
                        help='kalibratie-JSON van calibrate.py — zonder deze wordt de '
                             'landing-as niet gemeten (dat zegt het rapport er dan bij)')
    parser.add_argument('--homografie', type=Path, default=None,
                        help='homografiespoor van volg_veld.py, voor een bewegende camera')
    parser.add_argument('--balbanen', type=Path, default=None,
                        help='vooraf berekende balbanen (bal.py) — anders draait die stap hier')
    parser.add_argument('--zonder-balbanen', action='store_true',
                        help='de bal.py-stap overslaan: landing.py zoekt de bal dan zelf (MOG2)')
    parser.add_argument('--zonder-houding', action='store_true',
                        help='de worp-detectie overslaan en de worpmomenten uit de labels '
                             'nemen — meet alleen de landing-keten, ook mét rtmlib aanwezig')
    parser.add_argument('--venster', type=float, default=STANDAARD_VENSTER_S,
                        help=f'koppelvenster in seconden (standaard {STANDAARD_VENSTER_S:g}, '
                             'zelfde betekenis als bij evaluate.py)')
    parser.add_argument('--match', type=int, default=None, help='match-id voor de events')
    parser.add_argument('--analyse-fps', type=float, default=5.0,
                        help='meetfrequentie van het houdingsmodel (standaard 5)')
    parser.add_argument('--mode', default='balanced',
                        choices=('performance', 'balanced', 'lightweight'),
                        help='modelgrootte van het houdingsmodel')
    parser.add_argument('--rondes', type=int, default=None,
                        help='RANSAC-rondes voor bal.py (standaard die van bal.py zelf)')
    parser.add_argument('--tot', type=float, default=None,
                        help='alleen de eerste zoveel seconden meten (snelle proef)')
    parser.add_argument('--diepte', type=float, default=veld.STANDAARD_DOELGEBIED_DIEPTE_M,
                        help='doelgebied-diepte in meters (standaard 10; de kalibratie wint)')
    parser.add_argument('--breedte', type=float, default=None,
                        help='opgemeten veldbreedte (standaard: uit de kalibratie)')
    parser.add_argument('--speelveld', type=float, default=None,
                        help='opgemeten speelveldlengte (standaard: uit de kalibratie)')
    parser.add_argument('--venster-start', type=float, default=0.4,
                        help='zoekvenster ná de worp: begin (s) — zelfde als landing.py')
    parser.add_argument('--venster-einde', type=float, default=6.0,
                        help='zoekvenster ná de worp: einde (s) — zelfde als landing.py')
    parser.add_argument('--bal-min-px', type=int, default=6, help='minimale baldiameter (px)')
    parser.add_argument('--bal-max-px', type=int, default=60, help='maximale baldiameter (px)')
    # Synthetische wedstrijd
    parser.add_argument('--maak-synthetisch', type=Path, default=None, metavar='MAP',
                        help='genereer de synthetische gouden wedstrijd in deze map')
    parser.add_argument('--pan', action='store_true',
                        help='bij --maak-synthetisch: pannende camera, met homografiespoor')
    parser.add_argument('--duur', type=float, default=SYNT_DUUR_S,
                        help=f'duur van de synthetische wedstrijd (standaard {SYNT_DUUR_S:g} s)')
    parser.add_argument('--fps', type=float, default=SYNT_FPS,
                        help=f'beeldfrequentie van de synthetische video (standaard {SYNT_FPS:g})')
    parser.add_argument('--seed', type=int, default=7,
                        help='seed voor de spelersbewegingen (standaard 7)')
    args = parser.parse_args(argv)

    if args.maak_synthetisch is not None:
        if args.video or args.labels or args.uit:
            parser.error('--maak-synthetisch gaat niet samen met --video/--labels/--uit — '
                         'genereer eerst, draai de maatlat daarna')
        if args.duur <= 0 or args.fps <= 0:
            _fout('--duur en --fps moeten groter zijn dan 0')
        maak_synthetisch(args.maak_synthetisch, duur_s=args.duur, fps=args.fps,
                         pan=args.pan, seed=args.seed)
        return

    if args.video is None or args.labels is None or args.uit is None:
        parser.error('de maatlat vereist --video, --labels en --uit '
                     '(of gebruik --maak-synthetisch MAP)')
    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')
    if not args.labels.is_file():
        _fout(f'labels niet gevonden: {args.labels}')
    for naam, pad in (('--kalibratie', args.kalibratie), ('--homografie', args.homografie),
                      ('--balbanen', args.balbanen)):
        if pad is not None and not pad.is_file():
            _fout(f'{naam}-bestand niet gevonden: {pad}')
    if args.venster <= 0:
        _fout('--venster moet groter zijn dan 0')
    if args.rondes is None:
        import bal  # noqa: PLC0415
        args.rondes = bal.RONDES

    rapport = draai_maatlat(args)
    args.uit.write_text(json.dumps(rapport, indent=2, ensure_ascii=False) + '\n',
                        encoding='utf-8')
    druk_samenvatting(rapport)
    print(f'Rapport → {args.uit}')


if __name__ == '__main__':
    main()
