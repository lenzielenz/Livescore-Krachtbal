#!/usr/bin/env python3
"""Stap 3: het model bijstellen op échte wedstrijden in plaats van op aanvoelen.

Waarom dit bestaat
------------------
``houding.py`` beslist met twee getallen wanneer iets een worp is: de **drempel**
op de worpscore en de **minimale afstand** tussen twee pieken. Die twee stonden
op een geschatte waarde (1.2 en 3.0 s) — gekozen bij het schrijven, niet gemeten.
Dat is precies het soort getal dat je niet moet raden maar moet léren, want de
juiste waarde hangt af van jouw camera, jouw zaal en jouw spelers.

Dit script leert ze uit gelabelde wedstrijden. De labels zijn er al: elke worp
die de aantekenaar tijdens de match invoerde (``sync.py`` → weak labels) en elke
reviewbeslissing (``groundtruth.py``). De meting is er ook: ``houding.py
--reeks-uit`` schrijft per bemonsterd beeld de worpscore weg, zodat je niet voor
elke instelling opnieuw uren video door het model hoeft te duwen. Eén keer meten,
duizend keer proberen.

    # 1. meten (duur, één keer per wedstrijd)
    python3 cv/houding.py match42.mp4 --uit voorstellen42.jsonl --reeks-uit reeks42.jsonl

    # 2. labels ophalen (goedkoop)
    python3 cv/sync.py --base https://krachtbal.live --match 42 --uit labels42.jsonl

    # 3. trainen (goedkoop, en zo vaak je wil)
    python3 cv/train.py --wedstrijd reeks42.jsonl labels42.jsonl \
                        --wedstrijd reeks43.jsonl labels43.jsonl \
                        --holdout 43 --uit cv/model-houding.json

Wat er getraind wordt is bewust klein: twee getallen, met een rasterzoektocht op
de F1 van dezelfde greedy koppeling die ``evaluate.py`` gebruikt. Geen gradient
descent op duizend gewichten — met een handvol gelabelde wedstrijden zou zo'n
model vooral de ruis van die wedstrijden leren. Twee getallen op tien wedstrijden
is eerlijk; tienduizend gewichten op tien wedstrijden is zelfbedrog.

**Holdout.** Fitten en rapporteren op dezelfde wedstrijden geeft altijd een mooi
cijfer en zegt niets. Geef daarom met ``--holdout`` één of meer wedstrijden op die
buiten het fitten blijven; die score is het cijfer dat telt. Kan het niet (je hebt
er maar één), dan draait het script gewoon door maar zegt het er luid bij.

Puur stdlib. De rekenkern hieronder (koppelen, scoren, zoeken) is getest zonder
video en zonder model.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from evaluate import WORP_EVENT_TYPES, match_greedy  # noqa: E402
from houding import MODEL_NAAM, MODEL_VERSION, vind_worpmomenten  # noqa: E402

# Waar houding.py standaard zijn getrainde instellingen zoekt.
STANDAARD_UIT = Path(__file__).resolve().parent / 'model-houding.json'

# Het raster waarop gezocht wordt. Ruim genoeg om een echt optimum te bevatten,
# klein genoeg om in een seconde te doorlopen.
DREMPELS = tuple(round(0.2 + 0.1 * i, 2) for i in range(39))          # 0.2 … 4.0
AFSTANDEN = (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0)
VENSTER_S = 2.0


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


# ---------------------------------------------------------------------------
# Lezen
# ---------------------------------------------------------------------------


def lees_reeks(pad: Path) -> list[dict]:
    """De meetreeks van houding.py: per bemonsterd beeld ``{'t', 'score', …}``."""
    reeks = []
    for nummer, regel in enumerate(pad.read_text(encoding='utf-8').splitlines(), start=1):
        regel = regel.strip()
        if not regel:
            continue
        try:
            r = json.loads(regel)
        except json.JSONDecodeError as e:
            _fout(f'{pad}:{nummer}: ongeldige JSON ({e.msg})')
        if not isinstance(r, dict) or not isinstance(r.get('t'), (int, float)):
            _fout(f'{pad}:{nummer}: regel zonder numerieke "t"')
        if not isinstance(r.get('score'), (int, float)):
            _fout(f'{pad}:{nummer}: regel zonder numerieke "score"')
        reeks.append({'t': float(r['t']), 'score': float(r['score']),
                      'polshoogte': r.get('polshoogte')})
    reeks.sort(key=lambda r: r['t'])
    return reeks


def lees_labels(pad: Path) -> list[float]:
    """De worpmomenten uit een labels-JSONL (sync.py of groundtruth.py).

    Alle vier de worp-afloopklassen tellen als worp — vangst, doelpunt en
    buitenspel zíjn worpen, enkel de afloop verschilt (zie evaluate.py). Bij
    ground truth uit de reviewlaan tellen enkel de bevestigde voorstellen: een
    afgewezen voorstel is per definitie géén worp.
    """
    tijden = []
    for nummer, regel in enumerate(pad.read_text(encoding='utf-8').splitlines(), start=1):
        regel = regel.strip()
        if not regel:
            continue
        try:
            e = json.loads(regel)
        except json.JSONDecodeError as err:
            _fout(f'{pad}:{nummer}: ongeldige JSON ({err.msg})')
        if not isinstance(e, dict):
            _fout(f'{pad}:{nummer}: geen JSON-object')
        t = e.get('video_time_s')
        if not isinstance(t, (int, float)):
            _fout(f'{pad}:{nummer}: regel zonder numerieke "video_time_s"')
        if e.get('verdict') == 'afgewezen':
            continue
        if str(e.get('event_type', 'worp')) not in WORP_EVENT_TYPES:
            continue
        tijden.append(float(t))
    return sorted(tijden)


# ---------------------------------------------------------------------------
# Scoren en zoeken (puur)
# ---------------------------------------------------------------------------


def scoor(reeks: list[dict], labels: list[float], drempel: float, min_afstand: float,
          venster: float = VENSTER_S) -> dict:
    """Hoe goed vindt deze instelling de gelabelde worpen in deze reeks?"""
    momenten = [t for t, _ in vind_worpmomenten(reeks, drempel, min_afstand)]
    paren = match_greedy(labels, momenten, venster)
    gevonden = len(paren)
    precisie = gevonden / len(momenten) if momenten else None
    recall = gevonden / len(labels) if labels else None
    f1 = (2 * precisie * recall / (precisie + recall)
          if precisie is not None and recall is not None and precisie + recall > 0 else None)
    return {
        'labels': len(labels),
        'detecties': len(momenten),
        'gevonden': gevonden,
        'gemist': len(labels) - gevonden,
        'vals': len(momenten) - gevonden,
        'precisie': precisie,
        'recall': recall,
        'f1': f1,
    }


def scoor_samen(wedstrijden: list[dict], drempel: float, min_afstand: float,
                venster: float = VENSTER_S) -> dict:
    """Eén score over meerdere wedstrijden: de tellingen opgeteld, niet de F1's gemiddeld.

    Een wedstrijd met drie worpen mag niet even zwaar wegen als eentje met zestig;
    het gemiddelde van F1's doet dat wel, de opgetelde tellingen niet.
    """
    gevonden = detecties = labels = 0
    per_wedstrijd = []
    for w in wedstrijden:
        s = scoor(w['reeks'], w['labels'], drempel, min_afstand, venster)
        per_wedstrijd.append({'naam': w['naam'], **s})
        gevonden += s['gevonden']
        detecties += s['detecties']
        labels += s['labels']
    precisie = gevonden / detecties if detecties else None
    recall = gevonden / labels if labels else None
    f1 = (2 * precisie * recall / (precisie + recall)
          if precisie is not None and recall is not None and precisie + recall > 0 else None)
    return {
        'wedstrijden': len(wedstrijden),
        'labels': labels,
        'detecties': detecties,
        'gevonden': gevonden,
        'gemist': labels - gevonden,
        'vals': detecties - gevonden,
        'precisie': precisie,
        'recall': recall,
        'f1': f1,
        'per_wedstrijd': per_wedstrijd,
    }


def zoek_instellingen(wedstrijden: list[dict], drempels=DREMPELS, afstanden=AFSTANDEN,
                      venster: float = VENSTER_S) -> tuple[float, float, dict]:
    """De drempel en minimale afstand met de hoogste F1 over alle wedstrijden samen.

    Bij gelijke F1 wint de hóógste drempel: minder valse voorstellen bij dezelfde
    score is voor de reviewlaan het aangenaamste van de twee. Daarna de kleinste
    minimale afstand, want die verwerpt de minste echte worpen die kort na elkaar
    komen.
    """
    beste: tuple[float, float, dict] | None = None
    beste_sleutel: tuple[float, float, float] | None = None
    for d in drempels:
        for a in afstanden:
            s = scoor_samen(wedstrijden, d, a, venster)
            sleutel = (s['f1'] or 0.0, d, -a)
            if beste_sleutel is None or sleutel > beste_sleutel:
                beste_sleutel = sleutel
                beste = (d, a, s)
    if beste is None:
        _fout('geen enkele instelling geprobeerd — leeg raster?')
    return beste


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _pct(w: float | None) -> str:
    return '—' if w is None else f'{w * 100:.0f}%'


def formatteer(kop: str, s: dict) -> str:
    f1 = '—' if s['f1'] is None else f'{s["f1"]:.3f}'
    regels = [f'{kop} ({s["wedstrijden"]} wedstrijd(en), {s["labels"]} gelabelde worpen)',
              f'  gevonden {s["gevonden"]}/{s["labels"]} (recall {_pct(s["recall"])}) · '
              f'vals {s["vals"]}/{s["detecties"]} · precisie {_pct(s["precisie"])} · '
              f'F1 {f1}']
    for w in s['per_wedstrijd']:
        regels.append(f'    {w["naam"]}: {w["gevonden"]}/{w["labels"]} gevonden, '
                      f'{w["vals"]} vals')
    return '\n'.join(regels)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(
        description='De worpdetectie bijstellen op gelabelde wedstrijden.')
    p.add_argument('--wedstrijd', nargs=2, action='append', metavar=('REEKS', 'LABELS'),
                   required=True,
                   help='een meetreeks (houding.py --reeks-uit) met de bijhorende labels-JSONL; '
                        'meerdere keren op te geven')
    p.add_argument('--holdout', action='append', default=[], metavar='NAAM',
                   help='wedstrijd(en) die buiten het fitten blijven — herken ze aan een stuk '
                        'van hun bestandsnaam. Dít is het cijfer dat telt.')
    p.add_argument('--venster', type=float, default=VENSTER_S,
                   help=f'hoe ver een voorstel van een label mag liggen (standaard {VENSTER_S}s)')
    p.add_argument('--uit', type=Path, default=STANDAARD_UIT,
                   help=f'waar de getrainde instellingen heen gaan (standaard {STANDAARD_UIT})')
    p.add_argument('--droog', action='store_true', help='enkel rapporteren, niets wegschrijven')
    args = p.parse_args(argv)

    wedstrijden = []
    for reekspad, labelpad in args.wedstrijd:
        rp, lp = Path(reekspad), Path(labelpad)
        if not rp.is_file():
            _fout(f'meetreeks niet gevonden: {rp}')
        if not lp.is_file():
            _fout(f'labels niet gevonden: {lp}')
        reeks, labels = lees_reeks(rp), lees_labels(lp)
        if len(reeks) < 3:
            _fout(f'{rp}: te weinig metingen ({len(reeks)}) om iets uit te leren')
        if not labels:
            _fout(f'{lp}: geen enkele gelabelde worp — zonder labels valt er niets te trainen')
        wedstrijden.append({'naam': rp.stem, 'reeks': reeks, 'labels': labels})

    apart = [w for w in wedstrijden if any(h in w['naam'] for h in args.holdout)]
    fit = [w for w in wedstrijden if w not in apart]
    if args.holdout and not apart:
        _fout(f'geen wedstrijd komt overeen met --holdout {args.holdout} — '
              f'beschikbaar: {", ".join(w["naam"] for w in wedstrijden)}')
    if not fit:
        _fout('alle wedstrijden staan apart — er blijft niets over om op te fitten')

    drempel, afstand, training = zoek_instellingen(fit, venster=args.venster)
    print(f'Beste instelling: drempel {drempel:g}, minimale afstand {afstand:g}s')
    print(formatteer('  op de fit-wedstrijden', training))

    holdout = None
    if apart:
        holdout = scoor_samen(apart, drempel, afstand, args.venster)
        print(formatteer('  op de holdout (dít cijfer telt)', holdout))
    else:
        print('  LET OP: geen holdout opgegeven. Deze cijfers zijn gemeten op dezelfde '
              'wedstrijden waarop gefit werd en zijn dus te mooi. Voeg een tweede wedstrijd '
              'toe en zet die met --holdout apart.')

    uitkomst = {
        'model': MODEL_NAAM,
        'model_version': MODEL_VERSION,
        'drempel': drempel,
        'min_afstand_s': afstand,
        'venster_s': args.venster,
        'getraind_op': [w['naam'] for w in fit],
        'holdout_wedstrijden': [w['naam'] for w in apart],
        'training': {k: v for k, v in training.items() if k != 'per_wedstrijd'},
        'holdout': {k: v for k, v in holdout.items() if k != 'per_wedstrijd'} if holdout else None,
        'gemaakt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }
    if args.droog:
        print('(droog: niets weggeschreven)')
        return
    args.uit.write_text(json.dumps(uitkomst, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'→ {args.uit}')
    if args.uit == STANDAARD_UIT:
        print('  houding.py pikt dit bestand vanzelf op bij de volgende analyse.')


if __name__ == '__main__':
    main()
