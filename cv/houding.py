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

    polshoogte = (schouder_y − pols_y) / romphoogte       (> 0 = polsen boven de schouders)
    polsweg    = |Δpols| / romphoogte                     (rompen afgelegd)
    worpscore  = max(0, polshoogte) × polsweg             (over één loslaatfase: 0,08–0,22 s)

De score piekt precies op het moment van loslaten: hoog én ver. Rustig staan met de handen
omhoog legt geen weg af; wild lopen geeft polshoogte nul.

WEG EN NIET SNELHEID, en dat is geen detail. Snelheid is weg gedeeld door tijd, en die tijd hing
aan de precisiestand: 0,20 s tussen twee metingen op "gewoon", 0,067 s op "ultra". Dezelfde worp
kreeg daardoor een heel andere score — op een nagebootste worp gemeten liep dat van 1,7 tot 10,4.
Een drempel die op de ene stand getraind was, sloeg op de andere overal of nergens aan: fijner
meten maakte het model niet beter maar onvergelijkbaar. De afgelegde weg heeft dat niet, want
buiten de zwiep beweegt de hand nauwelijks. Gemeten over 5 tot 25 metingen per seconde: 31%
spreiding in plaats van 85%.

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
# Een worp telt pas mee vanaf deze score.
#
# De schaal is veranderd mét de maat: het is niet langer "rompen per seconde" maar "rompen
# afgelegd × polshoogte" over één loslaatfase. Op een nagebootste worp piekt dat rond 0,7 à 0,9;
# een hand die rustig omhoog gaat blijft onder 0,2. 0,45 ligt daar netjes tussen — en het is een
# startpunt, geen waarheid: cv/train.py leert het juiste getal uit jouw eigen wedstrijden.
DREMPEL_SCORE = 0.45
# Twee pieken dichter dan dit horen bij dezelfde worp.
MIN_AFSTAND_S = 3.0
# Na zoveel gemeten beelden weten we hoe snel deze server is en kunnen we een duur schatten.
METINGEN_VOOR_SCHATTING = 8
# Over hoeveel tijd de polsweg gemeten wordt.
#
# Dit is het getal dat de hele stand-keuze redt. De snelheid werd eerder gemeten tussen twee
# opeenvolgende metingen, en dus over een tijdsverschil dat mét de precisiestand meebewoog: bij
# 5 metingen/s over 0,20 s, bij 15 over 0,067 s. Dezelfde worp gaf daardoor een andere score
# naargelang de stand — en fijner meten maakte het erger, niet beter: over een kort venster valt
# de piek deels tussen twee metingen en meet je vooral het beetje beweging dat er net was.
# Nu wordt er altijd over ± 0,12 s gekeken (de duur van de loslaatfase), ongeacht hoe fijn er
# bemonsterd wordt. Zo betekent een score van 1,6 op elke stand hetzelfde — en pas dán is een
# getrainde drempel overdraagbaar en levert meer rekenkracht ook echt meer op.
VENSTER_S = 0.12
# De band waarbinnen een referentiemeting mag liggen. Eén vast venster is niet genoeg: waar de
# metingen tóévallig vallen ten opzichte van de zwiep bepaalt mee hoeveel je ervan ziet. Door
# elke meting in deze band te proberen en de sterkste te nemen, benadert een grove stand het
# echte maximum beter — en blijft een fijne stand niet stelselmatig hoger scoren.
VENSTER_LAAG_S = 0.08
VENSTER_HOOG_S = 0.22

# --- Twee passages -----------------------------------------------------------------------
#
# Overal even fijn kijken is de domste manier om rekenkracht uit te geven. In een wedstrijd van
# een uur wordt er ongeveer één minuut geworpen; de andere negenenvijftig gaan op aan lopen,
# rapen en wachten. Wie de hele video op 20 metingen per seconde bekijkt, betaalt dus 98% van
# zijn rekentijd aan beelden waar niets in zit.
#
# Vandaar twee passages:
#
#   1. ZOEKEN — de hele video, grof bemonsterd, met een bewust LAGE drempel. Deze passage mag
#      zich vergissen naar boven: elke twijfelachtige piek is welkom, want de tweede passage
#      gooit hem er zo weer uit. Wat ze híér mist, is voorgoed weg — daarom lage drempel.
#   2. NAKIJKEN — alleen rond die kandidaten, op élk beeld, desgewenst met het zware model.
#      Daar valt de beslissing.
#
# WAT DE WINST IS, en wat níét. Nagemeten op 22 nagebootste worpen in twee minuten video, met
# een loslaatfase van 0,08 s:
#
#   • De winst is de STABILITEIT van de score, niet de tijd. Dezelfde worp piekt op 0,31 bij
#     5 metingen/s en op 0,47 vanaf 20/s — een derde lager, want bij grof bemonsteren valt er
#     zelden een meting precies rond de zwiep en zie je maar een deel van de weg. Rond een
#     drempel van 0,45 is dat het verschil tussen gevonden en gemist: één passage op 12/s vond
#     6 van de 22 worpen, twee passages op diezelfde 12/s vonden er 17 — evenveel als één
#     passage op 20/s, met een kwart minder metingen.
#   • Het MOMENT wordt er niet nauwkeuriger van: 84 ms fout met één passage op 20/s, 85 ms met
#     twee. De score piekt over een breed venster, dus fijner bemonsteren verschuift het
#     maximum nauwelijks. Dat is eerder beweerd en het klopte niet.
#
# Een uur video op 12 metingen/s zoeken kost 43 000 metingen; zestig kandidaten van 1,6 s op
# 25 beelden/s nakijken kost er 2 400. Samen minder dan de 72 000 van "overal op 20/s".
#
# De zoekdrempel is 0,40 × de echte en dat is nagemeten, niet gekozen: op 8 metingen/s vond
# 0,55 er 16 van de 17 haalbare, 0,45 en lager alle 17 — voor 13% meer nakijkwerk. Vals alarm
# kost niets, want de beslissing valt alsnog op de echte drempel (0 valse worpen bij élke
# geprobeerde factor). Te hoog zoeken kost wél: die worp is voorgoed weg.
ZOEK_FACTOR = 0.40
# Hoeveel seconden rond een kandidaat er nagekeken wordt. Ruim genoeg voor de hele zwiep én
# voor `worp_type` (dat 0,6 s rond het moment kijkt om nek van rug te onderscheiden).
ZOEK_MARGE_S = 0.8
# Hoeveel van de video de tweede passage hoogstens mag nakijken.
#
# In een echte wedstrijd zijn dat zestig worpen van 1,6 s in een uur: nog geen 3%. Maar een
# lage zoekdrempel op een rommelig beeld (bewegende camera, veel spelers, schaduwen) kan
# honderden kandidaten opleveren, en dan zou het "nakijken" stilletjes uitgroeien tot de hele
# video op volle beeldfrequentie — precies het uur wachten dat de stand "snel" moet vermijden.
# Boven deze grens blijven de STERKSTE kandidaten over; wat afvalt wordt geteld en gemeld,
# want een stille grens is een leugen over wat er bekeken is.
NA_MAX_DEEL = 0.25
# Elk beeld meten in plaats van te bemonsteren.
ELK_BEELD = 0.0


def zoekvensters(momenten: list[tuple[float, float]], marge_s: float = ZOEK_MARGE_S,
                 tot: float | None = None, max_deel: float | None = None,
                 duur: float | None = None) -> list[tuple[float, float]]:
    """De stukken video die de tweede passage moet nakijken, samengevoegd.

    Twee kandidaten die dicht bij elkaar liggen geven overlappende vensters; die worden één
    venster. Anders zou de tweede passage dezelfde beelden twee keer door het model duwen —
    en net dáár zit de rekentijd.

    Met `max_deel` en `duur` blijft het nakijkwerk onder een deel van de video: de sterkste
    kandidaten eerst, tot de begroting op is.
    """
    def samenvoegen(tijden: list[float]) -> list[tuple[float, float]]:
        samen: list[tuple[float, float]] = []
        for van, tot_v in sorted((max(0.0, t - marge_s), t + marge_s) for t in tijden):
            if samen and van <= samen[-1][1]:
                samen[-1] = (samen[-1][0], max(samen[-1][1], tot_v))
            else:
                samen.append((van, tot_v))
        if tot is not None:
            samen = [(a, min(b, tot)) for a, b in samen if a <= tot]
        return samen

    tijden = [t for t, _ in momenten]
    if max_deel is not None and duur and duur > 0:
        begroting = max_deel * duur
        gekozen: list[float] = []
        # Sterkste eerst: moet er iets sneuvelen, dan de twijfelgevallen en niet de duidelijke.
        # Een kandidaat naast een al gekozen kandidaat kost bijna niets (de vensters overlappen),
        # dus telkens de échte lengte na samenvoegen afwegen in plaats van marge × aantal.
        for t, _s in sorted(momenten, key=lambda p: -p[1]):
            proef = [*gekozen, t]
            if gekozen and sum(b - a for a, b in samenvoegen(proef)) > begroting:
                continue
            gekozen = proef
        tijden = gekozen
    return samenvoegen(tijden)


def in_venster(t: float, vensters: list[tuple[float, float]] | None) -> bool:
    """Valt dit tijdstip in een van de na te kijken stukken?"""
    if vensters is None:
        return True
    return any(van <= t <= tot for van, tot in vensters)


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
            'venster_mediaan_s': gegevens.get('venster_mediaan_s'),
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


def heuppositie(persoon, scores) -> tuple[float, float] | None:
    """Het midden tussen de heupen — de stabielste plek om iemand aan te herkennen.

    Armen en benen zwaaien; het bekken schuift mee met de speler zelf. Vandaar dat het volgen
    van personen tussen twee metingen hierop gebeurt en niet op de polsen.
    """
    heupen = [p for p in (_punt(persoon, scores, L_HEUP), _punt(persoon, scores, R_HEUP)) if p]
    if not heupen:
        return None
    return (sum(p[0] for p in heupen) / len(heupen), sum(p[1] for p in heupen) / len(heupen))


def koppel_personen(
    vorige: dict[int, dict],
    huidige: list[dict],
    max_sprong_rompen: float = 1.5,
) -> dict[int, int]:
    """Welke persoon van nu is welke van daarnet? Geeft {index nu → id}.

    Waarom dit moet. Het model levert per beeld een LIJST personen, en die volgorde verandert
    zodra er iemand bijkomt, wegvalt of gewoon anders gesorteerd wordt. Wie de lijstindex als
    identiteit gebruikt — zoals hier eerst gebeurde — vergelijkt bij elke meting de polsen van
    speler A met die van speler B, en meet dan een 'polssnelheid' die niemand ooit maakte. Dat
    is niet alleen ruis in de worpscore: het maakt ook onmogelijk om achteraf te zeggen wélke
    speler wierp.

    Koppelen gebeurt op de heuppositie, greedy op de kortste afstand, en met een plafond: een
    sprong groter dan anderhalve romphoogte is geen speler die wandelde maar een verwisseling.
    Wie niet gekoppeld raakt, krijgt een nieuw id — liever een extra werper in de lijst dan twee
    spelers onder één naam.
    """
    paren: list[tuple[float, int, int]] = []
    for nu_i, staat in enumerate(huidige):
        hier = staat.get('heup')
        romp = staat.get('romp')
        if hier is None or not romp:
            continue
        for oud_id, oude in vorige.items():
            daar = oude.get('heup')
            if daar is None:
                continue
            afstand = math.dist(hier, daar)
            if afstand <= max_sprong_rompen * romp:
                paren.append((afstand, nu_i, oud_id))
    paren.sort()
    koppeling: dict[int, int] = {}
    gebruikt: set[int] = set()
    for _afstand, nu_i, oud_id in paren:
        if nu_i in koppeling or oud_id in gebruikt:
            continue
        koppeling[nu_i] = oud_id
        gebruikt.add(oud_id)
    return koppeling


def beste_worpscore(
    geschiedenis: list[tuple[float, dict]],
    huidige: dict,
    nu_t: float,
    laag_s: float = VENSTER_LAAG_S,
    hoog_s: float = VENSTER_HOOG_S,
) -> tuple[float, float]:
    """De sterkste worpscore over alle vensters van ± een loslaatfase. Geeft (score, venster).

    Waarom niet gewoon "de vorige meting". De snelheid werd eerder gemeten over de stap tussen
    twee metingen, en die stap beweegt mee met de precisiestand: 0,20 s op "gewoon", 0,067 s op
    "ultra". Dezelfde worp gaf daardoor een heel andere score — gemeten op een nagebootste worp
    liep dat van 1,7 tot 10,4 naargelang de stand. Een drempel die op de ene stand getraind is,
    slaat op de andere dus overal of nergens op aan; fijner meten maakte het model niet beter
    maar onvergelijkbaar.

    Wat hier gebeurt: elke meting tussen 0,08 en 0,22 seconden geleden komt in aanmerking als
    vertrekpunt, en de sterkste wint. Dat is de beweging over ongeveer één loslaatfase, ongeacht
    hoe fijn er bemonsterd is. Op een grove stand valt er weinig te kiezen en zie je onvermijdelijk
    minder van de zwiep — dat is geen fout van de maat maar informatie die er niet is.
    """
    beste, beste_venster = 0.0, hoog_s
    for tijd, staat in geschiedenis:
        venster = nu_t - tijd
        if venster < laag_s or venster > hoog_s:
            continue
        score = worpscore(staat, huidige, venster)
        if score > beste:
            beste, beste_venster = score, venster
    if beste == 0.0 and geschiedenis:
        # Niets binnen de band (grove stand, of net begonnen): neem de dichtstbijzijnde meting
        # bij het gewenste venster. Liever een minder scherpe meting dan geen.
        ref = min(geschiedenis, key=lambda p: abs((nu_t - p[0]) - VENSTER_S))
        venster = max(1e-6, nu_t - ref[0])
        return worpscore(ref[1], huidige, venster), venster
    return beste, beste_venster


def kies_referentie(
    geschiedenis: list[tuple[float, dict]],
    nu_t: float,
    venster_s: float = VENSTER_S,
) -> tuple[float, dict] | None:
    """De meting van ± `venster_s` geleden — waarmee de snelheid gemeten wordt.

    Niet de vorige meting, want die ligt op een andere afstand naargelang de precisiestand. Wél
    die welke het dichtst bij het gewenste venster ligt: dan meet je op elke stand dezelfde
    beweging. Is er nog niets ouder dan het venster (begin van de opname, of een grof
    bemonsterde stand), dan de oudste die er is — die zegt nog altijd meer dan niets.
    """
    if not geschiedenis:
        return None
    doel = nu_t - venster_s
    return min(geschiedenis, key=lambda p: abs(p[0] - doel))


def worpscore(vorige: dict, huidige: dict, dt: float = 0.0) -> float:
    """Hoe erg lijkt dit op het moment van loslaten? (0 = niet.)

    Hoog én ver: de polshoogte (boven de schouders) maal de weg die de pols aflegde sinds de
    vorige meting, allebei in rompen. Rustig staan met de handen omhoog legt geen weg af; wild
    lopen met de handen laag heeft geen hoogte.

    WAAROM WEG EN NIET SNELHEID. Snelheid is weg gedeeld door tijd, en die tijd hing vroeger aan
    de precisiestand: 0,20 s tussen twee metingen op "gewoon", 0,067 s op "ultra". Dezelfde worp
    kreeg daardoor een heel andere score — gemeten op een nagebootste worp liep dat van 1,7 tot
    10,4. Een drempel die op de ene stand getraind was, sloeg op de andere overal of nergens aan,
    en fijner meten maakte het model niet beter maar onvergelijkbaar.

    De afgelegde weg heeft dat probleem niet: buiten de zwiep beweegt de hand nauwelijks, dus de
    weg over 0,12 s en die over 0,20 s zijn bijna dezelfde. Gemeten over 5 tot 25 metingen per
    seconde: 31% spreiding in plaats van 85%. Pas daardoor levert meer rekenkracht ook echt een
    betere meting op in plaats van een andere schaal.

    `dt` wordt niet meer gebruikt en staat er enkel nog voor oudere aanroepen.
    """
    del dt  # bewust: de maat is niet langer een snelheid
    hoogte = huidige.get('polshoogte')
    romp = huidige.get('romp')
    hier = huidige.get('pols')
    daar = vorige.get('pols')
    if hoogte is None or romp is None or hier is None or daar is None:
        return 0.0
    if hoogte <= 0 or romp <= 0:
        return 0.0
    return hoogte * (math.dist(hier, daar) / romp)


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


def lees_reeks(pad: Path) -> list[dict]:
    """Een eerder weggeschreven meetreeks terug inlezen (voor `--hervat`).

    Onvolledige laatste regel weggooien: als de stroom halverwege een regel afgebroken werd,
    staat daar geen geldige JSON. Beter één meting kwijt dan de hele reeks weigeren.
    """
    if not pad.is_file():
        return []
    uit: list[dict] = []
    for regel in pad.read_text(encoding='utf-8', errors='replace').splitlines():
        regel = regel.strip()
        if not regel:
            continue
        try:
            r = json.loads(regel)
        except json.JSONDecodeError:
            continue
        if isinstance(r, dict) and isinstance(r.get('t'), (int, float)):
            uit.append(r)
    uit.sort(key=lambda r: r['t'])
    return uit


def meet_video(videopad: Path, model, analyse_fps: float, tot: float | None = None,
               vensters: list[tuple[float, float]] | None = None,
               deel: tuple[float, float] | None = None,
               vanaf: float = 0.0,
               schrijf=None) -> list[dict]:
    """Per moment de hoogste worpscore over alle spelers in beeld.

    Geeft een reeks ``{'t', 'score', 'polshoogte', 'personen'}``. Het model draait op elk
    bemonsterd beeld; dat is het dure deel, dus `analyse_fps` bepaalt de rekentijd.
    `analyse_fps = ELK_BEELD` meet élk beeld — dat is de tweede passage.

    Met `vensters` worden alleen die stukken video gemeten. De beelden ertussen worden nog wel
    gelézen (een video is geen lijst waar je zomaar in kunt springen; springen is bij een
    variabele beeldfrequentie bovendien onnauwkeurig), maar niet door het model geduwd — en dát
    is het dure deel, tot honderd keer duurder dan een beeld inlezen.

    `vanaf` slaat alles vóór dat tijdstip over, en `schrijf` (een functie die één meting
    wegschrijft) laat de reeks meteen op schijf belanden in plaats van pas op het einde. Samen
    maken die twee het HERVATTEN mogelijk: een analyse van drie uur die halverwege onderbroken
    wordt door een herstart van de server, pikt de draad op bij de laatste meting die op schijf
    stond in plaats van van voren af aan te beginnen. Zonder dat kost elke uitrol drie uur.
    """
    import cv2  # noqa: PLC0415

    from voortgang import duur_van_video  # noqa: PLC0415

    cap = cv2.VideoCapture(str(videopad))
    if not cap.isOpened():
        _fout(f'kan video niet openen: {videopad}')
    fps_bron = cap.get(cv2.CAP_PROP_FPS) or 25.0
    stap = 1 if analyse_fps <= 0 else max(1, round(fps_bron / analyse_fps))
    dt = stap / fps_bron
    # Dit is de traagste stap van de hele keten: laten weten hoe ver ze staat, anders staat de
    # balk in de app een halfuur stil en is dat niet te onderscheiden van vastgelopen.
    duur = duur_van_video(cv2, cap)
    te_bekijken = min(duur, tot) if (duur and tot) else (tot or duur)
    melder = Melder(te_bekijken, deel=deel)
    # De eerste beelden geven de snelheid van déze server; daarmee weet je meteen of dit tien
    # minuten of drie uur wordt.
    begonnen = time.monotonic()
    geschat = False

    # Hoeveel metingen dit worden: bij vensters alleen de stukken die nagekeken worden, anders
    # de hele video. Zonder dat onderscheid zou de tweede passage een duur van uren melden voor
    # werk van enkele minuten.
    meetbaar = (sum(max(0.0, b - a) for a, b in vensters) if vensters is not None
                else (te_bekijken or 0.0))
    verwachte_metingen = round(meetbaar * fps_bron / stap)

    reeks: list[dict] = []
    vorige: dict[int, dict] = {}
    vorige_t: float | None = None
    geschiedenis: dict[int, list[tuple[float, dict]]] = {}
    volgende_werper = 0
    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = frame_idx / fps_bron
        if tot is not None and t > tot:
            break
        if t < vanaf:
            # Al gemeten in een eerdere poging. Het beeld moet nog wel ingelezen worden (in een
            # video kun je niet betrouwbaar springen), maar het model blijft ervan af — en dát is
            # het dure deel.
            frame_idx += 1
            continue
        if frame_idx % stap == 0 and in_venster(t, vensters):
            keypoints, scores = model(frame)
            gemeten = [
                {
                    'polshoogte': polshoogte(persoon, zekerheid),
                    'romp': romphoogte(persoon, zekerheid),
                    'pols': polspositie(persoon, zekerheid),
                    'heup': heuppositie(persoon, zekerheid),
                }
                for persoon, zekerheid in zip(keypoints, scores)
            ]
            # Wie is wie? Op de heuppositie koppelen en niet op de lijstvolgorde — die verandert
            # zodra er iemand bijkomt of wegvalt, en dan vergelijk je de polsen van twee
            # verschillende spelers met elkaar.
            # Zat er een gat tussen twee metingen (de tweede passage springt van kandidaat naar
            # kandidaat), dan is er niets te koppelen: wie hier staat, is niet dezelfde persoon
            # als wie daar minuten geleden op die plek stond.
            if vorige_t is not None and t - vorige_t > VENSTER_HOOG_S * 3:
                vorige, geschiedenis = {}, {}
            koppeling = koppel_personen(vorige, gemeten)
            beste_score, beste_hoogte, beste_wie = 0.0, None, None
            beste_venster = None
            nu: dict[int, dict] = {}
            for i, staat in enumerate(gemeten):
                wie = koppeling.get(i)
                if wie is None:
                    wie = volgende_werper
                    volgende_werper += 1
                nu[wie] = staat
                # De snelheid over een vást venster van ± 0,12 s, niet over de stap tussen twee
                # metingen: anders hangt de score af van hoe fijn je bemonstert en betekent
                # dezelfde worp op de stand "ultra" iets anders dan op "gewoon".
                s, venster = beste_worpscore(geschiedenis.get(wie, []), staat, t)
                if s > beste_score:
                    beste_score = s
                    beste_wie = wie
                    beste_venster = venster
                if staat['polshoogte'] is not None:
                    beste_hoogte = staat['polshoogte'] if beste_hoogte is None else max(beste_hoogte, staat['polshoogte'])
            meting = {'t': round(t, 3), 'score': round(beste_score, 4),
                      'polshoogte': beste_hoogte, 'personen': len(keypoints)}
            # Wie de hoogste score maakte, en waar die stond: daarmee kunnen de worpen achteraf
            # per werper gegroepeerd worden, zodat je één keer per speler moet zeggen wie het is
            # in plaats van één keer per worp.
            if beste_wie is not None:
                meting['werper'] = beste_wie
                heup = (nu.get(beste_wie) or {}).get('heup')
                if heup:
                    meting['x'] = round(heup[0], 1)
                    meting['y'] = round(heup[1], 1)
            if beste_venster is not None:
                meting['venster'] = round(beste_venster, 3)
            reeks.append(meting)
            # Meteen wegschrijven, niet pas op het einde: wat op schijf staat overleeft een
            # herstart, wat in het geheugen zit niet.
            if schrijf is not None:
                schrijf(meting)
            vorige, vorige_t = nu, t
            # De geschiedenis per persoon: net lang genoeg om altijd een meting van ± een venster
            # geleden te hebben, ook op de fijnste stand.
            for wie, staat in nu.items():
                lijst = geschiedenis.get(wie, [])
                lijst.append((t, staat))
                geschiedenis[wie] = [p for p in lijst if t - p[0] <= VENSTER_HOOG_S * 1.5][-40:]
            if not geschat and len(reeks) >= METINGEN_VOOR_SCHATTING and verwachte_metingen:
                geschat = True
                per_meting = (time.monotonic() - begonnen) / len(reeks)
                totaal = schat_duur(per_meting, verwachte_metingen)
                print(f'  op deze server ± {per_meting:.2f} s per beeld → naar schatting '
                      f'{totaal / 60:.0f} minuten voor {verwachte_metingen} metingen')
                melder.meld(t, f'schatting: {totaal / 60:.0f} min in totaal', forceer=True)
        # Buiten de meting om melden, niet erbinnen: de tweede passage leest minutenlang beelden
        # in zonder er één te meten, en in die tijd hoort de balk niet stil te vallen.
        melder.meld(t, f'{len(reeks)} metingen')
        frame_idx += 1
    cap.release()
    melder.klaar(f'{len(reeks)} metingen')
    return reeks


def werper_op(reeks: list[dict], tijd: float, marge_s: float = 1e-6) -> dict | None:
    """Wie wierp er op dit moment, en waar stond die? (De meting het dichtst bij dat tijdstip.)

    `marge_s` bestaat voor de twee passages: het moment komt dan uit de fijne passage, maar de
    werper uit de grove — die volgt de spelers dóór de hele video en houdt hun nummer vast,
    terwijl de fijne passage alleen losse stukken rond de kandidaten ziet en dus na elk gat
    opnieuw zou beginnen tellen.
    """
    beste: tuple[float, dict] | None = None
    for r in reeks:
        if r.get('werper') is None:
            continue
        afstand = abs(r.get('t', 1e9) - tijd)
        if afstand <= marge_s and (beste is None or afstand < beste[0]):
            beste = (afstand, r)
    return beste[1] if beste else None


def maak_events(momenten: list[tuple[float, float]], reeks: list[dict], match_id: int | None,
                drempel: float, werperreeks: list[dict] | None = None,
                werper_marge_s: float = 1e-6) -> list[dict]:
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
            # Wélke werper (een volgnummer dat door de hele video hetzelfde blijft zolang de
            # speler gevolgd kan worden) en waar die stond. Daarmee groepeert de app de worpen
            # per werper, zodat je één keer per speler zegt wie het is.
            **(lambda w: {'werper': w['werper'], 'werper_px': [w.get('x'), w.get('y')]}
               if w else {})(werper_op(werperreeks if werperreeks is not None else reeks, t,
                                       werper_marge_s)),
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
    p.add_argument('--twee-passages', action='store_true',
                   help='eerst de hele video grof afzoeken met een lage drempel, daarna alleen '
                        'rond de kandidaten élk beeld nakijken. Duurder per kandidaat, veel '
                        'goedkoper per uur video — en het loslaatmoment wordt beeldnauwkeurig.')
    p.add_argument('--hervat', action='store_true',
                   help='verdergaan waar een vorige poging gebleven was: de metingen die al in '
                        '--reeks-uit staan worden hergebruikt en de video wordt vanaf dáár '
                        'gemeten. Bedoeld voor een analyse die door een herstart onderbroken werd.')
    p.add_argument('--na-max-deel', type=float, default=NA_MAX_DEEL,
                   help='hoeveel van de video de tweede passage hoogstens nakijkt '
                        f'(standaard {NA_MAX_DEEL:.0%}). Blijft er meer over, dan winnen de '
                        'sterkste kandidaten en wordt de rest geteld en gemeld.')
    p.add_argument('--zoek-mode', default=None,
                   choices=('performance', 'balanced', 'lightweight'),
                   help='modelgrootte voor de zoekpassage (standaard dezelfde als --mode). '
                        'Klein zoeken en groot nakijken is de goedkoopste weg naar precisie.')
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
        # Een drempel hoort bij een schaal. Is er destijds over een heel ander venster gemeten,
        # dan betekent hetzelfde getal nu iets anders — en dan is zwijgen de slechtste optie.
        toen = getraind.get('venster_mediaan_s')
        if isinstance(toen, (int, float)) and toen > 0:
            verwacht = min(VENSTER_HOOG_S, max(VENSTER_LAAG_S, 1.0 / args.analyse_fps))
            if abs(toen - verwacht) > 0.5 * verwacht:
                print(f'  LET OP: die drempel is geleerd op metingen over ± {toen:.2f} s, terwijl '
                      f'deze stand rond {verwacht:.2f} s meet. Stel het model opnieuw bij op deze '
                      'stand, anders slaat de drempel te vaak of te zelden aan.')
    else:
        print(f'Nog niet getraind — geschatte instellingen: drempel {drempel:g}, '
              f'minimale afstand {min_afstand:g}s. Zie cv/train.py.')

    # Het model laden kan bij de eerste keer minuten duren (rtmlib haalt dan zijn gewichten op).
    # Zonder deze twee meldingen lijkt de analyse in die tijd stil te staan.
    zoek_mode = args.zoek_mode or args.mode
    print(f'Houdingsmodel laden ({zoek_mode}) …')
    laden = Melder(1.0)
    laden.meld(0.0, 'houdingsmodel laden', forceer=True)
    model = laad_model(zoek_mode)
    laden.meld(0.0, 'houdingsmodel geladen', forceer=True)
    # Hervatten: wat er al gemeten was, staat in --reeks-uit. Alleen de metingen van de eerste
    # passage tellen mee — de tweede passage hangt af van waar de eerste kandidaten vond, en die
    # zijn er pas als de eerste helemaal rond is.
    eerder: list[dict] = []
    vanaf = 0.0
    if args.hervat and args.reeks_uit:
        eerder = [r for r in lees_reeks(args.reeks_uit) if r.get('passage') != 2]
        if eerder:
            # Eén meting terug: de laatste regel kan halverwege afgebroken zijn, en de maat kijkt
            # sowieso naar een venster erachter.
            eerder = eerder[:-1]
        if eerder:
            vanaf = eerder[-1]['t']
            print(f'Hervatten: {len(eerder)} metingen tot {vanaf / 60:.1f} min stonden al op '
                  'schijf; de video wordt vanaf daar gemeten.')

    # Meteen wegschrijven terwijl er gemeten wordt: wat op schijf staat, overleeft een herstart.
    schrijver = None
    reeksbestand = None
    if args.reeks_uit:
        reeksbestand = args.reeks_uit.open('a' if eerder else 'w', encoding='utf-8')

        def schrijver(meting, _f=reeksbestand):  # noqa: F811
            _f.write(json.dumps(meting, ensure_ascii=False) + '\n')
            _f.flush()

    # Twee passages delen de balk: zoeken is het leeuwendeel van de tijd, nakijken de rest.
    print(f'Spelers meten in {args.video} (± {args.analyse_fps:g} beelden/s) …')
    gemeten = meet_video(args.video, model, args.analyse_fps, args.tot,
                         deel=(0.0, 0.75) if args.twee_passages else None,
                         vanaf=vanaf, schrijf=schrijver)
    reeks = eerder + gemeten
    if not reeks:
        _fout('geen enkel beeld kon gelezen worden')

    # Tweede passage: alleen rond de kandidaten, maar dan élk beeld.
    fijn: list[dict] = []
    vensters: list[tuple[float, float]] = []
    if args.twee_passages:
        # Bewust een lage drempel: wat de zoekpassage mist, kan het nakijken niet meer vinden.
        # Vals alarm mag — dat sneuvelt straks alsnog op de echte drempel.
        kandidaten = vind_worpmomenten(reeks, drempel * ZOEK_FACTOR, min_afstand * 0.5)
        # De video duurt minstens tot de laatste meting; `--tot` kan ze korter maken.
        videoduur = min(reeks[-1]['t'], args.tot) if args.tot else reeks[-1]['t']
        vensters = zoekvensters(kandidaten, ZOEK_MARGE_S, args.tot,
                                max_deel=args.na_max_deel, duur=videoduur)
        # Hoeveel kandidaten er de begroting niet haalden. Niet stil laten: een analyse die
        # zegt "20 kandidaten" en er 8 nakijkt, vertelt een ander verhaal dan wat ze deed.
        binnen = sum(1 for t, _ in kandidaten if in_venster(t, vensters))
        minuten = sum(b - a for a, b in vensters) / 60
        print(f'Zoekpassage: {len(kandidaten)} kandidaten (drempel {drempel * ZOEK_FACTOR:.2f}) → '
              f'{len(vensters)} stukken van samen {minuten:.1f} minuten op élk beeld nakijken.')
        if binnen < len(kandidaten):
            print(f'  LET OP: {len(kandidaten) - binnen} zwakkere kandidaten vallen buiten de '
                  f'begroting van {args.na_max_deel:.0%} van de video en worden niet nagekeken. '
                  'Verhoog --na-max-deel als je ze tóch wil (het kost rekentijd).')
        if vensters:
            if zoek_mode != args.mode:
                print(f'Zwaarder model laden voor het nakijken ({args.mode}) …')
                model = laad_model(args.mode)
            fijn = meet_video(args.video, model, ELK_BEELD, args.tot,
                              vensters=vensters, deel=(0.75, 1.0))
        else:
            print('  Niets gevonden om na te kijken — de uitslag komt uit de zoekpassage.')

    # De reeks waarop beslist wordt: grof waar er niets te zien was, fijn rond de kandidaten.
    # Dát is wat de detector werkelijk ziet, en dus ook precies wat cv/train.py moet leren.
    #
    # Enkel de fijne metingen bewaren zou de training scheeftrekken: die dekken alleen stukken
    # waar de eerste passage al iets vond, en juist de stukken waar niets gebeurt bepalen
    # hoeveel vals alarm een drempel oplevert. Enkel de grove bewaren is even fout: dan leert
    # het model een drempel op metingen die het bij de beslissing niet gebruikt — en dezelfde
    # worp scoort grof gemeten tot een derde lager. Vandaar: allebei, elk op hun eigen stuk.
    meetreeks = ([{**r, 'passage': 1} for r in reeks if not in_venster(r['t'], vensters)]
                 + [{**r, 'passage': 2} for r in fijn]) if fijn else reeks
    meetreeks.sort(key=lambda r: r['t'])

    if args.reeks_uit:
        # Tijdens het meten stond de reeks er al regel voor regel op (dat is het vangnet bij een
        # herstart). Nu ze compleet is, wordt ze in haar definitieve vorm herschreven: mét de
        # passage-merktekens, en zonder de grove metingen die door een fijne vervangen zijn.
        if reeksbestand is not None:
            reeksbestand.close()
        with args.reeks_uit.open('w', encoding='utf-8') as f:
            for r in meetreeks:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')

    # De wérper komt uit de doorlopende passage: die volgt de spelers door de hele wedstrijd,
    # terwijl de fijne passage losse stukken ziet en na elk gat opnieuw begint te tellen.
    momenten = vind_worpmomenten(meetreeks, drempel, min_afstand)
    events = maak_events(momenten, meetreeks, args.match, drempel,
                         werperreeks=reeks if fijn else None,
                         werper_marge_s=1.0 if fijn else 1e-6)
    with args.uit.open('w', encoding='utf-8') as f:
        for e in events:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')

    bekeken = reeks[-1]['t'] - reeks[0]['t'] if len(reeks) > 1 else 0.0
    gemiddeld_personen = sum(r['personen'] for r in reeks) / len(reeks)
    rapport = {
        'bekeken_s': round(bekeken, 1),
        'metingen': len(reeks) + len(fijn),
        'analyse_fps': args.analyse_fps,
        # Wat er precies gebeurd is: één passage of twee, en hoeveel er nagekeken werd. Zonder
        # dit staat er straks een nauwkeurigheid in de app waarvan niemand weet waar ze vandaan
        # komt.
        'passages': 2 if fijn else 1,
        **({'nagekeken_stukken': len(vensters),
            'nagekeken_s': round(sum(b - a for a, b in vensters), 1),
            'metingen_nakijken': len(fijn),
            'zoek_drempel': round(drempel * ZOEK_FACTOR, 4),
            'zoek_mode': zoek_mode,
            'kandidaten_gezocht': len(kandidaten),
            'kandidaten_nagekeken': binnen} if fijn else {}),
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
