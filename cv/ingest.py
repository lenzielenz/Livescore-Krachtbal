#!/usr/bin/env python3
"""Video-ingest voor de CV-pipeline (fase 0).

Haalt frames uit een wedstrijdvideo (gsm/GoPro) op een instelbare fps en
schrijft ze naar een uitvoermap, samen met een ``metadata.json`` (resolutie,
bron-fps, duur, extractie-instellingen) opgevraagd via ffprobe.

Vereist ffmpeg + ffprobe als systeembinaries (geen Python-bindings).

Gebruik:
    python3 cv/ingest.py wedstrijd.mp4 --fps 2 --uit frames/wedstrijd

Frame-nummering: ffmpeg nummert bestanden vanaf 1 (frame_000001.jpg), maar de
frame-INDEX in de rest van de pipeline (sync.py: frame = round(video_time_s × fps))
is 0-gebaseerd. Dus: bestandsnaam = frame_{index + 1:06d}. Dit staat ook als
``frame_offset`` in metadata.json.
"""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

INSTALLATIE_HINT = (
    'Installeer ffmpeg (bevat ook ffprobe): bv. `apt install ffmpeg` (Debian/Ubuntu), '
    '`brew install ffmpeg` (macOS) of via https://ffmpeg.org/download.html'
)


def _fout(boodschap: str, code: int = 2) -> 'None':
    print(f'FOUT: {boodschap}', file=sys.stderr)
    sys.exit(code)


def _draai(commando: list[str], omschrijving: str) -> subprocess.CompletedProcess:
    """Voer een extern commando uit met nette foutmeldingen als het ontbreekt/faalt."""
    try:
        proces = subprocess.run(commando, capture_output=True, text=True)
    except FileNotFoundError:
        _fout(f'`{commando[0]}` niet gevonden — nodig voor {omschrijving}. {INSTALLATIE_HINT}')
    if proces.returncode != 0:
        stderr = (proces.stderr or '').strip()
        _fout(f'{omschrijving} mislukt (exitcode {proces.returncode}):\n{stderr}', code=1)
    return proces


def _parse_breuk(breuk: str) -> float | None:
    """ffprobe geeft framerates als breuk ('30000/1001') — reken om naar float."""
    try:
        if '/' in breuk:
            teller, noemer = breuk.split('/', 1)
            if float(noemer) == 0:
                return None
            return float(teller) / float(noemer)
        return float(breuk)
    except (ValueError, TypeError):
        return None


def lees_video_info(video: Path) -> dict:
    """Vraag resolutie, bron-fps en duur op via ffprobe."""
    proces = _draai(
        [
            'ffprobe',
            '-v', 'error',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            str(video),
        ],
        f'metadata uitlezen van {video.name} (ffprobe)',
    )
    try:
        info = json.loads(proces.stdout)
    except json.JSONDecodeError:
        _fout('ffprobe gaf geen geldige JSON terug — is dit wel een videobestand?', code=1)

    videostream = next(
        (s for s in info.get('streams', []) if s.get('codec_type') == 'video'), None
    )
    if videostream is None:
        _fout(f'geen videostream gevonden in {video} — is dit wel een videobestand?', code=1)

    duur_s = None
    for bron in (info.get('format', {}).get('duration'), videostream.get('duration')):
        if bron is not None:
            try:
                duur_s = float(bron)
                break
            except (ValueError, TypeError):
                continue

    return {
        'breedte': videostream.get('width'),
        'hoogte': videostream.get('height'),
        'fps_bron': _parse_breuk(videostream.get('r_frame_rate', '')),
        'duur_s': duur_s,
        'codec': videostream.get('codec_name'),
    }


def extraheer_frames(video: Path, uitmap: Path, fps: float, formaat: str, kwaliteit: int) -> int:
    """Extraheer frames op `fps` beelden per seconde; geeft het aantal frames terug."""
    uitmap.mkdir(parents=True, exist_ok=True)
    # Restanten van een eerdere run (langere video, hogere fps) zouden anders
    # meegeteld worden in metadata.json en verweesd achterblijven.
    for oud in uitmap.glob('frame_*.*'):
        oud.unlink()
    patroon = uitmap / f'frame_%06d.{formaat}'
    commando = [
        'ffmpeg',
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', str(video),
        '-vf', f'fps={fps}',
    ]
    if formaat in ('jpg', 'jpeg'):
        commando += ['-q:v', str(kwaliteit)]
    commando.append(str(patroon))
    _draai(commando, f'frames extraheren uit {video.name} (ffmpeg)')
    return len(list(uitmap.glob(f'frame_*.{formaat}')))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='Extraheer frames + metadata uit een wedstrijdvideo (fase 0 ingest).'
    )
    parser.add_argument('video', type=Path, help='pad naar de videobron (mp4/webm/…)')
    parser.add_argument(
        '--fps', type=float, default=2.0,
        help='extractie-framerate in beelden per seconde (standaard 2.0)',
    )
    parser.add_argument(
        '--uit', type=Path, default=None,
        help='uitvoermap voor frames + metadata.json (standaard frames/<videonaam>)',
    )
    parser.add_argument(
        '--formaat', choices=('jpg', 'png'), default='jpg',
        help='beeldformaat van de frames (standaard jpg)',
    )
    parser.add_argument(
        '--kwaliteit', type=int, default=2,
        help='JPEG-kwaliteit voor ffmpeg -q:v (2 = zeer goed, hoger = kleiner bestand)',
    )
    args = parser.parse_args(argv)

    if not args.video.is_file():
        _fout(f'videobestand niet gevonden: {args.video}')
    if args.fps <= 0:
        _fout('--fps moet groter zijn dan 0')

    uitmap = args.uit if args.uit is not None else Path('frames') / args.video.stem

    print(f'ffprobe: metadata uitlezen van {args.video} …')
    info = lees_video_info(args.video)

    print(f'ffmpeg: frames extraheren op {args.fps} fps naar {uitmap}/ …')
    aantal = extraheer_frames(args.video, uitmap, args.fps, args.formaat, args.kwaliteit)
    if aantal == 0:
        _fout('ffmpeg produceerde geen enkel frame — controleer de video en de fps.', code=1)

    metadata = {
        'video': str(args.video),
        'resolutie': {'breedte': info['breedte'], 'hoogte': info['hoogte']},
        'codec': info['codec'],
        'fps_bron': info['fps_bron'],
        'duur_s': info['duur_s'],
        'fps_extractie': args.fps,
        'aantal_frames': aantal,
        'frame_patroon': f'frame_%06d.{args.formaat}',
        # bestandsnummering start op 1; frame-index in de pipeline is 0-gebaseerd:
        # bestandsnaam = frame_{index + frame_offset:06d}, tijd_s = index / fps_extractie
        'frame_offset': 1,
        'aangemaakt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    metadata_pad = uitmap / 'metadata.json'
    metadata_pad.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    duur = f'{info["duur_s"]:.1f} s' if info['duur_s'] is not None else 'onbekend'
    print(
        f'Klaar: {aantal} frames ({info["breedte"]}×{info["hoogte"]}, bron {info["fps_bron"]} fps, '
        f'duur {duur}) → {uitmap}/'
    )
    print(f'Metadata: {metadata_pad}')


if __name__ == '__main__':
    main()
