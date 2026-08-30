#!/usr/bin/env python3
"""Fase 4: highlightclips per speler/doelpunt uit bevestigde events (FFmpeg).

Knipt korte, deelbare clips uit de wedstrijdvideo rond de events die je al
hebt: de weak labels van ``sync.py`` (de manuele tags — de waarheid van het
platform) of de gereviewde detecties van fase 1–3. Geen ML — gewoon de
eventdata die er al is, precies zoals het plan fase 4 omschrijft.

Voorbeelden:
    # Alle doelpunten van de match, elk als eigen clip:
    python3 cv/highlights.py --video match.mp4 --events labels_match42.jsonl \
        --doelpunten --uitmap clips/

    # Alles van speler #7 van de thuisploeg:
    python3 cv/highlights.py --video match.mp4 --events labels_match42.jsonl \
        --speler 7 --team home --uitmap clips/

    # Eén samenvattingsvideo van alle doelpunten:
    python3 cv/highlights.py --video match.mp4 --events labels_match42.jsonl \
        --doelpunten --samenvoegen hoogtepunten.mp4 --uitmap clips/

Standaard wordt er hergecodeerd (frame-nauwkeurig knippen); ``--kopie`` knipt
zonder hercodering — veel sneller, maar de snede verspringt dan naar het
dichtstbijzijnde keyframe en kan dus een tel te vroeg beginnen.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from evaluate import lees_jsonl  # noqa: E402

VOORLOOP_S = 8.0
NALOOP_S = 5.0


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


# ---------------------------------------------------------------------------
# Selectie en naamgeving (puur — getest zonder ffmpeg)
# ---------------------------------------------------------------------------


def is_doelpunt(event: dict) -> bool:
    """Doelpunt = event_type 'doelpunt' óf een positieve score_delta (fase 2)."""
    if event.get('event_type') == 'doelpunt':
        return True
    try:
        return int(event.get('score_delta') or 0) > 0
    except (TypeError, ValueError):
        return False


def selecteer(
    events: list[dict],
    doelpunten: bool,
    speler: int | None,
    team: str | None,
) -> list[dict]:
    """Filter de events: doelpunten en/of één speler (rugnummer, eventueel + team)."""
    uit = []
    for event in events:
        if not isinstance(event.get('video_time_s'), (int, float)):
            continue  # zonder videotijd valt er niets te knippen
        if doelpunten and not is_doelpunt(event):
            continue
        sp = event.get('speler') or {}
        if speler is not None and sp.get('rugnummer') != speler:
            continue
        if team is not None and sp.get('team') != team:
            continue
        uit.append(event)
    return sorted(uit, key=lambda e: float(e['video_time_s']))


def clipvenster(video_time_s: float, voorloop: float, naloop: float) -> tuple[float, float]:
    """(start, duur) van de clip; de start klemt op 0 zonder de naloop op te rekken."""
    start = max(0.0, video_time_s - voorloop)
    einde = video_time_s + naloop
    return start, einde - start


def _veilig(tekst: str) -> str:
    return re.sub(r'[^\w-]+', '_', tekst).strip('_') or 'x'


def clipnaam(event: dict, volgnummer: int) -> str:
    """Sprekende bestandsnaam: 03_doelpunt_12m34_rugworp_home7.mp4."""
    t = float(event['video_time_s'])
    tijd = f'{int(t // 60):02d}m{int(t % 60):02d}'
    delen = [f'{volgnummer:02d}', _veilig(str(event.get('event_type') or 'event')), tijd]
    if event.get('worp_type'):
        delen.append(_veilig(str(event['worp_type'])))
    sp = event.get('speler') or {}
    if sp.get('team') in ('home', 'away'):
        wie = 'thuis' if sp['team'] == 'home' else 'uit'
        if sp.get('rugnummer') is not None:
            wie += str(sp['rugnummer'])
        delen.append(wie)
    return '_'.join(delen) + '.mp4'


def ffmpeg_commando(
    video: Path,
    uitpad: Path,
    start: float,
    duur: float,
    kopie: bool,
) -> list[str]:
    """Het knip-commando. -ss vóór -i = snelle seek; hercoderen maakt de snede exact."""
    basis = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{start:.3f}', '-i', str(video), '-t', f'{duur:.3f}']
    if kopie:
        basis += ['-c', 'copy']
    else:
        # H.264 + AAC: speelt overal (WhatsApp, gsm); faststart zet de index vooraan
        # zodat de clip meteen start bij het delen.
        basis += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart']
    return basis + [str(uitpad)]


def concat_lijst(clips: list[Path]) -> str:
    """Inhoud van het ffmpeg-concatbestand (paden met quotes, één per regel)."""
    return '\n'.join(f"file '{p.as_posix()}'" for p in clips) + '\n'


# ---------------------------------------------------------------------------
# Uitvoeren
# ---------------------------------------------------------------------------


def _draai(commando: list[str], omschrijving: str) -> None:
    try:
        resultaat = subprocess.run(commando, capture_output=True, text=True)
    except FileNotFoundError:
        _fout('ffmpeg niet gevonden — installeer het (bv. apt install ffmpeg / brew install ffmpeg)')
    if resultaat.returncode != 0:
        _fout(f'{omschrijving} mislukt:\n{resultaat.stderr.strip()}')


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Fase 4: knip highlightclips (FFmpeg) rond bevestigde events.'
    )
    parser.add_argument('--video', type=Path, required=True, help='de wedstrijdvideo')
    parser.add_argument('--events', type=Path, required=True,
                        help='event-JSONL: weak labels (sync.py) of gereviewde detecties')
    parser.add_argument('--uitmap', type=Path, default=Path('clips'), help='map voor de clips (standaard clips/)')
    parser.add_argument('--doelpunten', action='store_true', help='enkel doelpunten knippen')
    parser.add_argument('--speler', type=int, default=None, help='enkel events van dit rugnummer')
    parser.add_argument('--team', choices=('home', 'away'), default=None, help='enkel events van deze ploeg')
    parser.add_argument('--voorloop', type=float, default=VOORLOOP_S, help='seconden vóór het event (standaard 8)')
    parser.add_argument('--naloop', type=float, default=NALOOP_S, help='seconden ná het event (standaard 5)')
    parser.add_argument('--kopie', action='store_true',
                        help='knip zonder hercodering (sneller, maar op keyframe-grenzen)')
    parser.add_argument('--samenvoegen', type=Path, default=None,
                        help='plak alle clips ook aaneen tot deze samenvattingsvideo')
    args = parser.parse_args(argv)

    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')
    if not args.events.is_file():
        _fout(f'eventbestand niet gevonden: {args.events}')
    if args.voorloop < 0 or args.naloop <= 0:
        _fout('--voorloop moet ≥ 0 zijn en --naloop > 0')
    if args.samenvoegen is not None and args.kopie:
        # Concat met -c copy vereist identieke codec-parameters; kopie-clips erven die
        # van de bron en dat is prima — maar gemengde bronnen niet. Hier is er één bron.
        pass

    events = selecteer(lees_jsonl(args.events), args.doelpunten, args.speler, args.team)
    if not events:
        _fout('geen events over na filtering — niets te knippen (controleer --doelpunten/--speler/--team)')

    args.uitmap.mkdir(parents=True, exist_ok=True)
    clips: list[Path] = []
    manifest: list[dict] = []
    for volgnummer, event in enumerate(events, start=1):
        start, duur = clipvenster(float(event['video_time_s']), args.voorloop, args.naloop)
        uitpad = args.uitmap / clipnaam(event, volgnummer)
        _draai(ffmpeg_commando(args.video, uitpad, start, duur, args.kopie), f'clip {uitpad.name} knippen')
        clips.append(uitpad)
        manifest.append({
            'bestand': uitpad.name,
            'video_time_s': event['video_time_s'],
            'event_type': event.get('event_type'),
            'worp_type': event.get('worp_type'),
            'speler': event.get('speler'),
            'score_delta': event.get('score_delta'),
        })
        print(f'  ✂ {uitpad.name} ({duur:.0f} s vanaf {start:.1f} s)')

    (args.uitmap / 'manifest.json').write_text(
        json.dumps({'video': str(args.video), 'clips': manifest}, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(f'{len(clips)} clips → {args.uitmap} (manifest.json erbij)')

    if args.samenvoegen is not None:
        lijstpad = args.uitmap / 'concat.txt'
        lijstpad.write_text(concat_lijst(clips), encoding='utf-8')
        _draai(
            ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
             '-i', str(lijstpad), '-c', 'copy', str(args.samenvoegen)],
            'samenvatting plakken',
        )
        print(f'Samenvatting → {args.samenvoegen}')


if __name__ == '__main__':
    main()
