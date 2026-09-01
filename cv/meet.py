#!/usr/bin/env python3
"""De eerste echte meting in één commando: video in, acceptatierapport uit.

Rijgt de hele pijplijn aaneen — sync (weak labels van het platform) → detectie
(fase 1) → landing (fase 2) → spelers (fase 3) → evaluatie — zodat de meting op
een echte wedstrijd geen zes losse CLI's met kloppende argumenten vergt maar
één regel:

    export CV_BRIDGE_TOKEN=…
    python3 cv/meet.py --video match.mp4 --match 42 --kalibratie kalibratie.json \
        --base https://krachtbal.live

Vooraf checken of álles klaarstaat voor de wedstrijddag (zonder iets te draaien):

    python3 cv/meet.py --controle --match 42 --base https://krachtbal.live \
        [--video match.mp4 --kalibratie kalibratie.json]

Zonder video werkt de volledige lus ook (om alles te oefenen, reproduceerbaar):

    python3 cv/meet.py --demo --seed 7 --match 42

Werkbestanden (labels, detecties, verrijkingen, het rapport) komen in --uitmap
(standaard meting_match<id>/), zodat elke tussenstap na te kijken blijft. Met
--upload gaan de eindvoorstellen daarna naar de reviewbrug van het platform.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

CV_MAP = Path(__file__).resolve().parent


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


# ---------------------------------------------------------------------------
# Het stappenplan (puur — getest zonder iets te draaien)
# ---------------------------------------------------------------------------


def maten_argumenten(breedte: float | None, speelveld: float | None) -> list[str]:
    """--breedte/--speelveld, enkel voor wat écht opgemeten is (leeg = reglementair)."""
    return (
        (['--breedte', str(breedte)] if breedte is not None else [])
        + (['--speelveld', str(speelveld)] if speelveld is not None else [])
    )


def diepte_argument(diepte: float | None) -> list[str]:
    """--diepte, enkel wanneer het platform een echte doelgebied-diepte kent.

    Zonder deze vlag rekenen landing, tracking en heatmap met de reglementaire 10 m; op een
    terrein met een doelgebied van 15 m ligt de doellijn dan 4 m verkeerd en wordt een
    landing op y=39 m een vals doelpunt (terwijl de labels van het platform wél in het frame
    van de echte diepte staan). In videomodus wint een kalibratie die zelf een diepte draagt
    — daar is de vlag het vangnet voor oudere kalibratiebestanden zonder dat veld.
    """
    return ['--diepte', str(diepte)] if diepte is not None else []


def bouw_stappen(
    match: int,
    uitmap: Path,
    base: str,
    demo: bool,
    seed: int | None,
    video: Path | None,
    kalibratie: Path | None,
    upload: bool,
    fps: float,
    tracking: bool = False,
    heatmap_png: bool = False,
    breedte: float | None = None,
    speelveld: float | None = None,
    tracking_fps: float = 4.0,
    bewegend: bool = False,
    stand: str = 'gewoon',
    overlay: bool = False,
    diepte: float | None = None,
) -> list[tuple[str, list[str]]]:
    """(omschrijving, argv)-lijst voor de hele pijplijn, in volgorde.

    De stappen roepen de bestaande, elk apart geteste CLI's aan — deze wrapper
    voegt niets inhoudelijks toe, alleen de juiste volgorde en argumenten.
    """
    labels = uitmap / 'labels.jsonl'
    homografie = uitmap / 'homografie.jsonl'
    detecties = uitmap / 'detecties.jsonl'
    met_landing = uitmap / 'met_landing.jsonl'
    met_spelers = uitmap / 'met_spelers.jsonl'
    py = [sys.executable]

    stappen: list[tuple[str, list[str]]] = [
        (
            'weak labels van het platform halen (sync)',
            py + [str(CV_MAP / 'sync.py'), '--base', base, '--match', str(match), '--fps', str(fps), '--uit', str(labels)],
        ),
    ]
    if demo:
        stappen += [
            (
                'kandidaat-worpen (demo met ruis)',
                py + [str(CV_MAP / 'detect_worpen.py'), '--demo', str(labels), '--seed', str(seed),
                      '--match', str(match), '--fps', str(fps), '--uit', str(detecties)],
            ),
            (
                # Zonder kalibratie is het platform de enige bron van de echte terreinmaten:
                # zonder deze vlaggen zou de zone tegen een reglementair veld gelegd worden.
                'landing/zone (demo)',
                py + [str(CV_MAP / 'landing.py'), '--demo', '--detecties', str(detecties), '--labels', str(labels),
                      '--seed', str(seed), '--uit', str(met_landing)]
                + maten_argumenten(breedte, speelveld) + diepte_argument(diepte),
            ),
            (
                'spelers (demo)',
                py + [str(CV_MAP / 'spelers.py'), '--demo', '--detecties', str(met_landing), '--labels', str(labels),
                      '--seed', str(seed), '--uit', str(met_spelers)],
            ),
        ]
    elif bewegend:
        # Bewegende camera: eerst de homografie volgen (en herankeren op de veldlijnen),
        # daarna rekenen landing en tracking per moment met de juiste matrix.
        stappen += [
            (
                'het veld volgen in een bewegend beeld (homografie per moment)',
                py + [str(CV_MAP / 'volg_veld.py'), '--video', str(video), '--kalibratie', str(kalibratie),
                      '--stand', stand, '--uit', str(homografie)],
            ),
            (
                'kandidaat-worpen zoeken in de video (fase 1)',
                py + [str(CV_MAP / 'detect_worpen.py'), str(video), '--match', str(match),
                      '--fps', str(fps), '--uit', str(detecties)],
            ),
            (
                'bal-landing → zone/afstand (fase 2, bewegende camera)',
                py + [str(CV_MAP / 'landing.py'), '--video', str(video), '--homografie', str(homografie),
                      '--kalibratie', str(kalibratie), '--detecties', str(detecties), '--uit', str(met_landing),
                      '--balspoor', str(uitmap / 'balspoor.jsonl')] + diepte_argument(diepte),
            ),
            (
                'spelers herkennen (fase 3)',
                py + [str(CV_MAP / 'spelers.py'), '--video', str(video), '--detecties', str(met_landing),
                      '--uit', str(met_spelers)],
            ),
        ]
    else:
        stappen += [
            (
                # De video is bij detect_worpen een positioneel argument.
                'kandidaat-worpen zoeken in de video (fase 1)',
                py + [str(CV_MAP / 'detect_worpen.py'), str(video), '--match', str(match),
                      '--fps', str(fps), '--uit', str(detecties)],
            ),
            (
                'bal-landing → zone/afstand (fase 2)',
                py + [str(CV_MAP / 'landing.py'), '--video', str(video), '--kalibratie', str(kalibratie),
                      '--detecties', str(detecties), '--uit', str(met_landing),
                      '--balspoor', str(uitmap / 'balspoor.jsonl')] + diepte_argument(diepte),
            ),
            (
                'spelers herkennen (fase 3)',
                py + [str(CV_MAP / 'spelers.py'), '--video', str(video), '--detecties', str(met_landing),
                      '--uit', str(met_spelers)],
            ),
        ]
    if overlay and not demo:
        stappen.append((
            'controlevideo met overlay (veldmodel, gevonden lijnen, bal, spelers)',
            py + [str(CV_MAP / 'overlay.py'), '--video', str(video), '--uit', str(uitmap / 'controle.mp4'),
                  '--balspoor', str(uitmap / 'balspoor.jsonl'), '--lijnen']
            + (['--homografie', str(homografie)] if bewegend else ['--kalibratie', str(kalibratie)])
            + (['--posities', str(uitmap / 'posities.jsonl')] if tracking else []),
        ))
    stappen.append((
        'HET RAPPORT — evaluatie tegen de manuele tags',
        py + [str(CV_MAP / 'evaluate.py'), '--detecties', str(met_spelers), '--labels', str(labels)],
    ))
    if upload:
        stappen.append((
            'voorstellen uploaden naar de reviewbrug',
            py + [str(CV_MAP / 'upload.py'), '--base', base, '--match', str(match), '--bestand', str(met_spelers)],
        ))
    if tracking:
        # Videotracking: posities → fysieke stats per speler → heatmap. In demo is de
        # spoor-toewijzing bekend (vaste 8) en kan fysiek meteen mee uploaden; op echte
        # video schrijft fysiek.py een invulsjabloon (wie.json) — de upload volgt daarna
        # met --toewijzing (zie de slotmelding van dit commando).
        posities = uitmap / 'posities.jsonl'
        fysiek = uitmap / 'fysiek.json'
        wie = uitmap / 'wie.json'
        if demo:
            stappen.append((
                # De tracking bemonstert dichter dan de event-detectie: bij 2/s middelt elke
                # versnelling weg en meet fysiek.py nul sprintjes.
                'videotracking (demo-sporen)',
                py + [str(CV_MAP / 'tracking.py'), '--demo', '--seed', str(seed),
                      '--fps', str(tracking_fps), '--uit', str(posities)]
                + maten_argumenten(breedte, speelveld) + diepte_argument(diepte),
            ))
            stappen.append((
                'fysieke stats per speler (loopafstand, sprintjes, topsnelheid)',
                py + [str(CV_MAP / 'fysiek.py'), '--posities', str(posities), '--demo', '--uit', str(fysiek)]
                + (['--upload', '--base', base, '--match', str(match)] if upload else []),
            ))
        else:
            stappen.append((
                'videotracking (HOG + MOG2-beweging → sporen in veldmeters)',
                py + [str(CV_MAP / 'tracking.py'), '--video', str(video), '--kalibratie', str(kalibratie),
                      '--fps', str(tracking_fps), '--uit', str(posities)]
                + (['--homografie', str(homografie)] if bewegend else []) + diepte_argument(diepte),
            ))
            stappen.append((
                'fysieke stats per spoor + invulsjabloon wie-is-wie',
                py + [str(CV_MAP / 'fysiek.py'), '--posities', str(posities), '--sjabloon', str(wie),
                      '--uit', str(fysiek)],
            ))
        stappen.append((
            # PNG alleen vragen als opencv er is — het JSON-raster is het echte product.
            # De kalibratie draagt de diepte én de echte veldmaten: zonder dat zou het
            # raster op een niet-reglementair terrein posities buiten "het veld" weggooien.
            'heatmap van de posities',
            py + [str(CV_MAP / 'heatmap.py'), '--posities', str(posities), '--uit', str(uitmap / 'heatmap.json')]
            + (maten_argumenten(breedte, speelveld) if demo else ['--kalibratie', str(kalibratie)])
            + diepte_argument(diepte)
            + (['--png', str(uitmap / 'heatmap.png')] if heatmap_png else []),
        ))
    return stappen


def haal_maten(base: str, match: int, token: str) -> tuple[float | None, float | None, float | None]:
    """De opgemeten terreinmaten van deze wedstrijd, van het platform: (breedte, speelveld, diepte).

    De doelgebied-diepte hoort erbij: de labels van het platform staan in het frame van de
    échte diepte, dus zonder haar rekent de zone-bepaling tegen een ander veld dan de labels.
    Leeg = reglementair; bij een onbereikbaar platform geven we (None, None, None) terug —
    de sync-stap hierna faalt dan luid genoeg.
    """
    sys.path.insert(0, str(CV_MAP))
    import sync as sync_mod  # noqa: PLC0415

    try:
        m = (sync_mod.haal_labels(base, match, token) or {}).get('match') or {}
    except SystemExit:
        return None, None, None
    breedte, speelveld, diepte = m.get('veldBreedteM'), m.get('veldSpeelveldM'), m.get('goalAreaDepth')
    return (
        float(breedte) if breedte is not None else None,
        float(speelveld) if speelveld is not None else None,
        float(diepte) if diepte is not None else None,
    )


def waarschuw_bij_afwijkende_kalibratie(
    kalibratie: Path | None, breedte: float | None, speelveld: float | None,
    diepte: float | None = None,
) -> None:
    """De homografie is gefit op de maten in de kalibratie; wijkt het platform daarvan af,
    dan meten beide iets anders. Melden vóór de meting, niet achteraf in het rapport."""
    if kalibratie is None or not kalibratie.is_file():
        return
    try:
        data = json.loads(kalibratie.read_text(encoding='utf-8')) or {}
    except (json.JSONDecodeError, OSError):
        return
    info = data.get('veld') or {}
    for naam, platform, in_kalibratie in (
        ('breedte', breedte, info.get('breedte_m')),
        ('speelveld', speelveld, info.get('speelveld_m')),
        # In videomodus wint de diepte uit de kalibratie van elke vlag (landing/tracking lezen
        # haar dáár), dus een afwijking hier is een echte meetfout — niet alleen cosmetisch.
        # Oudere bestanden droegen het veld op het hoogste niveau (zie calibrate.veldinfo_uit).
        ('diepte', diepte, data.get('doelgebied_diepte_m') or info.get('doelgebied_diepte_m')),
    ):
        if platform is not None and in_kalibratie is not None and abs(float(in_kalibratie) - platform) > 0.05:
            print(f'LET OP: {naam} verschilt — platform {platform:g} m, kalibratie {float(in_kalibratie):g} m. '
                  f'Kalibreer opnieuw met --{naam} {platform:g}, of corrigeer de wedstrijd in het platform.',
                  file=sys.stderr)


# ---------------------------------------------------------------------------
# Controle vooraf: staat alles klaar voor de wedstrijddag?
# ---------------------------------------------------------------------------


def controle(args: argparse.Namespace, token: str | None) -> int:
    """Checklist zonder iets te draaien. Geeft het aantal problemen terug."""
    problemen = 0

    def punt(ok: bool, tekst: str, hulp: str = '') -> None:
        nonlocal problemen
        print(f'  {"✔" if ok else "✘"} {tekst}' + (f' — {hulp}' if not ok and hulp else ''))
        if not ok:
            problemen += 1

    print('Controle vooraf:')
    punt(token is not None, 'CV_BRIDGE_TOKEN gezet', 'export CV_BRIDGE_TOKEN=… (zelfde als op het platform)')
    punt(shutil.which('ffmpeg') is not None, 'ffmpeg geïnstalleerd', 'apt install ffmpeg / brew install ffmpeg')
    try:
        import cv2  # noqa: F401, PLC0415
        punt(True, 'opencv geïnstalleerd')
    except ImportError:
        punt(False, 'opencv geïnstalleerd', 'pip install -r cv/requirements.txt')

    if args.video is not None:
        punt(args.video.is_file(), f'video gevonden ({args.video})')
    if args.kalibratie is not None:
        ok = args.kalibratie.is_file()
        punt(ok, f'kalibratie gevonden ({args.kalibratie})', 'maak ze met cv/calibrate.py')
        if ok:
            try:
                data = json.loads(args.kalibratie.read_text(encoding='utf-8'))
                punt('matrix_beeld_naar_veld' in data and len(data.get('punten', [])) >= 4,
                     'kalibratie bevat een matrix en ≥ 4 punten')
                # De lenscorrectie reist mee in het kalibratiebestand zelf: landing.py en
                # volg_veld.py lezen ze daar en ontkrommen elk pixel vóór de projectie —
                # meet.py hoeft er geen vlaggen voor door te geven, alleen melden.
                lens = data.get('lens') or {}
                if lens.get('lambda'):
                    print(f'  · lenscorrectie in de kalibratie: λ = {float(lens["lambda"]):g} '
                          f'(divisiemodel) — pixels worden ontkromd vóór de projectie')
            except (json.JSONDecodeError, OSError):
                punt(False, 'kalibratie is leesbare JSON')

    # Het platform: bereikbaar, token geldig, en de video-offsets van de match gezet?
    if token is not None:
        sys.path.insert(0, str(CV_MAP))
        import sync as sync_mod  # noqa: PLC0415

        try:
            data = sync_mod.haal_labels(args.base, args.match, token)
            punt(True, f'platform bereikbaar en token geldig ({args.base})')
            rapport = data.get('rapport') or {}
            m = data.get('match') or {}
            punt(
                (rapport.get('syncbaar') or 0) > 0,
                f'events syncbaar: {rapport.get("syncbaar", 0)} van {rapport.get("totaal", 0)}',
                'zet de video-offsets per helft op de analysepagina (IJk H1/H2 hier)',
            )
            punt(m.get('videoOffsetH1') is not None, 'video-offset helft 1 gezet', 'IJk H1 op de analysepagina')
            punt(m.get('videoOffsetH2') is not None, 'video-offset helft 2 gezet', 'IJk H2 op de analysepagina')
            breedte, speelveld = m.get('veldBreedteM'), m.get('veldSpeelveldM')
            diepte = m.get('goalAreaDepth')
            if breedte is not None or speelveld is not None or diepte is not None:
                print(f'  · terrein opgemeten: breedte {breedte or 14:g} m, speelveld {speelveld or 26:g} m, '
                      f'doelgebied {diepte or 10:g} m')
                waarschuw_bij_afwijkende_kalibratie(
                    args.kalibratie,
                    float(breedte) if breedte is not None else None,
                    float(speelveld) if speelveld is not None else None,
                    float(diepte) if diepte is not None else None,
                )
        except SystemExit:
            punt(False, f'platform bereikbaar en token geldig ({args.base})',
                 'controleer --base en CV_BRIDGE_TOKEN')

    print(f'{"Alles klaar voor de meting." if problemen == 0 else f"{problemen} punt(en) op te lossen vóór de meting."}')
    return problemen


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description='De hele meting in één commando: sync → detectie → landing → spelers → rapport.'
    )
    parser.add_argument('--match', type=int, required=True, help='match-id op het platform')
    parser.add_argument('--base', default='http://localhost:3000',
                        help='basis-URL van het platform (standaard http://localhost:3000)')
    parser.add_argument('--uitmap', type=Path, default=None,
                        help='map voor de werkbestanden (standaard meting_match<id>/)')
    parser.add_argument('--video', type=Path, default=None, help='de wedstrijdvideo')
    parser.add_argument('--kalibratie', type=Path, default=None, help='kalibratie-JSON van calibrate.py')
    parser.add_argument('--fps', type=float, default=2.0, help='frame-fps voor de framenummers (standaard 2)')
    parser.add_argument('--demo', action='store_true', help='hele lus zonder video (oefening, vereist --seed)')
    parser.add_argument('--seed', type=int, default=None, help='reproduceerbare demo-ruis')
    parser.add_argument('--upload', action='store_true', help='eindvoorstellen ook naar de reviewbrug sturen')
    parser.add_argument('--tracking', action='store_true',
                        help='ook videotracking meedraaien: posities, fysieke stats per speler en een heatmap')
    parser.add_argument('--stand', choices=('snel', 'gewoon', 'nauwkeurig'), default='gewoon',
                        help='ruil tussen rekentijd en precisie bij een bewegende camera. '
                             '"nauwkeurig" meet 10×/s en herankert elke halve seconde: bij een '
                             'onrustig gefilmde wedstrijd halveert dat de fout, bij een rustige '
                             'opname maakt het weinig uit (zie cv/README.md)')
    parser.add_argument('--overlay', action='store_true',
                        help='maak ook een controlevideo waarop je ziet wat er getrackt werd: '
                             'het veldmodel, de gevonden lijnen, de bal en de spelers')
    parser.add_argument('--bewegend', action='store_true',
                        help='de camera staat niet stil (gsm in de hand, pannend/zoomend): volg het '
                             'veld per moment en heranker op de veldlijnen i.p.v. één vaste kalibratie')
    parser.add_argument('--tracking-fps', type=float, default=4.0,
                        help='bemonstering van de tracking in metingen per seconde (standaard 4 — '
                             'dichter dan de event-fps, anders middelen sprintjes weg)')
    parser.add_argument('--controle', action='store_true',
                        help='alleen de checklist vooraf draaien (niets meten)')
    parser.add_argument('--token', default=None,
                        help='bridge-token (standaard uit omgevingsvariabele CV_BRIDGE_TOKEN)')
    args = parser.parse_args(argv)

    token = args.token or os.environ.get('CV_BRIDGE_TOKEN')

    if args.controle:
        raise SystemExit(1 if controle(args, token) else 0)

    if not token:
        _fout('geen token — zet CV_BRIDGE_TOKEN of geef --token mee (of draai eerst --controle)')
    if args.demo:
        if args.seed is None:
            _fout('--demo vereist --seed (reproduceerbaarheid is de hele bedoeling)')
        if args.video is not None:
            parser.error('--demo gaat niet samen met --video — kies één modus')
        if args.bewegend:
            parser.error('--bewegend hoort bij een echte video, niet bij --demo')
        if args.overlay:
            parser.error('--overlay hoort bij een echte video, niet bij --demo')
    else:
        if args.video is None or args.kalibratie is None:
            _fout('een echte meting vereist --video én --kalibratie (of oefen met --demo --seed)')
        if not args.video.is_file():
            _fout(f'video niet gevonden: {args.video}')
        if not args.kalibratie.is_file():
            _fout(f'kalibratiebestand niet gevonden: {args.kalibratie} (maak het met cv/calibrate.py)')

    uitmap = args.uitmap if args.uitmap is not None else Path(f'meting_match{args.match}')
    uitmap.mkdir(parents=True, exist_ok=True)

    # De echte terreinmaten van deze wedstrijd: zonder die vlaggen zou de zone-bepaling
    # (en de heatmap) in demomodus tegen een reglementair veld gelegd worden.
    breedte, speelveld, diepte = haal_maten(args.base, args.match, token)
    if breedte is not None or speelveld is not None or diepte is not None:
        print(f'Opgemeten terrein: breedte {breedte or 14:g} m, speelveld {speelveld or 26:g} m, '
              f'doelgebied {diepte or 10:g} m (alle meters worden hierop gerekend)')
        waarschuw_bij_afwijkende_kalibratie(args.kalibratie, breedte, speelveld, diepte)
    import importlib.util
    stappen = bouw_stappen(
        args.match, uitmap, args.base, args.demo, args.seed, args.video, args.kalibratie, args.upload, args.fps,
        tracking=args.tracking, heatmap_png=importlib.util.find_spec('cv2') is not None,
        breedte=breedte, speelveld=speelveld, tracking_fps=args.tracking_fps,
        bewegend=args.bewegend, stand=args.stand, overlay=args.overlay, diepte=diepte,
    )

    omgeving = dict(os.environ, CV_BRIDGE_TOKEN=token)
    for nummer, (omschrijving, commando) in enumerate(stappen, start=1):
        print(f'\n[{nummer}/{len(stappen)}] {omschrijving}')
        resultaat = subprocess.run(commando, env=omgeving)
        if resultaat.returncode != 0:
            _fout(f'stap "{omschrijving}" faalde (exit {resultaat.returncode}) — de werkbestanden staan in {uitmap}',
                  resultaat.returncode)

    print(f'\nKlaar. Alle tussenstappen staan in {uitmap} — bewaar die map: het is je meetdossier.')
    if args.overlay and not args.demo:
        print(f'Bekijk {uitmap / "controle.mp4"}: daarop zie je wat er getrackt is — groen = waar het '
              f'systeem de veldlijnen verwacht, rood = het balspoor van loslaten tot de grond.')
    if not args.upload:
        print('Tevreden over het rapport? Draai opnieuw met --upload om de voorstellen te reviewen in de browser.')
    if args.tracking and not args.demo:
        print(f'Videotracking: vul {uitmap / "wie.json"} in (team + rugnummer per spoor, hints staan erbij) '
              f'en draai dan:\n  python3 cv/fysiek.py --posities {uitmap / "posities.jsonl"} '
              f'--toewijzing {uitmap / "wie.json"} --uit {uitmap / "fysiek.json"} '
              f'--upload --base {args.base} --match {args.match}')


if __name__ == '__main__':
    main()
