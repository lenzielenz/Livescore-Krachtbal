#!/usr/bin/env python3
"""Worpen vinden aan de houding van de spelers, in plaats van aan beeldverschil.

Waarom dit bestaat
------------------
``detect_worpen.py`` zoekt pieken in het gemiddelde beeldverschil. Dat werkt bij een camera op
een statief, maar niet bij een gsm in de hand: dan meet dat verschil vooral de camera. Gemeten
op een proefvideo met acht gekende worpen en een pannende camera vond die aanpak er **nul** —
ook niet na het wegrekenen van de camerabeweging, en ook niet met een lokale maat in plaats van
het frame-gemiddelde (verhouding worp/rust 1,00 tot 1,22: geen scheiding).

Deze module kijkt naar wát er gebeurt in plaats van naar hoevéél er verandert: een
houdingsmodel (RTMPose via rtmlib) geeft per speler de schouders, ellebogen, polsen en heupen,
en een worp is daarin een herkenbare beweging. Zowel de nekworp (bal boven het hoofd, zwaai
naar voren) als de rugworp (ruggelings over het hoofd) gaan door dezelfde doorslaggevende
fase: **de polsen komen boven de schouders en zwiepen dan snel weg**.

Schaalonafhankelijk meten
-------------------------
Een speler vooraan in beeld is drie keer zo groot als eentje achteraan. Elke maat wordt daarom
gedeeld door de **romphoogte** van diezelfde speler (schouder → heup): dan telt een worp even
zwaar, waar hij ook staat. Dat is ook wat een pannende of zoomende camera onschadelijk maakt —
de verhouding binnen één lichaam verandert niet als het beeld schuift.

    polshoogte  = (schouder_y − pols_y) / romphoogte      (> 0 = polsen boven de schouders)
    polssnelheid = |Δpols| / romphoogte / Δt              (rompen per seconde)
    worpscore   = max(0, polshoogte) × polssnelheid

De score piekt precies op het moment van loslaten: hoog én snel. Rustig staan met de handen
omhoog geeft snelheid nul; wild lopen geeft polshoogte nul.

De rekenkern hieronder is puur (lijsten met keypoints in, getallen uit) en wordt getest met
verzonnen skeletten — zonder video en zonder model. Alleen de laag die het model aanroept heeft
rtmlib nodig; die ontbreekt gerust, dan zegt de CLI netjes wat er te installeren valt.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from voortgang import Melder  # noqa: E402

MODEL_VERSION = '0.1.0'
MODEL_NAAM = 'houding-rtmpose'

# COCO-17, zoals rtmlib ze levert (Body, to_openpose=False).
NEUS, L_SCHOUDER, R_SCHOUDER = 0, 5, 6
L_ELLEBOOG, R_ELLEBOOG, L_POLS, R_POLS = 7, 8, 9, 10
L_HEUP, R_HEUP = 11, 12

# Onder deze zekerheid negeren we een keypoint: liever geen meting dan een verzonnen gewricht.
MIN_ZEKERHEID = 0.3
# Een worp telt pas mee vanaf deze score (rompen per seconde, met de polsen boven de schouders).
DREMPEL_SCORE = 1.2
# Twee pieken dichter dan dit horen bij dezelfde worp.
MIN_AFSTAND_S = 3.0
# Na zoveel gemeten beelden weten we hoe snel deze server is en kunnen we een duur schatten.
METINGEN_VOOR_SCHATTING = 8
# Getrainde instellingen (cv/train.py). Bestaat dit bestand, dan winnen die van de
# schattingen hierboven — de waarden hierboven zijn een startpunt, geen waarheid.
INSTELLINGEN_PAD = Path(__file__).resolve().parent / 'model-houding.json'


def laad_instellingen(pad: Path = INSTELLINGEN_PAD) -> dict | None:
    """De getrainde drempel en minimale afstand, of None als er nog niet getraind is.

    Een stuk bedorven of half geschreven JSON mag de analyse niet omver halen: dan
    vallen we terug op de schattingen en zeggen we dat.
    """
    if not pad.is_file():
        return None
    try:
        gegevens = json.loads(pad.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(gegevens, dict):
        return None
    drempel = gegevens.get('drempel')
    afstand = gegevens.get('min_afstand_s')
    if not isinstance(drempel, (int, float)) or not isinstance(afstand, (int, float)):
        return None
    if drempel <= 0 or afstand <= 0:
        return None
    return {'drempel': float(drempel), 'min_afstand_s': float(afstand),
            'getraind_op': gegevens.get('getraind_op'), 'holdout': gegevens.get('holdout')}


def _punt(persoon, scores, index) -> tuple[float, float] | None:
    """Eén gewricht, of None als het model er niet zeker genoeg van is."""
    if index >= len(persoon) or index >= len(scores):
        return None
    if scores[index] < MIN_ZEKERHEID:
        return None
    return float(persoon[index][0]), float(persoon[index][1])


def romphoogte(persoon, scores) -> float | None:
    """Schouder → heup in pixels: de maatstok van deze speler op deze plek in het beeld.

    Zonder deze normalisatie meet je vooral hoe dicht iemand bij de camera staat.
    """
    schouders = [p for p in (_punt(persoon, scores, L_SCHOUDER), _punt(persoon, scores, R_SCHOUDER)) if p]
    heupen = [p for p in (_punt(persoon, scores, L_HEUP), _punt(persoon, scores, R_HEUP)) if p]
    if not schouders or not heupen:
        return None
    schouder_y = sum(p[1] for p in schouders) / len(schouders)
    heup_y = sum(p[1] for p in heupen) / len(heupen)
    hoogte = abs(heup_y - schouder_y)
    return hoogte if hoogte > 1e-6 else None


def polshoogte(persoon, scores) -> float | None:
    """Hoe hoog de hoogste pols boven de schouders zit, in rompen.

    Positief = polsen boven de schouders (beeld-y loopt naar beneden). Dat is de houding waar
    zowel de nekworp als de rugworp doorheen gaat.
    """
    romp = romphoogte(persoon, scores)
    if romp is None:
        return None
    schouders = [p for p in (_punt(persoon, scores, L_SCHOUDER), _punt(persoon, scores, R_SCHOUDER)) if p]
    polsen = [p for p in (_punt(persoon, scores, L_POLS), _punt(persoon, scores, R_POLS)) if p]
    if not schouders or not polsen:
        return None
    schouder_y = min(p[1] for p in schouders)
    pols_y = min(p[1] for p in polsen)
    return (schouder_y - pols_y) / romp


def polspositie(persoon, scores) -> tuple[float, float] | None:
    """Het gemiddelde van de betrouwbare polsen — waar de handen zijn."""
    polsen = [p for p in (_punt(persoon, scores, L_POLS), _punt(persoon, scores, R_POLS)) if p]
    if not polsen:
        return None
    return (sum(p[0] for p in polsen) / len(polsen), sum(p[1] for p in polsen) / len(polsen))


def worpscore(vorige: dict, huidige: dict, dt: float) -> float:
    """Hoe erg lijkt dit op het moment van loslaten? (0 = niet.)

    Hoog én snel telt; hoog en stil niet, en snel maar laag ook niet. Beide factoren zijn in
    rompen uitgedrukt, dus onafhankelijk van hoe groot de speler in beeld staat.
    """
    if dt <= 0:
        return 0.0
    hoogte = huidige.get('polshoogte')
    romp = huidige.get('romp')
    hier = huidige.get('pols')
    daar = vorige.get('pols')
    if hoogte is None or romp is None or hier is None or daar is None:
        return 0.0
    if hoogte <= 0:
        return 0.0
    snelheid = math.dist(hier, daar) / romp / dt
    return hoogte * snelheid


def vind_worpmomenten(
    reeks: list[dict],
    drempel: float = DREMPEL_SCORE,
    min_afstand_s: float = MIN_AFSTAND_S,
) -> list[tuple[float, float]]:
    """De momenten waarop iemand werpt: (tijd, score), sterkste eerst gekozen.

    `reeks` is per moment ``{'t': seconden, 'score': float}`` — de hoogste score over alle
    spelers op dat moment. Een lokaal maximum boven de drempel telt als worp; pieken dichter
    dan `min_afstand_s` bij een sterkere piek horen bij dezelfde beweging.
    """
    kandidaten = []
    for i in range(1, len(reeks) - 1):
        s = reeks[i]['score']
        if s >= drempel and s >= reeks[i - 1]['score'] and s > reeks[i + 1]['score']:
            kandidaten.append((reeks[i]['t'], s))
    kandidaten.sort(key=lambda p: -p[1])
    gekozen: list[tuple[float, float]] = []
    for t, s in kandidaten:
        if all(abs(t - g) >= min_afstand_s for g, _ in gekozen):
            gekozen.append((t, s))
    return sorted(gekozen)


def worp_type(reeks: list[dict], tijd: float, venster_s: float = 0.6) -> str | None:
    """Nekworp of rugworp, aan de richting van de zwaai.

    Bij een **nekworp** komt de bal van boven het hoofd naar voren: de polsen zijn vóór het
    loslaten al hoog en zakken erna. Bij een **rugworp** gaat de bal ruggelings over het hoofd:
    de polsen komen pas óp of ná het loslaten omhoog. Geen van beide duidelijk → None; liever
    niets beweren dan gokken, de reviewlaan corrigeert toch.
    """
    voor = [r['polshoogte'] for r in reeks
            if r.get('polshoogte') is not None and tijd - venster_s <= r['t'] < tijd]
    na = [r['polshoogte'] for r in reeks
          if r.get('polshoogte') is not None and tijd < r['t'] <= tijd + venster_s]
    if not voor or not na:
        return None
    if max(voor) > 0.15 and max(na) < max(voor) * 0.6:
        return 'nek'
    if max(na) > max(voor) * 1.4 and max(na) > 0.15:
        return 'rug'
    return None


def vertrouwen(score: float, drempel: float = DREMPEL_SCORE) -> float:
    """Van score naar een confidence in [0.05, 0.9].

    Bewust met een plafond onder 1: dit is een voorstel voor de reviewlaan, geen vaststelling.
    """
    if score <= drempel:
        return 0.05
    return max(0.05, min(0.9, 0.35 + 0.25 * (score / drempel - 1.0)))


# ---------------------------------------------------------------------------
# De laag die het model aanroept (alleen hier is rtmlib nodig)
# ---------------------------------------------------------------------------


def _fout(boodschap: str, code: int = 2) -> None:
    print(f'FOUT: {boodschap}', file=sys.stderr)
    raise SystemExit(code)


def laad_model(mode: str = 'balanced'):
    """Het houdingsmodel, of een nette uitleg als het er niet is.

    rtmlib haalt zijn gewichten bij de eerste run zelf op (± 100 MB). Lukt dat niet, dan is de
    server offline of blokkeert er iets — en dan hoort daar een leesbare melding bij, geen
    stacktrace.
    """
    try:
        from rtmlib import Body  # noqa: PLC0415
    except ImportError:
        _fout('rtmlib ontbreekt — installeer met: pip install -r cv/requirements-pose.txt')
    try:
        return Body(mode=mode, backend='onnxruntime', device='cpu')
    except Exception as e:  # noqa: BLE001 — netwerk, schijf, ontbrekende gewichten: alles telt
        _fout(f'het houdingsmodel kon niet geladen worden ({type(e).__name__}: {e}). '
              'Bij de eerste run haalt rtmlib zijn gewichten op — heeft deze server internet?')


def schat_duur(seconden_per_meting: float, metingen: int) -> float:
    """Hoelang gaat dit nog duren, op déze server?

    Het houdingsmodel op een gedeelde processor doet er tussen een halve en enkele seconden
    over per beeld. Dat verschil bepaalt of een wedstrijdvideo tien minuten of drie uur kost —
    en dat hoor je te weten vóór je een uur zit te wachten, niet erna.
    """
    return max(0.0, seconden_per_meting) * max(0, metingen)


def meet_video(videopad: Path, model, analyse_fps: float, tot: float | None = None) -> list[dict]:
    """Per moment de hoogste worpscore over alle spelers in beeld.

    Geeft een reeks ``{'t', 'score', 'polshoogte', 'personen'}``. Het model draait op elk
    bemonsterd beeld; dat is het dure deel, dus `analyse_fps` bepaalt de rekentijd.
    """
    import cv2  # noqa: PLC0415

    from voortgang import duur_van_video  # noqa: PLC0415

    cap = cv2.VideoCapture(str(videopad))
    if not cap.isOpened():
        _fout(f'kan video niet openen: {videopad}')
    fps_bron = cap.get(cv2.CAP_PROP_FPS) or 25.0
    stap = max(1, round(fps_bron / analyse_fps))
    dt = stap / fps_bron
    # Dit is de traagste stap van de hele keten: laten weten hoe ver ze staat, anders staat de
    # balk in de app een halfuur stil en is dat niet te onderscheiden van vastgelopen.
    duur = duur_van_video(cv2, cap)
    te_bekijken = min(duur, tot) if (duur and tot) else (tot or duur)
    melder = Melder(te_bekijken)
    # De eerste beelden geven de snelheid van déze server; daarmee weet je meteen of dit tien
    # minuten of drie uur wordt.
    begonnen = time.monotonic()
    geschat = False

    reeks: list[dict] = []
    vorige: dict[int, dict] = {}
    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = frame_idx / fps_bron
        if tot is not None and t > tot:
            break
        if frame_idx % stap == 0:
            keypoints, scores = model(frame)
            beste_score, beste_hoogte = 0.0, None
            nu: dict[int, dict] = {}
            for i, (persoon, zekerheid) in enumerate(zip(keypoints, scores)):
                staat = {
                    'polshoogte': polshoogte(persoon, zekerheid),
                    'romp': romphoogte(persoon, zekerheid),
                    'pols': polspositie(persoon, zekerheid),
                }
                nu[i] = staat
                s = worpscore(vorige.get(i, {}), staat, dt)
                if s > beste_score:
                    beste_score = s
                if staat['polshoogte'] is not None:
                    beste_hoogte = staat['polshoogte'] if beste_hoogte is None else max(beste_hoogte, staat['polshoogte'])
            reeks.append({'t': round(t, 3), 'score': round(beste_score, 4),
                          'polshoogte': beste_hoogte, 'personen': len(keypoints)})
            vorige = nu
            if not geschat and len(reeks) >= METINGEN_VOOR_SCHATTING and te_bekijken:
                geschat = True
                per_meting = (time.monotonic() - begonnen) / len(reeks)
                totaal = schat_duur(per_meting, round(te_bekijken * analyse_fps))
                print(f'  op deze server ± {per_meting:.2f} s per beeld → naar schatting '
                      f'{totaal / 60:.0f} minuten voor {te_bekijken / 60:.1f} minuten video')
                melder.meld(t, f'schatting: {totaal / 60:.0f} min in totaal', forceer=True)
            melder.meld(t, f'{len(reeks)} metingen')
        frame_idx += 1
    cap.release()
    melder.klaar(f'{len(reeks)} metingen')
    return reeks


def maak_events(momenten: list[tuple[float, float]], reeks: list[dict], match_id: int | None,
                drempel: float) -> list[dict]:
    return [
        {
            'match_id': match_id,
            'video_time_s': round(t, 3),
            'frame': None,
            'event_type': 'worp',
            'worp_type': worp_type(reeks, t),
            'zone': None,
            'afstand_m': None,
            'speler': None,
            'score_delta': 0,
            'confidence': round(vertrouwen(s, drempel), 3),
            'provenance': {'model': MODEL_NAAM, 'model_version': MODEL_VERSION},
        }
        for t, s in momenten
    ]


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(
        description='Worpen vinden aan de houding van de spelers (RTMPose) → events-JSONL.')
    p.add_argument('video', type=Path, help='de wedstrijdvideo')
    p.add_argument('--uit', type=Path, required=True, help='uitvoer-JSONL met de voorstellen')
    p.add_argument('--match', type=int, default=None, help='match-id voor de events')
    p.add_argument('--analyse-fps', type=float, default=5.0,
                   help='hoeveel beelden per seconde door het model gaan (standaard 5). '
                        'Dit bepaalt de rekentijd: elk beeld kost het model tijd.')
    p.add_argument('--drempel', type=float, default=None,
                   help=f'minimale worpscore (getraind indien beschikbaar, anders {DREMPEL_SCORE})')
    p.add_argument('--min-afstand', type=float, default=None,
                   help='minimale afstand tussen twee worpen in seconden '
                        f'(getraind indien beschikbaar, anders {MIN_AFSTAND_S})')
    p.add_argument('--instellingen', type=Path, default=None,
                   help='JSON met getrainde instellingen (cv/train.py). Standaard '
                        f'{INSTELLINGEN_PAD}; op een server staat dit bestand op het volume, '
                        'want de repo wordt bij elke uitrol opnieuw uitgepakt.')
    p.add_argument('--reeks-uit', type=Path, default=None,
                   help='de meetreeks wegschrijven (JSONL, één regel per bemonsterd beeld). '
                        'Dit is de trainingsdata voor cv/train.py: het meten is het dure deel, '
                        'de instellingen bijstellen daarna is gratis.')
    p.add_argument('--tot', type=float, default=None,
                   help='stop na zoveel seconden video (voor een snelle proef)')
    p.add_argument('--mode', default='balanced', choices=('performance', 'balanced', 'lightweight'),
                   help='modelgrootte: lightweight is sneller, performance nauwkeuriger')
    args = p.parse_args(argv)

    if not args.video.is_file():
        _fout(f'video niet gevonden: {args.video}')
    if args.analyse_fps <= 0:
        _fout('--analyse-fps moet groter zijn dan 0')

    getraind = laad_instellingen(args.instellingen) if args.instellingen else None
    if getraind is None:
        getraind = laad_instellingen()
    drempel = args.drempel if args.drempel is not None else (
        getraind['drempel'] if getraind else DREMPEL_SCORE)
    min_afstand = args.min_afstand if args.min_afstand is not None else (
        getraind['min_afstand_s'] if getraind else MIN_AFSTAND_S)
    if getraind:
        op = getraind.get('getraind_op') or []
        print(f'Getrainde instellingen in gebruik: drempel {drempel:g}, '
              f'minimale afstand {min_afstand:g}s'
              + (f' (geleerd op {len(op)} wedstrijd(en))' if op else ''))
    else:
        print(f'Nog niet getraind — geschatte instellingen: drempel {drempel:g}, '
              f'minimale afstand {min_afstand:g}s. Zie cv/train.py.')

    # Het model laden kan bij de eerste keer minuten duren (rtmlib haalt dan zijn gewichten op).
    # Zonder deze twee meldingen lijkt de analyse in die tijd stil te staan.
    print(f'Houdingsmodel laden ({args.mode}) …')
    laden = Melder(1.0)
    laden.meld(0.0, 'houdingsmodel laden', forceer=True)
    model = laad_model(args.mode)
    laden.meld(0.0, 'houdingsmodel geladen', forceer=True)
    print(f'Spelers meten in {args.video} (± {args.analyse_fps:g} beelden/s) …')
    reeks = meet_video(args.video, model, args.analyse_fps, args.tot)
    if not reeks:
        _fout('geen enkel beeld kon gelezen worden')

    if args.reeks_uit:
        with args.reeks_uit.open('w', encoding='utf-8') as f:
            for r in reeks:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')

    momenten = vind_worpmomenten(reeks, drempel, min_afstand)
    events = maak_events(momenten, reeks, args.match, drempel)
    with args.uit.open('w', encoding='utf-8') as f:
        for e in events:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')

    bekeken = reeks[-1]['t'] - reeks[0]['t'] if len(reeks) > 1 else 0.0
    gemiddeld_personen = sum(r['personen'] for r in reeks) / len(reeks)
    rapport = {
        'bekeken_s': round(bekeken, 1),
        'metingen': len(reeks),
        'analyse_fps': args.analyse_fps,
        'kandidaten': len(events),
        'gemiddeld_personen': round(gemiddeld_personen, 1),
        'model': MODEL_NAAM,
        'drempel': drempel,
        'min_afstand_s': min_afstand,
        'getraind': bool(getraind),
    }
    args.uit.with_suffix(args.uit.suffix + '.rapport.json').write_text(
        json.dumps(rapport, ensure_ascii=False), encoding='utf-8')
    print(f'{len(events)} worpen → {args.uit}')
    print(f'  {bekeken / 60:.1f} minuten bekeken, gemiddeld {gemiddeld_personen:.1f} spelers in beeld')
    if gemiddeld_personen < 1.0:
        print('  LET OP: er werden nauwelijks spelers herkend. Staat de camera te ver, of is het '
              'beeld te donker? Zonder spelers valt er niets aan hun houding af te lezen.')


if __name__ == '__main__':
    main()
