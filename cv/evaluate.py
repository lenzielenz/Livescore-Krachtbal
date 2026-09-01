#!/usr/bin/env python3
"""Acceptatierapport fase 1: detectie-JSONL vergelijken met weak-labels-JSONL.

Vergelijkt de kandidaat-worpen van ``detect_worpen.py`` (of eender welke
detector die het event-JSON van de brug schrijft) met de weak labels van
``sync.py`` op held-out wedstrijden, en rapporteert:

- **precision / recall / F1** voor worp-detectie. Álle labels met event_type
  ``worp``, ``vangst``, ``doelpunt`` of ``buitenspel`` tellen als
  worp-momenten: vangst, doelpunt en buitenspel zijn aflopen van een worp —
  het zijn dus allemaal worpen, enkel de afloop verschilt (zie cv/README.md,
  sync.py verfijnt het event_type met de outcome). Labels met een ander
  event_type worden genegeerd (en apart geteld), net als labels met verdict
  ``afgewezen`` (ground truth van groundtruth.py: een door een mens afgewezen
  voorstel is géén worp — dezelfde regel als train.lees_labels). Elke
  detectieregel telt als één worp-kandidaat.
- gemiddelde **|Δt|** van de gematchte paren (tijdsuitlijning van de detector);
- **nekworp/rugworp-accuraatheid** over de gematchte paren waar zowel label
  als detectie een worp_type hebben, plus de 2×2-verwarringsmatrix.

Matching: greedy één-op-één op ``video_time_s`` binnen een tolerantievenster
(--venster, standaard 2.0 s) — dichtstbijzijnde paar eerst, elk label en elke
detectie hoogstens één keer. Een tweede detectie op hetzelfde label is dus een
valse positief; een detectie net buiten het venster ook.

Doel-metriek van fase 1: **recall ≥ 0.8** voor worp-detectie. Het rapport
meldt of dat gehaald is, maar de exitcode blijft 0 — dit is een méting, geen
poortwachter. Exitcode ≠ 0 enkel bij gebruiksfouten (bestand onvindbaar,
ongeldige JSON, …).

Gebruik:
    python3 cv/evaluate.py --detecties detecties.jsonl --labels labels_match42.jsonl
    python3 cv/evaluate.py --detecties … --labels … --json   # machineleesbaar

Puur stdlib — geen extra dependencies nodig.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Alle vier de klassen zijn worpen (de afloop verschilt) — zie de docstring.
WORP_EVENT_TYPES = ('worp', 'vangst', 'doelpunt', 'buitenspel')
WORP_TYPES = ('nekworp', 'rugworp')
DOEL_RECALL = 0.8


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    sys.exit(code)


def lees_jsonl(pad: Path) -> list[dict]:
    """Lees een events-JSONL; elke regel moet een numerieke video_time_s hebben."""
    events = []
    for nummer, regel in enumerate(pad.read_text(encoding='utf-8').splitlines(), start=1):
        regel = regel.strip()
        if not regel:
            continue
        try:
            event = json.loads(regel)
        except json.JSONDecodeError as e:
            _fout(f'{pad}:{nummer}: ongeldige JSON ({e})')
        if not isinstance(event, dict) or not isinstance(event.get('video_time_s'), (int, float)):
            _fout(f'{pad}:{nummer}: event zonder numerieke video_time_s')
        events.append(event)
    return events


def match_greedy(
    label_tijden: list[float], detectie_tijden: list[float], venster: float
) -> list[tuple[int, int, float]]:
    """Greedy één-op-één-matching binnen ±venster: dichtstbijzijnde paar eerst.

    Geeft (label_index, detectie_index, |Δt|)-triples terug, gesorteerd op
    label_index. Elk label en elke detectie wordt hoogstens één keer gebruikt.
    Bij gelijke |Δt| wint het paar met de laagste indexen (deterministisch).
    """
    paren = [
        (abs(lt - dt), li, di)
        for li, lt in enumerate(label_tijden)
        for di, dt in enumerate(detectie_tijden)
        if abs(lt - dt) <= venster
    ]
    paren.sort()
    label_vrij = [True] * len(label_tijden)
    detectie_vrij = [True] * len(detectie_tijden)
    matches = []
    for afwijking, li, di in paren:
        if label_vrij[li] and detectie_vrij[di]:
            label_vrij[li] = False
            detectie_vrij[di] = False
            matches.append((li, di, afwijking))
    matches.sort(key=lambda m: m[0])
    return matches


def evalueer(labels: list[dict], detecties: list[dict], venster: float) -> dict:
    """Bereken alle fase 1-metrieken; None waar een metriek niet gedefinieerd is.

    Ground truth uit de reviewlaan (groundtruth.py) draagt een verdict mee; een door een
    mens afgewezen voorstel is per definitie géén worp — dezelfde regel als train.lees_labels.
    Zonder die filter zou een detector die zijn eigen valse positieven herhaalt beloond
    worden: het afgewezen voorstel telde als label, en de herhaalde detectie als treffer.
    """
    afgewezen = sum(1 for l in labels
                    if l.get('event_type') in WORP_EVENT_TYPES and l.get('verdict') == 'afgewezen')
    worp_labels = [l for l in labels
                   if l.get('event_type') in WORP_EVENT_TYPES and l.get('verdict') != 'afgewezen']
    genegeerd = len(labels) - len(worp_labels) - afgewezen

    matches = match_greedy(
        [float(l['video_time_s']) for l in worp_labels],
        [float(d['video_time_s']) for d in detecties],
        venster,
    )
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
    gemiddelde_dt = sum(m[2] for m in matches) / tp if tp > 0 else None

    # Worptype: enkel over de gematchte paren waar béíde kanten een type hebben.
    matrix = {lw: {dw: 0 for dw in WORP_TYPES} for lw in WORP_TYPES}
    paren_met_type = 0
    juist = 0
    for li, di, _ in matches:
        label_type = worp_labels[li].get('worp_type')
        detectie_type = detecties[di].get('worp_type')
        if label_type in WORP_TYPES and detectie_type in WORP_TYPES:
            matrix[label_type][detectie_type] += 1
            paren_met_type += 1
            juist += int(label_type == detectie_type)
    accuraatheid = juist / paren_met_type if paren_met_type > 0 else None

    # Fase 2 — zone en landing: enkel over paren waar béíde kanten een zone dragen.
    zone_paren = 0
    zone_juist = 0
    landing_fouten: list[float] = []
    afstand_fouten: list[float] = []
    for li, di, _ in matches:
        lz, dz = worp_labels[li].get('zone'), detecties[di].get('zone')
        if lz and dz:
            zone_paren += 1
            zone_juist += int(bool(lz.get('in_doelgebied')) == bool(dz.get('in_doelgebied')))
            try:
                landing_fouten.append(
                    ((float(lz['x_m']) - float(dz['x_m'])) ** 2 + (float(lz['y_m']) - float(dz['y_m'])) ** 2) ** 0.5
                )
            except (KeyError, TypeError, ValueError):
                pass
        la, da = worp_labels[li].get('afstand_m'), detecties[di].get('afstand_m')
        if isinstance(la, (int, float)) and isinstance(da, (int, float)):
            afstand_fouten.append(abs(float(la) - float(da)))

    # Fase 3 — speler: teamtoewijzing en rugnummer. Een leeg rugnummer is géén fout
    # (laag vertrouwen hoort leeg te blijven voor review) maar telt apart als "niet ingevuld".
    team_paren = 0
    team_juist = 0
    nummer_labels = 0
    nummer_ingevuld = 0
    nummer_juist = 0
    for li, di, _ in matches:
        ls, ds = worp_labels[li].get('speler'), detecties[di].get('speler')
        if ls and ds and ls.get('team') in ('home', 'away') and ds.get('team') in ('home', 'away'):
            team_paren += 1
            team_juist += int(ls['team'] == ds['team'])
        if ls and ls.get('rugnummer') is not None:
            nummer_labels += 1
            dn = (ds or {}).get('rugnummer')
            if dn is not None:
                nummer_ingevuld += 1
                nummer_juist += int(int(dn) == int(ls['rugnummer']))

    return {
        'venster_s': venster,
        'labels': len(worp_labels),
        'labels_genegeerd': genegeerd,
        'labels_afgewezen': afgewezen,
        'detecties': len(detecties),
        'tp': tp,
        'fp': fp,
        'fn': fn,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'gemiddelde_dt_s': gemiddelde_dt,
        'doel_recall': DOEL_RECALL,
        'doel_gehaald': None if recall is None else recall >= DOEL_RECALL,
        'worp_type': {
            'paren': paren_met_type,
            'accuraatheid': accuraatheid,
            # rijen = label (waarheid), kolommen = detectie (voorspelling)
            'verwarringsmatrix': matrix,
        },
        'zone': {
            'paren': zone_paren,
            'accuraatheid': zone_juist / zone_paren if zone_paren > 0 else None,
            'landing_mae_m': sum(landing_fouten) / len(landing_fouten) if landing_fouten else None,
            'afstand_mae_m': sum(afstand_fouten) / len(afstand_fouten) if afstand_fouten else None,
        },
        'speler': {
            'team_paren': team_paren,
            'team_accuraatheid': team_juist / team_paren if team_paren > 0 else None,
            'rugnummer_labels': nummer_labels,
            'rugnummer_ingevuld': nummer_ingevuld,
            'rugnummer_accuraatheid': nummer_juist / nummer_ingevuld if nummer_ingevuld > 0 else None,
        },
    }


def _getal(waarde: float | None, decimalen: int = 3) -> str:
    return 'n.v.t.' if waarde is None else f'{waarde:.{decimalen}f}'


def formatteer_rapport(m: dict) -> str:
    """Menselijke NL-weergave van het metrieken-dict van evalueer()."""
    regels = [
        f'Evaluatie worp-detectie (venster ±{m["venster_s"]:g} s)',
        f'  Labels (worp-momenten): {m["labels"]}   Detecties: {m["detecties"]}',
        f'  TP {m["tp"]} | FP {m["fp"]} | FN {m["fn"]}',
        f'  Precision {_getal(m["precision"])}   Recall {_getal(m["recall"])}   '
        f'F1 {_getal(m["f1"])}',
        f'  Gemiddelde |Δt| van de matches: {_getal(m["gemiddelde_dt_s"], 2)} s',
    ]
    if m['doel_gehaald'] is None:
        regels.append(f'  Doel recall ≥ {DOEL_RECALL:g}: n.v.t. (geen labels)')
    else:
        status = 'GEHAALD' if m['doel_gehaald'] else 'NIET gehaald'
        regels.append(f'  Doel recall ≥ {DOEL_RECALL:g}: {status}')
    if m['labels_genegeerd']:
        regels.append(
            f'  ({m["labels_genegeerd"]} labels met een ander event_type genegeerd)'
        )
    if m.get('labels_afgewezen'):
        regels.append(
            f'  ({m["labels_afgewezen"]} door een mens afgewezen voorstellen niet als worp geteld)'
        )

    wt = m['worp_type']
    regels.append('')
    regels.append(
        f'Nekworp/rugworp (over {wt["paren"]} gematchte paren met beide een worp_type)'
    )
    if wt['paren'] == 0:
        regels.append('  Geen paren met worp_type aan beide kanten — accuraatheid n.v.t.')
    else:
        regels.append(f'  Accuraatheid {_getal(wt["accuraatheid"])}')
        matrix = wt['verwarringsmatrix']
        regels.append('  Verwarringsmatrix (rijen = label, kolommen = detectie)')
        regels.append(f'    {"":9s}{"nekworp":>9s}{"rugworp":>9s}')
        for label_type in WORP_TYPES:
            rij = matrix[label_type]
            regels.append(
                f'    {label_type:9s}{rij["nekworp"]:>9d}{rij["rugworp"]:>9d}'
            )

    # Fase 2 — zone/landing: enkel tonen zodra er zone-data is (fase 1-runs blijven schoon).
    z = m['zone']
    if z['paren'] > 0:
        regels.append('')
        regels.append(f'Zone en landing (fase 2, over {z["paren"]} paren met zone aan beide kanten)')
        regels.append(f'  Zone-accuraatheid (in/uit doelgebied): {_getal(z["accuraatheid"])}')
        regels.append(f'  Landing-MAE: {_getal(z["landing_mae_m"], 2)} m')
        if z['afstand_mae_m'] is not None:
            regels.append(f'  Afstand-MAE: {_getal(z["afstand_mae_m"], 2)} m')

    # Fase 3 — speler: idem, enkel tonen zodra er spelersdata is.
    sp = m['speler']
    if sp['team_paren'] > 0 or sp['rugnummer_labels'] > 0:
        regels.append('')
        regels.append('Spelersidentificatie (fase 3)')
        if sp['team_paren'] > 0:
            regels.append(
                f'  Team-accuraatheid: {_getal(sp["team_accuraatheid"])} (over {sp["team_paren"]} paren)'
            )
        if sp['rugnummer_labels'] > 0:
            regels.append(
                f'  Rugnummer: {sp["rugnummer_ingevuld"]} van {sp["rugnummer_labels"]} ingevuld, '
                f'accuraatheid over de ingevulde: {_getal(sp["rugnummer_accuraatheid"])}'
            )
    return '\n'.join(regels)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Precision/recall-rapport: detectie-JSONL vs weak-labels-JSONL (fase 1).'
    )
    parser.add_argument('--detecties', type=Path, required=True,
                        help='detectie-uitvoer (JSONL, bv. van detect_worpen.py)')
    parser.add_argument('--labels', type=Path, required=True,
                        help='weak labels (JSONL, bv. van sync.py) — de waarheid')
    parser.add_argument('--venster', type=float, default=2.0,
                        help='tolerantievenster in seconden voor de matching (standaard 2.0)')
    parser.add_argument('--json', action='store_true',
                        help='enkel machineleesbare JSON naar stdout')
    args = parser.parse_args(argv)

    if args.venster <= 0:
        _fout('--venster moet groter zijn dan 0')
    for naam, pad in (('--detecties', args.detecties), ('--labels', args.labels)):
        if not pad.is_file():
            _fout(f'{naam}-bestand niet gevonden: {pad}')

    metrieken = evalueer(lees_jsonl(args.labels), lees_jsonl(args.detecties), args.venster)
    if args.json:
        print(json.dumps(metrieken, ensure_ascii=False, indent=2))
    else:
        print(formatteer_rapport(metrieken))
    # Bewust exitcode 0, ook bij lage scores: dit is een meting, geen poortwachter.


if __name__ == '__main__':
    main()
