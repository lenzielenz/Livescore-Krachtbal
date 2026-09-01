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
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from evaluate import WORP_EVENT_TYPES, match_greedy  # noqa: E402
from houding import MODEL_NAAM, MODEL_VERSION, ZOEK_FACTOR, vind_worpmomenten  # noqa: E402

# Waar houding.py standaard zijn getrainde instellingen zoekt.
STANDAARD_UIT = Path(__file__).resolve().parent / 'model-houding.json'

# Het raster waarop gezocht wordt. Ruim genoeg om een echt optimum te bevatten,
# klein genoeg om in een seconde te doorlopen.
DREMPELS = tuple(round(0.2 + 0.1 * i, 2) for i in range(39))          # 0.2 … 4.0
AFSTANDEN = (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0)
VENSTER_S = 2.0

# Hoeveel hoger dezelfde worp fijn gemeten scoort dan grof: 0,47 tegenover 0,31 — nagemeten
# op de nagebootste worpen van houding.py (zie de toelichting bij ZOEK_FACTOR daar). Een
# gemeten verhouding over vele worpen, geen meting van déze worp: de naspeling hieronder
# blijft dus een benadering.
GROF_NAAR_FIJN = 1.5


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


# ---------------------------------------------------------------------------
# Lezen
# ---------------------------------------------------------------------------


def lees_reeks(pad: Path) -> list[dict]:
    """De meetreeks van houding.py: per bemonsterd beeld ``{'t', 'score', …}``.

    Sinds de romp-relatieve meting draagt elke meting ook een compact `per_speler`-veld
    (werper-id → score). Dat wordt hier bewust genegeerd: getraind wordt er nog op de beste
    score per moment (`score`), zoals ``vind_worpmomenten`` beslist. Per speler leren — en
    daarmee ook de beslislaag van train op ``vind_worpmomenten_per_speler`` laten lopen,
    zodat twee spelers die kort na elkaar werpen als twee labels tellen — is een volgende,
    aparte stap.
    """
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
                      'polshoogte': r.get('polshoogte'),
                      'venster': r.get('venster'),
                      # Uit welke passage deze meting komt (twee-passages-run): zonder dit
                      # merkteken kan de scoring hieronder de keten niet naspelen.
                      'passage': r.get('passage')})
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


def keten_momenten(reeks: list[dict], drempel: float, min_afstand: float) -> list[float]:
    """De worpmomenten zoals de gedeployde keten ze bij déze kandidaat-drempel zou vinden.

    BEPERKING (bewust aanvaard): de meetreeks is geconditioneerd op de drempel van de
    analyse die haar schreef. Ze is alleen fíjn (passage 2) waar díe run met háár
    zoekdrempel (oude drempel × ZOEK_FACTOR) kandidaten vond; daarbuiten staat de grove
    score, die voor dezelfde worp tot een derde lager ligt. Kaal hertellen op de reeks
    onderschat dan elke kandidaat-drempel onder de oude: de keten zou zo'n grove piek wél
    oppikken (zoekdrempel drempel × ZOEK_FACTOR) en fijn hermeten. Echt hermeten kan hier
    niet — er is geen video — dus wordt de keten nagespeeld: grove pieken die de
    zoekpassage bij deze drempel zou nakijken en die nooit fijn gemeten zijn, tellen mee
    op fijne schaal (× GROF_NAAR_FIJN). Dat is een gemiddelde verhouding, geen hermeting;
    wie het exact wil, laat de analyse opnieuw lopen met de nieuwe drempel.
    """
    momenten = [t for t, _ in vind_worpmomenten(reeks, drempel, min_afstand)]
    if not any(r.get('passage') == 2 for r in reeks):
        # Homogene reeks (één passage): niets om na te spelen.
        return momenten
    grof = [r for r in reeks if r.get('passage') != 2]
    # Zelfde zoekdrempel en halve afstand als de zoekpassage van houding.py; de dedup op
    # volle afstand hieronder speelt de beslissingsstap na.
    for t, s in vind_worpmomenten(grof, drempel * ZOEK_FACTOR, min_afstand * 0.5):
        if s * GROF_NAAR_FIJN >= drempel and all(abs(t - m) >= min_afstand for m in momenten):
            momenten.append(t)
    return sorted(momenten)


def scoor(reeks: list[dict], labels: list[float], drempel: float, min_afstand: float,
          venster: float = VENSTER_S) -> dict:
    """Hoe goed vindt deze instelling de gelabelde worpen in deze reeks?

    Gescoord zoals de keten zou beslissen, niet zoals de reeks toevallig bewaard is —
    zie keten_momenten voor de (bewust aanvaarde) beperking daarvan.
    """
    momenten = keten_momenten(reeks, drempel, min_afstand)
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


def benoem(wedstrijden: list[dict]) -> list[dict]:
    """Elke wedstrijd een naam die je in het rapport terugvindt — en die uniek is.

    De server bewaart elke meetreeks als ``<werkmap>/<match-id>/houding-reeks.jsonl``: dan
    heten ze állemaal 'houding-reeks' en zou --holdout ze niet uit elkaar kunnen houden. Botsen
    de namen, dan komt de map ervoor (``42/houding-reeks``), zodat ``--holdout 42`` werkt.
    """
    namen = [w['naam'] for w in wedstrijden]
    if len(set(namen)) == len(namen):
        return wedstrijden
    return [{**w, 'naam': f'{w["pad"].parent.name}/{w["naam"]}' if w.get('pad') else w['naam']}
            for w in wedstrijden]


def sleutels(w: dict) -> set[str]:
    """Waaraan je één wedstrijd mag aanwijzen: zijn naam, zijn bestandsnaam, zijn map."""
    namen = {w['naam']}
    pad = w.get('pad')
    if pad is not None:
        namen |= {pad.stem, pad.name, pad.parent.name, str(pad)}
    return namen


def kies_apart(wedstrijden: list[dict], holdouts: list[str]) -> list[dict]:
    """De wedstrijden die --holdout aanwijst, in de oorspronkelijke volgorde.

    Eerst exact vergelijken, en enkel als niets exact past als los stuk tekst. Anders zou
    ``--holdout 42`` ook wedstrijd 142 meenemen — een holdout die er stiekem twee zijn, is een
    holdout waar je niets aan hebt.
    """
    gekozen: list[dict] = []
    for h in holdouts:
        treffers = [w for w in wedstrijden if h in sleutels(w)] or \
                   [w for w in wedstrijden if h in w['naam']]
        gekozen.extend(treffers)
    return [w for w in wedstrijden if any(w is g for g in gekozen)]


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
        wedstrijden.append({'naam': rp.stem, 'pad': rp, 'reeks': reeks, 'labels': labels})

    wedstrijden = benoem(wedstrijden)

    apart = kies_apart(wedstrijden, args.holdout)
    fit = [w for w in wedstrijden if not any(w is a for a in apart)]
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

    # Over welk venster de scores gemeten zijn. Een drempel hoort bij een schaal: is er straks
    # met een heel ander venster gemeten, dan betekent hetzelfde getal iets anders. Meeschrijven
    # is het verschil tussen een drempel die overdraagbaar is en eentje die stil scheef staat.
    vensters = [r['venster'] for w in fit for r in w['reeks'] if isinstance(r.get('venster'), (int, float))]
    uitkomst = {
        'model': MODEL_NAAM,
        'model_version': MODEL_VERSION,
        'drempel': drempel,
        'min_afstand_s': afstand,
        'venster_mediaan_s': round(statistics.median(vensters), 3) if vensters else None,
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
