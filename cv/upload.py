#!/usr/bin/env python3
"""Upload-tool (fase 0): CV-events als VOORSTELLEN naar het platform.

Leest een JSON- of JSONL-bestand met events (event-JSON-schema van de brug,
zie cv/README.md) en POST ze naar de importbrug:

    POST {--base}/api/cv/events
    Authorization: Bearer $CV_BRIDGE_TOKEN
    Body: { "matchId": <id>, "events": [ … ] }

Antwoordcontract (src/app/api/cv/events/route.ts):
    { "aanvaard": <aantal>, "geweigerd": [ { "index": <0-gebaseerd>, "reden": "…" } ] }

De route aanvaardt max. 500 events per aanroep; dit script batcht daar zelf op
(--batch). Het platform slaat aanvaarde events op als VOORSTELLEN
(reviewed=false, met confidence en provenance) — nooit als waarheid; de
throws-collection blijft onaangeroerd tot een mens het voorstel bevestigt.

Gebruik:
    export CV_BRIDGE_TOKEN=…
    python3 cv/upload.py --bestand labels_match42.jsonl --base https://krachtbal.live

Per event wordt aanvaard/geweigerd + de reden afgedrukt.
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


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    sys.exit(code)


def lees_events(pad: Path) -> list[dict]:
    """Lees events uit .jsonl (één per regel) of .json (array of {"events": […]})."""
    tekst = pad.read_text(encoding='utf-8')
    if pad.suffix == '.jsonl':
        events = []
        for nummer, regel in enumerate(tekst.splitlines(), start=1):
            regel = regel.strip()
            if not regel:
                continue
            try:
                events.append(json.loads(regel))
            except json.JSONDecodeError as e:
                _fout(f'{pad}:{nummer}: ongeldige JSON ({e})')
        return events
    try:
        data = json.loads(tekst)
    except json.JSONDecodeError as e:
        _fout(f'{pad}: ongeldige JSON ({e})')
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get('events'), list):
        return data['events']
    _fout(f'{pad}: verwacht een JSON-array, een {{"events": […]}}-object of een .jsonl-bestand')


def bepaal_match_id(events: list[dict], expliciet: int | None) -> int:
    """Match-id uit --match, anders uit de events zelf (moet eenduidig zijn)."""
    if expliciet is not None:
        return expliciet
    ids = {e.get('match_id') for e in events if e.get('match_id') is not None}
    if len(ids) == 1:
        return int(next(iter(ids)))
    if not ids:
        _fout('geen match_id in de events — geef --match mee')
    _fout(f'events bevatten meerdere match_id’s ({sorted(ids)}) — geef --match mee')


def post_events(base: str, token: str, match_id: int, events: list[dict]) -> dict:
    url = f'{base.rstrip("/")}/api/cv/events'
    body = json.dumps({'matchId': match_id, 'events': events}, ensure_ascii=False).encode('utf-8')
    verzoek = urllib.request.Request(
        url,
        data=body,
        method='POST',
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    )
    try:
        with urllib.request.urlopen(verzoek, timeout=60) as antwoord:
            return json.loads(antwoord.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', errors='replace')[:500]
        _fout(f'platform antwoordde {e.code} op {url}:\n{detail}', code=1)
    except urllib.error.URLError as e:
        _fout(f'kon {url} niet bereiken: {e.reason}', code=1)
    except json.JSONDecodeError:
        _fout(f'{url} gaf geen geldige JSON terug', code=1)


def _event_omschrijving(event: dict) -> str:
    tijd = event.get('video_time_s')
    tijd_tekst = f'@ {tijd:.1f}s' if isinstance(tijd, (int, float)) else '@ ?'
    return f'{event.get("event_type", "?")} {tijd_tekst}'


def druk_resultaten(events: list[dict], antwoord: dict, offset: int) -> int:
    """Druk per event aanvaard/geweigerd + reden af; geeft het aantal geweigerde terug.

    Contract van de route: { aanvaard: <aantal>, geweigerd: [{index, reden}] } met
    0-gebaseerde indexen BINNEN de gepostte batch; `offset` is de positie van de
    batch in het volledige bestand. Wijkt het antwoord af, dan integraal afdrukken.
    """
    geweigerd_lijst = antwoord.get('geweigerd')
    if not isinstance(geweigerd_lijst, list):
        print('Antwoord van het platform (onbekende vorm, integraal):')
        print(json.dumps(antwoord, indent=2, ensure_ascii=False))
        return 0

    geweigerd_per_index = {
        r.get('index'): r.get('reden') or 'geen reden opgegeven'
        for r in geweigerd_lijst
        if isinstance(r, dict)
    }
    for i, event in enumerate(events):
        nummer = offset + i + 1  # 1-gebaseerd, over het hele bestand
        omschrijving = _event_omschrijving(event)
        if i in geweigerd_per_index:
            print(f'  ✘ event {nummer} ({omschrijving}): geweigerd — {geweigerd_per_index[i]}')
        else:
            print(f'  ✔ event {nummer} ({omschrijving}): aanvaard')
    return len(geweigerd_per_index)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Upload CV-events als voorstellen naar de importbrug van het platform.'
    )
    parser.add_argument('--bestand', type=Path, required=True, help='events als .json of .jsonl')
    parser.add_argument(
        '--base', default='http://localhost:3000',
        help='basis-URL van het platform (standaard http://localhost:3000)',
    )
    parser.add_argument(
        '--match', type=int, default=None,
        help='match-id (standaard afgeleid uit match_id in de events)',
    )
    parser.add_argument(
        '--token', default=None,
        help='bridge-token (standaard uit omgevingsvariabele CV_BRIDGE_TOKEN)',
    )
    parser.add_argument(
        '--batch', type=int, default=500,
        help='max. events per POST (de route weigert er meer dan 500; standaard 500)',
    )
    args = parser.parse_args(argv)

    token = args.token or os.environ.get('CV_BRIDGE_TOKEN')
    if not token:
        _fout('geen token — zet CV_BRIDGE_TOKEN of geef --token mee')
    if not args.bestand.is_file():
        _fout(f'bestand niet gevonden: {args.bestand}')
    if not 1 <= args.batch <= 500:
        _fout('--batch moet tussen 1 en 500 liggen')

    events = lees_events(args.bestand)
    if not events:
        _fout(f'{args.bestand} bevat geen events')
    match_id = bepaal_match_id(events, args.match)

    print(f'{len(events)} events uploaden naar match {match_id} …')
    geweigerd = 0
    for offset in range(0, len(events), args.batch):
        batch = events[offset : offset + args.batch]
        antwoord = post_events(args.base, token, match_id, batch)
        geweigerd += druk_resultaten(batch, antwoord, offset)
    print(f'Klaar: {len(events) - geweigerd} aanvaard, {geweigerd} geweigerd.')


if __name__ == '__main__':
    main()
