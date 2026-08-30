#!/usr/bin/env python3
"""Fase 6: de hertraining-lus sluiten — reviewcorrecties ophalen als ground truth.

Het plan belooft het overal: "corrections feed back into training". Dit is die
stap. Elke review in de browser (bevestigen, afwijzen, worptype/soort/speler
corrigeren) wordt hier opgehaald als trainingsdata met de bevroren modelclaim
ernaast — "model zei X, mens zei Y". Afgewezen voorstellen zijn even waardevol
als bevestigde: dat zijn de valse positieven die de volgende modelversie moet
afleren.

    export CV_BRIDGE_TOKEN=…
    python3 cv/groundtruth.py --base https://krachtbal.live --match 42 \
        --uit groundtruth_match42.jsonl

Uitvoer: JSONL, één regel per gereviewd voorstel (de vorm van het
reviews-endpoint, zie hieronder), plus een rapport op stdout. Meerdere matchen
achter elkaar ophalen en de bestanden aaneenplakken = de trainingsset.

Antwoordcontract van GET {base}/api/cv/match/{id}/reviews (de int-test
tests/int/cv-brug.int.spec.ts legt deze vorm vast):
    { "match": { id }, "reviews": [ { id, video_time_s, event_type, verdict,
        worp_type, worp_type_origineel, side, rugnummer, in_doelgebied,
        x_m, y_m, afstand_m, confidence, provenance: {model, model_version} } ],
      "rapport": { totaal, bevestigd, afgewezen, worp_type_gecorrigeerd } }
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


def haal_reviews(base: str, match_id: int, token: str) -> dict:
    url = f'{base.rstrip("/")}/api/cv/match/{match_id}/reviews'
    verzoek = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(verzoek, timeout=30) as antwoord:
            return json.loads(antwoord.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            _fout('geen toegang (401) — klopt CV_BRIDGE_TOKEN met het platform?')
        if e.code == 404:
            _fout(f'wedstrijd {match_id} bestaat niet op het platform (404)')
        _fout(f'{url} antwoordde {e.code}: {e.read().decode("utf-8", "replace")[:200]}')
    except (urllib.error.URLError, TimeoutError) as e:
        _fout(f'kon {url} niet bereiken: {getattr(e, "reason", e)}')
    raise AssertionError('onbereikbaar')


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Fase 6: gereviewde CV-voorstellen ophalen als ground truth (JSONL).'
    )
    parser.add_argument('--base', default='http://localhost:3000',
                        help='basis-URL van het platform (standaard http://localhost:3000)')
    parser.add_argument('--match', type=int, required=True, help='match-id op het platform')
    parser.add_argument('--uit', type=Path, default=None,
                        help='uitvoerbestand (standaard groundtruth_match<id>.jsonl)')
    parser.add_argument('--token', default=None,
                        help='bridge-token (standaard uit omgevingsvariabele CV_BRIDGE_TOKEN)')
    args = parser.parse_args(argv)

    token = args.token or os.environ.get('CV_BRIDGE_TOKEN')
    if not token:
        _fout('geen token — zet CV_BRIDGE_TOKEN of geef --token mee')

    data = haal_reviews(args.base, args.match, token)
    reviews = data.get('reviews', [])
    rapport = data.get('rapport') or {}

    uitpad = args.uit if args.uit is not None else Path(f'groundtruth_match{args.match}.jsonl')
    with uitpad.open('w', encoding='utf-8') as f:
        for review in reviews:
            f.write(json.dumps(review, ensure_ascii=False) + '\n')

    # Kruiscontrole zoals sync.py: wijkt onze telling af van het platformrapport,
    # dan is het contract gebroken en mag dat nooit stil passeren.
    if rapport and rapport.get('totaal') != len(reviews):
        _fout(
            f'platform-rapport meldt {rapport.get("totaal")} reviews, '
            f'lokaal geteld: {len(reviews)} — contract gebroken'
        )

    print(f'Match {args.match}: {len(reviews)} gereviewde voorstellen → {uitpad}')
    print(
        f'  {rapport.get("bevestigd", "?")} bevestigd · {rapport.get("afgewezen", "?")} afgewezen '
        f'(valse positieven om af te leren) · {rapport.get("worp_type_gecorrigeerd", "?")} worptype-correcties'
    )
    if not reviews:
        print('  Nog niets gereviewd — open de analysepagina en werk de voorstellen af.')


if __name__ == '__main__':
    main()
