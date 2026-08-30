#!/usr/bin/env python3
"""Fysieke statistiek per speler: loopafstand, sprintjes en topsnelheid.

Neemt de posities-JSONL van ``tracking.py`` (regels ``{"t","track","x_m","y_m"}``,
in échte veldmeters dankzij de homografie) en telt per spoor wat een coach wil
weten: hoeveel meter liep die speler, hoe vaak sprintte die, en hoe snel was de
snelste actie. Met een toewijzing spoor → speler wordt dat per rugnummer, en
met ``--upload`` gaat het resultaat naar het platform (zichtbaar op de
spelerskaart van de analysepagina).

Sporen zonder toewijzing blijven anoniem in het rapport — de v0.1-tracker
wisselt bij occlusie al eens van identiteit, dus de toewijzing is bewust een
menselijke stap (bekijk de heatmap/posities en zeg wie wie is).

    python3 cv/tracking.py --video match.mp4 --kalibratie k.json --uit posities.jsonl
    python3 cv/fysiek.py --posities posities.jsonl --toewijzing wie.json \
        --uit fysiek.json [--upload --base https://… --match 42]

``wie.json``: {"1": {"team": "thuis", "rugnummer": 7, "naam": "…"}, …}

DEMO (op de demo-posities van tracking.py, sporen 1-4 thuis / 5-8 uit):
    python3 cv/fysiek.py --posities posities.jsonl --demo --uit fysiek.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Sprint: sneller dan dit, minstens zo lang. 4 m/s (14,4 km/u) is op een veld van
# ~14 × 46 m een echte versnelling; de tracker bemonstert traag (≈ 2/s), dus een
# drempel op topsnelheid-niveau (7+ m/s) zou vrijwel alles missen.
SPRINT_DREMPEL_M_S = 4.0
SPRINT_MIN_DUUR_S = 1.0
# Groter gat dan dit tussen twee waarnemingen = het spoor was zoek; die sprong
# telt niet mee als gelopen afstand.
MAX_GAT_S = 2.0
# Sneller dan dit is een meetfout of identiteitswissel, geen sprint (zelfde
# limiet als de koppelaar in tracking.py).
MAX_SNELHEID_M_S = 8.0
# Glijdend gemiddelde over het spoor vóór we meters tellen. Zonder dit telt elke
# meetruis mee als afgelegde weg: hoe dichter je bemonstert, hoe meer ruis-kronkels
# je optelt — een wedstrijd op 4 metingen/s zou dan "verder gelopen" lijken dan
# dezelfde wedstrijd op 2/s. Met dit venster meet je de béweging, niet de ruis, en
# blijven de meters vergelijkbaar tussen wedstrijden. Sprints (1,5–3 s) overleven het.
GLAD_VENSTER_S = 0.75


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


def lees_posities(pad: Path) -> list[dict]:
    rijen = []
    with pad.open(encoding='utf-8') as f:
        for regel in f:
            regel = regel.strip()
            if regel:
                rijen.append(json.loads(regel))
    return rijen


# ---------------------------------------------------------------------------
# De telling (puur — getest zonder video of netwerk)
# ---------------------------------------------------------------------------


def glad_spoor(
    punten: list[tuple[float, float, float]], venster_s: float = GLAD_VENSTER_S,
) -> list[tuple[float, float, float]]:
    """Glijdend gemiddelde over de positie, binnen ±venster/2 seconden.

    De tijdstempels blijven staan; alleen x en y worden gemiddeld. Punten aan de
    rand van een gat middelen enkel met wat binnen het venster ligt, dus een
    onderbroken spoor wordt niet kunstmatig aan elkaar gerekend.
    """
    if venster_s <= 0 or len(punten) < 3:
        return punten
    half = venster_s / 2.0
    uit: list[tuple[float, float, float]] = []
    begin = 0
    einde = 0
    for i, (t, _, _) in enumerate(punten):
        while punten[begin][0] < t - half:
            begin += 1
        while einde + 1 < len(punten) and punten[einde + 1][0] <= t + half:
            einde += 1
        venster = punten[begin:einde + 1]
        uit.append((
            t,
            sum(p[1] for p in venster) / len(venster),
            sum(p[2] for p in venster) / len(venster),
        ))
        if i >= einde:
            einde = i
    return uit


def fysiek_per_spoor(
    posities: list[dict],
    sprint_drempel: float = SPRINT_DREMPEL_M_S,
    sprint_min_duur: float = SPRINT_MIN_DUUR_S,
    max_gat: float = MAX_GAT_S,
    max_snelheid: float = MAX_SNELHEID_M_S,
    glad_venster: float = GLAD_VENSTER_S,
) -> dict[int, dict]:
    """Per spoor: afstand_m, sprints, topsnelheid_m_s, actieve_s.

    Segmenten met een gat > max_gat of een snelheid > max_snelheid worden
    overgeslagen (spoor kwijt / identiteitswissel) — beter iets te weinig
    meters tellen dan spooksprints rapporteren.
    """
    per_spoor: dict[int, list[tuple[float, float, float]]] = {}
    for r in posities:
        per_spoor.setdefault(int(r['track']), []).append((float(r['t']), float(r['x_m']), float(r['y_m'])))

    uit: dict[int, dict] = {}
    for track, ruwe_punten in per_spoor.items():
        ruwe_punten.sort()
        # Eerst gladstrijken: anders is elke meting van meetruis een stukje "gelopen weg".
        punten = glad_spoor(ruwe_punten, glad_venster)
        afstand = 0.0
        top = 0.0
        actief = 0.0
        sprints = 0
        sprint_start: float | None = None
        sprint_geteld = False  # één aaneengesloten sprint telt één keer, hoe lang die ook duurt
        for (t0, x0, y0), (t1, x1, y1) in zip(punten, punten[1:]):
            dt = t1 - t0
            if dt <= 0 or dt > max_gat:
                sprint_start, sprint_geteld = None, False
                continue
            stap = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
            snelheid = stap / dt
            if snelheid > max_snelheid:
                sprint_start, sprint_geteld = None, False
                continue
            afstand += stap
            actief += dt
            top = max(top, snelheid)
            if snelheid >= sprint_drempel:
                if sprint_start is None:
                    sprint_start = t0
                if not sprint_geteld and t1 - sprint_start >= sprint_min_duur:
                    sprints += 1
                    sprint_geteld = True
            else:
                sprint_start, sprint_geteld = None, False
        uit[track] = {
            'afstand_m': round(afstand, 1),
            'sprints': sprints,
            'topsnelheid_m_s': round(top, 2),
            'actieve_s': round(actief, 1),
        }
    return uit


def _mmss(t: float) -> str:
    return f'{int(t) // 60}:{int(t) % 60:02d}'


def sjabloon_toewijzing(posities: list[dict], per_spoor: dict[int, dict]) -> dict[str, object]:
    """Invulklaar wie-is-wie-bestand: per spoor een lege toewijzing + een hint
    (wanneer het leefde, waar het gemiddeld stond, hoeveel het liep) zodat je op
    de heatmap of in de video snel ziet welke speler het is."""
    per_track: dict[int, list[tuple[float, float, float]]] = {}
    for r in posities:
        per_track.setdefault(int(r['track']), []).append((float(r['t']), float(r['x_m']), float(r['y_m'])))
    sjabloon: dict[str, object] = {
        '_uitleg': 'Vul per spoor team ("thuis"/"uit") en rugnummer in; laat ruis-sporen op null staan. '
                   'Meerdere sporen mogen hetzelfde rugnummer krijgen (identiteitswissels tellen op).',
    }
    for track in sorted(per_track):
        punten = sorted(per_track[track])
        gem_x = sum(x for _, x, _ in punten) / len(punten)
        gem_y = sum(y for _, _, y in punten) / len(punten)
        f = per_spoor.get(track, {})
        sjabloon[str(track)] = {
            'team': None,
            'rugnummer': None,
            'hint': f'{_mmss(punten[0][0])}–{_mmss(punten[-1][0])} · gemiddeld ({gem_x:.1f}, {gem_y:.1f}) m '
                    f'· {f.get("afstand_m", 0):g} m gelopen',
        }
    return sjabloon


def demo_toewijzing() -> dict[str, dict]:
    """De acht demo-sporen van tracking.py --demo: 1-4 thuis, 5-8 uit."""
    wie: dict[str, dict] = {}
    for track in range(1, 9):
        thuis = track <= 4
        wie[str(track)] = {'team': 'thuis' if thuis else 'uit', 'rugnummer': track if thuis else track - 4}
    return wie


def bundel_per_speler(per_spoor: dict[int, dict], toewijzing: dict[str, dict]) -> tuple[list[dict], list[int]]:
    """Sporen → spelers. Meerdere sporen op één rugnummer (id-wissels) tellen op."""
    per_speler: dict[tuple[str, int], dict] = {}
    anoniem: list[int] = []
    for track, f in sorted(per_spoor.items()):
        wie = toewijzing.get(str(track))
        if isinstance(wie, dict):
            wie = {k: v for k, v in wie.items() if k != 'hint'}
        team = (wie or {}).get('team')
        rugnummer = (wie or {}).get('rugnummer')
        if team not in ('thuis', 'uit') or not isinstance(rugnummer, int):
            anoniem.append(track)
            continue
        sleutel = (team, rugnummer)
        s = per_speler.setdefault(
            sleutel,
            {'team': team, 'rugnummer': rugnummer,
             **({'naam': wie['naam']} if isinstance((wie or {}).get('naam'), str) else {}),
             'afstand_m': 0.0, 'sprints': 0, 'topsnelheid_m_s': 0.0, 'actieve_s': 0.0},
        )
        s['afstand_m'] = round(s['afstand_m'] + f['afstand_m'], 1)
        s['sprints'] += f['sprints']
        s['topsnelheid_m_s'] = max(s['topsnelheid_m_s'], f['topsnelheid_m_s'])
        s['actieve_s'] = round(s['actieve_s'] + f['actieve_s'], 1)
    return list(per_speler.values()), anoniem


# ---------------------------------------------------------------------------
# Upload naar de platformbrug
# ---------------------------------------------------------------------------


def upload_fysiek(base: str, match: int, spelers: list[dict], token: str) -> dict:
    url = f'{base.rstrip("/")}/api/cv/match/{match}/fysiek'
    req = urllib.request.Request(
        url,
        data=json.dumps({'spelers': spelers}, ensure_ascii=False).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as antwoord:
            return json.loads(antwoord.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        _fout(f'upload geweigerd ({e.code}) op {url}: {e.read().decode("utf-8", "replace")[:300]}', code=1)
    except urllib.error.URLError as e:
        _fout(f'platform onbereikbaar op {url}: {e.reason}', code=1)
    raise AssertionError('onbereikbaar')


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Fysieke statistiek per speler (loopafstand, sprintjes, topsnelheid) uit tracking-posities.'
    )
    parser.add_argument('--posities', type=Path, required=True, help='posities-JSONL uit tracking.py')
    parser.add_argument('--uit', type=Path, required=True, help='uitvoerbestand (JSON)')
    parser.add_argument('--toewijzing', type=Path, default=None,
                        help='JSON spoor → speler: {"1": {"team": "thuis", "rugnummer": 7}, …}')
    parser.add_argument('--sjabloon', type=Path, default=None,
                        help='schrijf een invulklaar toewijzingsbestand met hints per spoor naar dit pad')
    parser.add_argument('--demo', action='store_true',
                        help='gebruik de vaste toewijzing van de demo-sporen (1-4 thuis, 5-8 uit)')
    parser.add_argument('--sprint-drempel', type=float, default=SPRINT_DREMPEL_M_S,
                        help='sprintdrempel in m/s (standaard 4.0)')
    parser.add_argument('--sprint-duur', type=float, default=SPRINT_MIN_DUUR_S,
                        help='minimale sprintduur in seconden (standaard 1.0)')
    parser.add_argument('--glad-venster', type=float, default=GLAD_VENSTER_S,
                        help=f'gladstrijkvenster in seconden vóór de meters geteld worden '
                             f'(standaard {GLAD_VENSTER_S:g}; 0 = rauw tellen, telt meetruis mee)')
    parser.add_argument('--upload', action='store_true', help='resultaat naar het platform sturen')
    parser.add_argument('--base', default='http://localhost:3000', help='basis-URL van het platform')
    parser.add_argument('--match', type=int, default=None, help='match-id op het platform (vereist bij --upload)')
    parser.add_argument('--token', default=None, help='bridge-token (standaard uit CV_BRIDGE_TOKEN)')
    args = parser.parse_args(argv)

    if not args.posities.is_file():
        _fout(f'positiebestand niet gevonden: {args.posities} (maak het met cv/tracking.py)')
    if args.demo and args.toewijzing is not None:
        parser.error('--demo gaat niet samen met --toewijzing — kies één bron voor wie-is-wie')

    posities = lees_posities(args.posities)
    if not posities:
        _fout(f'{args.posities} bevat geen posities')

    if args.demo:
        toewijzing = demo_toewijzing()
    elif args.toewijzing is not None:
        if not args.toewijzing.is_file():
            _fout(f'toewijzingsbestand niet gevonden: {args.toewijzing}')
        toewijzing = json.loads(args.toewijzing.read_text(encoding='utf-8'))
        if not isinstance(toewijzing, dict):
            _fout('toewijzing moet een JSON-object zijn: {"spoor": {"team": …, "rugnummer": …}}')
    else:
        toewijzing = {}

    per_spoor = fysiek_per_spoor(posities, sprint_drempel=args.sprint_drempel,
                                 sprint_min_duur=args.sprint_duur, glad_venster=args.glad_venster)
    if args.sjabloon is not None:
        args.sjabloon.write_text(
            json.dumps(sjabloon_toewijzing(posities, per_spoor), indent=2, ensure_ascii=False) + '\n',
            encoding='utf-8',
        )
        print(f'Toewijzingssjabloon met hints → {args.sjabloon} (vul team + rugnummer in en draai '
              f'opnieuw met --toewijzing {args.sjabloon})')
    spelers, anoniem = bundel_per_speler(per_spoor, toewijzing)
    spelers.sort(key=lambda s: (s['team'], s['rugnummer']))

    resultaat = {'per_speler': spelers, 'per_spoor': {str(k): v for k, v in sorted(per_spoor.items())}}
    args.uit.write_text(json.dumps(resultaat, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    print(f'{len(per_spoor)} sporen → {len(spelers)} spelers → {args.uit}')
    for s in spelers:
        naam = f' {s["naam"]}' if 'naam' in s else ''
        print(f'  {s["team"]:5s} #{s["rugnummer"]:<2d}{naam}: {s["afstand_m"]:g} m gelopen, '
              f'{s["sprints"]} sprintjes, top {s["topsnelheid_m_s"]:g} m/s')
    if anoniem:
        print(f'  {len(anoniem)} spo(o)r(en) zonder toewijzing (niet geüpload): {anoniem} '
              f'— vul ze aan in een --toewijzing-bestand')

    if args.upload:
        if args.match is None:
            _fout('--upload vereist --match')
        if not spelers:
            _fout('niets te uploaden: geen enkel spoor kreeg een speler toegewezen')
        token = args.token or os.environ.get('CV_BRIDGE_TOKEN')
        if not token:
            _fout('geen token — zet CV_BRIDGE_TOKEN of geef --token mee')
        antwoord = upload_fysiek(args.base, args.match, spelers, token)
        print(f'Geüpload naar match {args.match}: {antwoord.get("spelers", len(spelers))} spelers')


if __name__ == '__main__':
    main()
