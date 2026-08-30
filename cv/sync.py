#!/usr/bin/env python3
"""Sync-tool (fase 0): manuele tags van het platform → weak labels (JSONL).

Haalt de bestaande, handmatig aangetekende worp-events op via de importbrug
van het platform en zet ze om naar weak labels voor latere training. Een event
is syncbaar zodra de video-offset van zijn helft gekend is (het platform rekent
gameClock + offset zelf om naar ``video_time_s``).

    GET {--base}/api/cv/match/{--match}/labels
    Authorization: Bearer $CV_BRIDGE_TOKEN

Antwoordcontract (gespiegeld aan het platform-endpoint; de int-test
tests/int/cv-brug.int.spec.ts legt deze vorm vast):
    {
      "match":   { id, ploegen: {home, away}, videoUrl, videoOffsetH1,
                   videoOffsetH2, goalAreaDepth },
      "labels":  [ { half, gameClock, video_time_s|null, event_type, worp_type,
                     outcome, landing: {x_norm, y_norm, x_m, y_m}|null,
                     speler: {team, rugnummer}|null } ],
      "rapport": { totaal, syncbaar, nietSyncbaar }
    }

Uitvoer: JSONL, één event per regel volgens het event-JSON-schema van de brug
(zie cv/README.md). ``frame`` = round(video_time_s × --fps) als --fps is
opgegeven, anders null.

Gebruik:
    export CV_BRIDGE_TOKEN=…
    python3 cv/sync.py --base https://krachtbal.live --match 42 --fps 2 \
        --uit labels_match42.jsonl

Puur stdlib (urllib) — geen extra dependencies nodig.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import veld  # noqa: E402

# Provenance van deze weak labels: menselijke aantekenaar, gesynct door dit script.
PROVENANCE = {'model': 'manuele-tags', 'model_version': 'fase0-sync-0.1.0'}


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    sys.exit(code)


def haal_labels(base: str, match_id: int, token: str) -> dict:
    """GET de weak-label-payload van het platform."""
    url = f'{base.rstrip("/")}/api/cv/match/{match_id}/labels'
    verzoek = urllib.request.Request(
        url,
        headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json'},
    )
    try:
        with urllib.request.urlopen(verzoek, timeout=30) as antwoord:
            return json.loads(antwoord.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', errors='replace')[:500]
        _fout(f'platform antwoordde {e.code} op {url}:\n{detail}', code=1)
    except urllib.error.URLError as e:
        _fout(f'kon {url} niet bereiken: {e.reason}', code=1)
    except json.JSONDecodeError:
        _fout(f'{url} gaf geen geldige JSON terug', code=1)


def naar_weak_label(
    event: dict, match_id: int, diepte: float, fps: float | None,
) -> dict:
    """Zet één platform-event om naar het event-JSON-schema van de brug."""
    video_time_s = float(event['video_time_s'])
    landing = event.get('landing')
    zone = None
    if landing is not None:
        zone = {
            'in_doelgebied': veld.in_doelgebied(
                float(landing['y_norm']), diepte, x_norm=float(landing['x_norm'])
            ),
            'x_m': float(landing['x_m']),
            'y_m': float(landing['y_m']),
        }
    return {
        'match_id': match_id,
        'video_time_s': video_time_s,
        'frame': round(video_time_s * fps) if fps is not None else None,
        # Het endpoint levert enkel worp/doelpunt als event_type; de afloop zit in
        # 'outcome'. Voor de trainingsdata onderscheiden we ook vangst en buitenspel —
        # dat zijn precies de klassen die de eventherkenning later moet leren.
        'event_type': _event_type_met_outcome(event),
        'worp_type': event.get('worp_type'),
        'zone': zone,
        # afstand en score worden in fase 0 niet afgeleid; het platform blijft de
        # bron van waarheid (event-sourcing) — weak labels dragen enkel wat de CV
        # later moet leren zien.
        'afstand_m': None,
        'speler': event.get('speler'),
        'score_delta': 0,
        # manuele tags: volle zekerheid als label, maar de tijdsuitlijning is "weak"
        'confidence': 1.0,
        'provenance': dict(PROVENANCE),
    }


def _event_type_met_outcome(event: dict) -> str:
    """Verfijn het event_type met de afloop: caught → vangst, out_* → buitenspel."""
    outcome = event.get('outcome')
    if outcome == 'caught':
        return 'vangst'
    if outcome in ('out_side', 'out_back'):
        return 'buitenspel'
    return event['event_type']


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Sync manuele tags van het platform naar weak labels (JSONL).'
    )
    parser.add_argument(
        '--base', default='http://localhost:3000',
        help='basis-URL van het platform (standaard http://localhost:3000)',
    )
    parser.add_argument('--match', type=int, required=True, help='match-id op het platform')
    parser.add_argument(
        '--fps', type=float, default=None,
        help='extractie-fps van de frames; vult frame = round(video_time_s × fps) in',
    )
    parser.add_argument(
        '--uit', type=Path, default=None,
        help='uitvoerbestand (standaard labels_match<id>.jsonl)',
    )
    parser.add_argument(
        '--token', default=None,
        help='bridge-token (standaard uit omgevingsvariabele CV_BRIDGE_TOKEN)',
    )
    args = parser.parse_args(argv)

    token = args.token or os.environ.get('CV_BRIDGE_TOKEN')
    if not token:
        _fout('geen token — zet CV_BRIDGE_TOKEN of geef --token mee')
    if args.fps is not None and args.fps <= 0:
        _fout('--fps moet groter zijn dan 0')

    data = haal_labels(args.base, args.match, token)
    match = data.get('match', {})
    events = data.get('labels', [])
    diepte = float(match.get('goalAreaDepth') or veld.STANDAARD_DOELGEBIED_DIEPTE_M)

    uitpad = args.uit if args.uit is not None else Path(f'labels_match{args.match}.jsonl')
    gesynct = 0
    niet_syncbaar_per_helft: dict[int, int] = {}
    with uitpad.open('w', encoding='utf-8') as f:
        for event in events:
            if event.get('video_time_s') is None:
                helft = int(event.get('half') or 0)
                niet_syncbaar_per_helft[helft] = niet_syncbaar_per_helft.get(helft, 0) + 1
                continue
            label = naar_weak_label(event, args.match, diepte, args.fps)
            f.write(json.dumps(label, ensure_ascii=False) + '\n')
            gesynct += 1

    # Rapport
    totaal = len(events)
    ploegen = match.get('ploegen') or {}
    thuis, uit = ploegen.get('home', '?'), ploegen.get('away', '?')
    print(f'Match {args.match}: {thuis} — {uit} (doelgebied {diepte:g} m)')
    print(f'{gesynct} van {totaal} events gesynct → {uitpad}')
    for helft in sorted(niet_syncbaar_per_helft):
        aantal = niet_syncbaar_per_helft[helft]
        offset_veld = f'videoOffsetH{helft}' if helft in (1, 2) else 'video-offset'
        print(
            f'  {aantal} events uit helft {helft} niet syncbaar: '
            f'{offset_veld} van deze helft ontbreekt op het platform'
        )
    rapport = data.get('rapport')
    if rapport and rapport.get('syncbaar') != gesynct:
        # Wijkt onze telling af van wat het platform zelf rapporteert, dan is het
        # contract gebroken — dat mag een pipeline nooit stilletjes passeren.
        _fout(
            f'platform-rapport meldt {rapport.get("syncbaar")} syncbare events '
            f'(totaal {rapport.get("totaal")}), lokaal geteld: {gesynct} — contract gebroken'
        )


if __name__ == '__main__':
    main()
