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

Meten in het assenstelsel van de speler
---------------------------------------
Een speler vooraan in beeld is drie keer zo groot als eentje achteraan. Elke maat wordt daarom
gedeeld door de **romphoogte** van diezelfde speler (schouder → heup): dan telt een worp even
zwaar, waar hij ook staat. En de polsWEG — die over twee beelden loopt — wordt niet in
beeldcoördinaten gemeten maar **relatief aan de eigen heup** van diezelfde speler: pols min
heupcentrum, nu tegenover toen. Pant de camera, dan schuiven heup en pols exact samen mee en
valt de pan er wiskundig uit; loopt de speler, dan loopt zijn heup mee en blijft alleen de
armbeweging over. (Eerder werd hiervoor de mediane heupverschuiving van álle spelers van de
polsweg afgetrokken — een pleister die niets kon middelen met één of twee spelers in beeld en
die de loopbeweging van de werper zélf liet staan. Die machinerie is weg; dit vervangt haar.)

    polshoogte = (schouder_y − pols_y) / romphoogte       (> 0 = polsen boven de schouders)
    polsweg    = |Δ(pols − heup)| / romphoogte            (rompen afgelegd, in eigen assen)
    worpscore  = max(0, polshoogte) × polsweg             (over één loslaatfase: 0,08–0,22 s)

De score piekt precies op het moment van loslaten: hoog én ver. Rustig staan met de handen
omhoog legt geen weg af; wild lopen geeft polshoogte nul — en lopen mét de armen omhoog geen
polsweg meer, want de pols beweegt dan niet ten opzichte van de eigen heup.

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
import gc
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
# De maat is romp-relatief geworden, maar de schaal van een échte worp niet — en dat is
# nagemeten, niet aangenomen: op de synthetische skeletten (zwiep van 90 px bij een romp van
# 100 px) piekt een nagebootste worp op 0,78–0,95, in beeldcoördinaten én romp-relatief
# hetzelfde getal, want de heup van de werper staat tijdens de zwiep nagenoeg stil. Wat wél
# verandert is de ruis erónder: een camerapan van 80 px scoorde zonder correctie 0,48 (een
# spookworp boven de drempel) en is nu exact 0; een speler die met de armen omhoog 400 px/s
# loopt — wat de vroegere mediaan-aftrek liet staan — zakt van 0,48 naar 0, terwijl dezelfde
# zwiep mét dat lopen erbovenop gewoon boven de drempel blijft. 0,45 ligt dus nog altijd
# netjes tussen ruis en worp — en het blijft een startpunt, geen waarheid: cv/train.py leert
# het juiste getal uit jouw eigen wedstrijden.
DREMPEL_SCORE = 0.45
# Twee pieken dichter dan dit horen bij dezelfde worp — van dezélfde speler. Twee verschillende
# spelers die binnen deze afstand van elkaar werpen (werper en vanger die terugwerpt, of twee
# velden naast elkaar in beeld) zijn twee worpen; zie ``vind_worpmomenten_per_speler``.
MIN_AFSTAND_S = 3.0
# Onder deze score komt een speler niet in het compacte `per_speler`-veld van de meetreeks.
# De vloer bestaat om de reeks niet op te blazen: in rust scoort bijna iedereen bijna 0, en
# tien spelers × tienduizenden metingen aan nullen wegschrijven dient niemand. Ruim onder elke
# realistische zoekdrempel (kleinste trainbare drempel 0,2 × ZOEK_FACTOR 0,40 = 0,08), zodat de
# zoekpassage nooit een kandidaat verliest aan de compactheid.
PER_SPELER_VLOER = 0.05
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
# De romp-relatieve maat verandert hier niets aan: de worp-piek zelf bleef op dezelfde schaal
# (0,78–0,95 op de synthetische skeletten, identiek aan de oude meting omdat de heup van de
# werper stilstaat tijdens de zwiep), dus de nagemeten factor blijft geldig.
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
    van personen tussen twee metingen hierop gebeurt en niet op de polsen — én dat de polsweg
    ten opzichte van dít punt gemeten wordt: het is de oorsprong van het assenstelsel van de
    speler, waarin camerapan en loopbeweging wegvallen.
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


def snoei_gevolgden(
    geschiedenis: dict[int, list[tuple[float, dict]]],
    laatst_gezien: dict[int, float],
    vorige: dict[int, dict],
    nu_t: float,
    gat_s: float,
) -> int:
    """Spelers die niemand meer kan koppelen uit de boekhouding gooien. Geeft het aantal terug.

    Waarom dit moet, en waarom het geen luxe is. Elke persoon die `koppel_personen` niet aan een
    vorige meting kan hangen, krijgt een NIEUW nummer — en op een wedstrijdvideo van een uur met
    een camera in de hand gebeurt dat voortdurend. De metingen zelf worden weggeschreven en
    afgekapt, maar deze twee mappen groeiden de hele analyse door: één sleutel per nummer dat
    ooit bestond, tienduizenden na een uur, elk met een (leeggelopen) lijst eraan.

    Dat is precies de vorm van een fout die je nooit als foutmelding ziet: het proces wordt
    langzaam groter tot de kernel het neerlegt (SIGKILL), midden in de langste stap van de
    keten, zonder dat Python nog iets kan zeggen. Op het scherm stond dan enkel "Python stopte
    met code -1".

    Wat weg mag: een nummer dat niet meer in `vorige` staat (daar kan de volgende meting nog aan
    koppelen) én waarvan de geschiedenis leeg of ouder dan één gat is. Zo'n nummer kan per
    definitie niet meer terugkomen — het opruimen verandert dus niets aan de meting.
    """
    weg = [
        wie for wie, lijst in geschiedenis.items()
        if wie not in vorige and (not lijst or nu_t - lijst[-1][0] > gat_s)
    ]
    for wie in weg:
        geschiedenis.pop(wie, None)
        laatst_gezien.pop(wie, None)
    return len(weg)


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

    Camerabeweging hoeft hier niet meer gecompenseerd te worden: ``worpscore`` meet de polsweg
    in het assenstelsel van de speler zelf, en daar staat een pannende camera per definitie stil.
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

    IN HET ASSENSTELSEL VAN DE SPELER. De polsweg is niet |Δpols| in beeldcoördinaten maar
    |Δ(pols − heup)| van diezelfde speler: waar de hand naartoe ging ten opzichte van het eigen
    bekken. Pant de camera, dan schuiven heup en pols exact samen mee en valt de pan er
    wiskundig uit — ook met één speler in beeld, en ook als de camera de zwaai méévolgt (dan
    staat de pols in beeld stil maar schuift de heup, en komt de zwaai er juist bij). Loopt de
    speler terwijl hij werpt, dan loopt zijn heup mee en blijft alleen de armbeweging over.
    De vroegere mediaan-aftrek van de gedeelde heupverschuiving van alle spelers is hiermee
    vervallen: die kon niets middelen met één of twee spelers in beeld en liet de loopbeweging
    van de werper zélf in de score staan — twee halve oplossingen zijn hier één hele geworden.
    Ontbreekt een heup (het model twijfelt juist bij de romprotatie van een worp), dan valt de
    meting terug op beeldcoördinaten: liever een minder zuivere meting dan geen.

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
    heup_hier = huidige.get('heup')
    heup_daar = vorige.get('heup')
    if heup_hier is not None and heup_daar is not None:
        # Elke meting in de eigen rompen van dát moment: zoomt de camera tussen de twee
        # metingen, dan is de verhouding pols-tot-heup nog altijd vergelijkbaar.
        romp_daar = vorige.get('romp') or romp
        weg_x = (hier[0] - heup_hier[0]) / romp - (daar[0] - heup_daar[0]) / romp_daar
        weg_y = (hier[1] - heup_hier[1]) / romp - (daar[1] - heup_daar[1]) / romp_daar
        return hoogte * math.hypot(weg_x, weg_y)
    # Zonder heup geen assenstelsel: beeldcoördinaten als noodgreep, zodat één onzeker
    # heup-frame de worp niet wist.
    weg_x = hier[0] - daar[0]
    weg_y = hier[1] - daar[1]
    return hoogte * (math.hypot(weg_x, weg_y) / romp)


def vind_worpmomenten(
    reeks: list[dict],
    drempel: float = DREMPEL_SCORE,
    min_afstand_s: float = MIN_AFSTAND_S,
) -> list[tuple[float, float]]:
    """De momenten waarop iemand werpt: (tijd, score), de eerste piek van elke groep.

    `reeks` is per moment ``{'t': seconden, 'score': float}`` — de hoogste score over alle
    spelers op dat moment. Een lokaal maximum boven de drempel telt als worp; pieken dichter
    dan `min_afstand_s` bij elkaar horen bij dezelfde worp.

    Binnen zo'n groep wint de ÉÉRSTE piek boven de drempel, niet de sterkste. De sterkste is
    vaak niet de worp: de vanger die vlak ná het loslaten snel de armen heft, scoort zelf hoog
    én ver — hoger dan de werper. De sterkste nemen schoof het moment dan naar de vángst
    (0,2–2 s te laat), mét de werper-id en positie van de vanger. Het loslaten is per definitie
    de eerste beweging van de groep; wat erna komt, is gevolg.

    Deze functie kijkt alleen naar het frame-maximum en blijft daarmee blind voor twee spelers
    die kort na elkaar werpen — dat lost ``vind_worpmomenten_per_speler`` op. Ze blijft hier
    staan omdat cv/train.py (en oudere meetreeksen zonder `per_speler`-veld) haar contract
    gebruiken; zodra train per speler leert, kan ze weg.
    """
    kandidaten = []
    for i in range(1, len(reeks) - 1):
        s = reeks[i]['score']
        if s >= drempel and s >= reeks[i - 1]['score'] and s > reeks[i + 1]['score']:
            kandidaten.append((reeks[i]['t'], s))
    kandidaten.sort()
    gekozen: list[tuple[float, float]] = []
    for t, s in kandidaten:
        if all(abs(t - g) >= min_afstand_s for g, _ in gekozen):
            gekozen.append((t, s))
    return gekozen


def _per_speler_reeksen(reeks: list[dict]) -> dict[str, list[tuple[float, float]]]:
    """Per werper-id de eigen (t, score)-reeks, uit de compacte `per_speler`-velden.

    De sleutels worden tekst: na een JSON-rondgang (--reeks-uit, --hervat) zíjn ze dat al,
    en één sleuteltype betekent dat dezelfde speler niet in twee reeksen uiteenvalt.
    """
    per: dict[str, list[tuple[float, float]]] = {}
    for r in reeks:
        scores = r.get('per_speler')
        if not isinstance(scores, dict):
            continue
        for wie, s in scores.items():
            if isinstance(s, (int, float)):
                per.setdefault(str(wie), []).append((r['t'], float(s)))
    for lijst in per.values():
        lijst.sort()
    return per


def vind_worpmomenten_per_speler(
    reeks: list[dict],
    drempel: float = DREMPEL_SCORE,
    min_afstand_s: float = MIN_AFSTAND_S,
) -> list[tuple[float, float, int | str | None]]:
    """De worpmomenten pér speler: (tijd, score, werper-id), op tijd gesorteerd.

    Waarom niet gewoon ``vind_worpmomenten``. Die ziet per moment alleen de beste score over
    álle spelers, en `min_afstand_s` voegt dan alles binnen die afstand samen tot één worp —
    ook als het twee verschíllende spelers waren: de werper en de vanger die meteen terugwerpt,
    of twee velden naast elkaar in beeld. Dat zijn twee gebeurtenissen, geen één. Hier krijgt
    elke speler zijn eigen reeks (het `per_speler`-veld van de meting) en zoekt de piekzoektocht
    per reeks; `min_afstand_s` groepeert alleen nog pieken van dezélfde speler (zijn aanloop en
    zwaai), en binnen zo'n groep wint zijn éérste piek — het loslaten is de eerste beweging.

    De vangst overschrijft de worp dus nooit meer: het loslaatmoment, de werper en het worptype
    komen uit de reeks van de wérper. Heft de vanger de armen snel genoeg om zélf boven de
    drempel te komen, dan wordt dat een éigen, apart voorstel op zijn eigen moment — de
    reviewlaan wijst het af, en cv/train.py kan het later per speler leren wegdrempelen.

    Een reeks zónder `per_speler`-velden (gemeten vóór deze upgrade) valt terug op de oude
    frame-maximum-zoektocht, met werper None; zo blijft --hervat op oude reeksen werken.
    """
    per = _per_speler_reeksen(reeks)
    if not per:
        return [(t, s, None) for t, s in vind_worpmomenten(reeks, drempel, min_afstand_s)]
    # De eigen reeks van een speler is schaars: alleen zijn scores boven de ruisvloer staan
    # erin. Een "buurmeting" die verder weg ligt dan ± anderhalve meetstap is dus geen buur
    # maar een vólgende uitbarsting, met stilte (onder de vloer) ertussen — die telt in de
    # piektoets als 0, anders leest een tweede zwaai als de stijgende flank van de eerste.
    tijden = [r['t'] for r in reeks]
    stappen = sorted(b - a for a, b in zip(tijden, tijden[1:]) if b > a)
    buurgrens = max(0.06, 1.5 * (stappen[len(stappen) // 2] if stappen else 0.2))
    gekozen: list[tuple[float, float, int | str | None]] = []
    for wie, lijst in per.items():
        kandidaten = []
        for i, (t, s) in enumerate(lijst):
            if s < drempel:
                continue
            vorig = lijst[i - 1][1] if i > 0 and t - lijst[i - 1][0] <= buurgrens else 0.0
            volgend = (lijst[i + 1][1]
                       if i + 1 < len(lijst) and lijst[i + 1][0] - t <= buurgrens else 0.0)
            if s >= vorig and s > volgend:
                kandidaten.append((t, s))
        eigen: list[tuple[float, float]] = []
        for t, s in kandidaten:                       # al op tijd gesorteerd: eerste piek wint
            if all(abs(t - g) >= min_afstand_s for g, _ in eigen):
                eigen.append((t, s))
        # Werper-ids zijn in het geheugen ints; na een JSON-rondgang tekst. Terug naar int
        # waar dat kan, zodat events uit beide rondes hetzelfde type dragen.
        nummer: int | str = int(wie) if wie.lstrip('-').isdigit() else wie
        gekozen.extend((t, s, nummer) for t, s in eigen)
    gekozen.sort(key=lambda m: (m[0], -m[1]))
    return gekozen


def worp_type(reeks: list[dict], tijd: float, venster_s: float = 0.6,
              wie: int | str | None = None) -> str | None:
    """Nekworp of rugworp, aan de richting van de zwaai.

    Bij een **nekworp** komt de bal van boven het hoofd naar voren: de polsen zijn vóór het
    loslaten al hoog en zakken erna. Bij een **rugworp** gaat de bal ruggelings over het hoofd:
    de polsen komen pas óp of ná het loslaten omhoog. Geen van beide duidelijk → None; liever
    niets beweren dan gokken, de reviewlaan corrigeert toch.

    De hoogtes moeten van de wérper zijn. Het frame-maximum over alle spelers is dat niet: op
    het veld staat ook de vanger, en die heft vlak na het loslaten zelf de armen — dan blijft
    "na" hoog hangen en wordt een zuivere nekworp None. Staat er per meting bijgehouden wie
    welke polshoogte had (``hoogtes``), dan telt hier alleen de reeks van de werper van dit
    moment; oudere reeksen zonder dat veld vallen terug op het frame-maximum.

    `wie` benoemt de werper rechtstreeks (de per-speler-zoektocht wéét wie er piekte); zonder
    `wie` wordt hij uit de meting op dit tijdstip gelezen. Dat verschil telt bij twee worpen
    kort na elkaar: de meting kan dan de piek van de ándere speler dragen.
    """
    if wie is not None:
        werper = wie
    else:
        piek = werper_op(reeks, tijd, marge_s=0.05)
        werper = piek.get('werper') if piek else None

    def hoogte_van_de_werper(r: dict) -> float | None:
        hoogtes = r.get('hoogtes')
        if werper is not None and isinstance(hoogtes, dict):
            h = hoogtes.get(werper)
            # Na een JSON-rondgang (--reeks-uit, --hervat) zijn de sleutels tekst geworden.
            return h if h is not None else hoogtes.get(str(werper))
        return r.get('polshoogte')

    voor: list[float] = []
    na: list[float] = []
    for r in reeks:
        h = hoogte_van_de_werper(r)
        if h is None:
            continue
        if tijd - venster_s <= r['t'] < tijd:
            voor.append(h)
        elif tijd < r['t'] <= tijd + venster_s:
            na.append(h)
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


def hervatpunt(eerder: list[dict]) -> tuple[list[dict], float, int]:
    """Waar een onderbroken meting weer oppakt: (te behouden metingen, meetpunt, eerste werper-id).

    Drie dingen gebeuren hier bewust:

    * De laatste meting gaat eraf: de stroom kan halverwege die regel afgebroken zijn.
    * Er wordt een vol venster (``VENSTER_HOOG_S``) vóór de laatste meting hervat, en de oude
      metingen in die overlap vervallen. Gewoon op de laatste meting verdergaan zette het
      naadtijdstip twee keer in de reeks (de oude score naast een verse 0,0 — de nieuwe meting
      begint immers zonder geschiedenis; zo'n geïnjecteerd nulpunt maakt van een stijgende
      flank een vals lokaal maximum) en liet de eerste ± 0,22 s na de naad te laag scoren.
      Nu wordt de naad opnieuw gemeten mét opgebouwde geschiedenis, en staat elk tijdstip
      precies één keer in de reeks.
    * De werper-nummering telt verder boven het hoogste nummer dat al vergeven was. Het nieuwe
      proces zou anders opnieuw bij 0 beginnen en verschillende spelers onder één nummer
      plakken — dan voegt "één keer per speler zeggen wie het is" vreemden samen.
    """
    eerder = eerder[:-1]
    if not eerder:
        return [], 0.0, 0
    vanaf = max(0.0, eerder[-1]['t'] - VENSTER_HOOG_S)
    return [r for r in eerder if r['t'] < vanaf], vanaf, volgend_werpernummer(eerder)


def volgend_werpernummer(reeks: list[dict]) -> int:
    """Het eerste werper-nummer dat in deze meetreeks nog niet vergeven is.

    Zowel `werper` (de piek-speler per meting) als de sleutels van `hoogtes` (álle gevolgde
    spelers) tellen mee; na een JSON-rondgang zijn die sleutels tekst geworden.
    """
    ids = [r['werper'] for r in reeks if isinstance(r.get('werper'), int)]
    for r in reeks:
        hoogtes = r.get('hoogtes')
        if isinstance(hoogtes, dict):
            for sleutel in hoogtes:
                try:
                    ids.append(int(sleutel))
                except (TypeError, ValueError):
                    continue
    return max(ids, default=-1) + 1


def meet_video(videopad: Path, model, analyse_fps: float, tot: float | None = None,
               vensters: list[tuple[float, float]] | None = None,
               deel: tuple[float, float] | None = None,
               vanaf: float = 0.0,
               schrijf=None,
               eerste_werper: int = 0) -> list[dict]:
    """Per moment de worpscore per speler, plus de beste ervan als frame-score.

    Geeft een reeks ``{'t', 'score', 'polshoogte', 'personen'}``, waarbij `score` de beste
    per-speler-score van dat moment is en `werper` daar consistent bij hoort. Het compacte
    veld `per_speler` (werper-id → score, alleen boven ``PER_SPELER_VLOER``) draagt de
    scorereeks per speler, zodat ``vind_worpmomenten_per_speler`` twee spelers die kort na
    elkaar werpen als twee worpen kan zien. Het model draait op elk bemonsterd beeld; dat is
    het dure deel, dus `analyse_fps` bepaalt de rekentijd.
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
    `eerste_werper` hoort daarbij: het nieuwe proces nummert verder boven de nummers die de
    onderbroken poging al vergaf, zodat "werper 0" niet twee verschillende spelers wordt.
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
    # Wanneer elke gevolgde speler voor het laatst een bruikbare heup had. Eén meting waarin het
    # model even niet zeker is van de heup (en dat gebeurt juist bij de romprotatie van een
    # worp) mag zijn nummer en geschiedenis niet weggooien.
    laatst_gezien: dict[int, float] = {}
    geschiedenis: dict[int, list[tuple[float, dict]]] = {}
    volgende_werper = eerste_werper
    # Boven dit gat tussen twee metingen is er niets meer te koppelen. De grens schaalt mee met
    # de meetstap: op een grove stand (± 1 meting per seconde) is elke stap groter dan drie
    # vensters, en een vaste grens zou dan bij élke meting de geschiedenis wissen — elke score
    # exact nul, stil, precies op de trage servers waarvoor die stand bestaat.
    gat_s = max(VENSTER_HOOG_S * 3, 2.5 * dt)
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
            if vorige_t is not None and t - vorige_t > gat_s:
                vorige, geschiedenis, laatst_gezien = {}, {}, {}
            koppeling = koppel_personen(vorige, gemeten)
            nu: dict[int, dict] = {}
            for i, staat in enumerate(gemeten):
                wie = koppeling.get(i)
                if wie is None:
                    wie = volgende_werper
                    volgende_werper += 1
                nu[wie] = staat
            beste_score, beste_hoogte, beste_wie = 0.0, None, None
            beste_venster = None
            # De score pér speler, in zijn eigen assenstelsel (camerapan en lopen vallen daar
            # vanzelf uit — zie worpscore). Alleen scores boven de ruisvloer worden bewaard,
            # anders groeit de reeks met tienduizenden nullen.
            per_speler: dict[int, float] = {}
            for wie, staat in nu.items():
                # De weg over een vást venster van ± 0,12 s, niet over de stap tussen twee
                # metingen: anders hangt de score af van hoe fijn je bemonstert en betekent
                # dezelfde worp op de stand "ultra" iets anders dan op "gewoon".
                s, venster = beste_worpscore(geschiedenis.get(wie, []), staat, t)
                if s >= PER_SPELER_VLOER:
                    per_speler[wie] = round(s, 4)
                if s > beste_score:
                    beste_score = s
                    beste_wie = wie
                    beste_venster = venster
                if staat['polshoogte'] is not None:
                    beste_hoogte = staat['polshoogte'] if beste_hoogte is None else max(beste_hoogte, staat['polshoogte'])
            meting = {'t': round(t, 3), 'score': round(beste_score, 4),
                      'polshoogte': beste_hoogte, 'personen': len(keypoints)}
            if per_speler:
                meting['per_speler'] = per_speler
            # De polshoogte pér speler, niet alleen het frame-maximum: `worp_type` moet de zwaai
            # van de wérper kunnen lezen, en het maximum is vlak na een worp vaak de vanger.
            hoogtes = {wie: round(staat['polshoogte'], 3) for wie, staat in nu.items()
                       if staat['polshoogte'] is not None}
            if hoogtes:
                meting['hoogtes'] = hoogtes
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
            # De koppel-referentie per id bijhouden in plaats van te vervangen: zakt de heup-
            # zekerheid van een speler één meting onder de drempel (en dat gebeurt juist bij de
            # romprotatie van een worp), dan blijft zijn laatst bekende heup nog even staan en
            # vindt de volgende meting hem gewoon terug. Vroeger kreeg hij een nieuw nummer en
            # was zijn hele geschiedenis onbereikbaar — score 0 precies rond het loslaten.
            for wie, staat in nu.items():
                if staat['heup'] is not None:
                    vorige[wie] = staat
                    laatst_gezien[wie] = t
            vorige = {wie: staat for wie, staat in vorige.items()
                      if t - laatst_gezien[wie] <= gat_s}
            vorige_t = t
            # De geschiedenis per persoon: net lang genoeg om altijd een meting van ± een venster
            # geleden te hebben, ook op de fijnste stand.
            for wie, staat in nu.items():
                lijst = geschiedenis.get(wie, [])
                lijst.append((t, staat))
                geschiedenis[wie] = [p for p in lijst if t - p[0] <= VENSTER_HOOG_S * 1.5][-40:]
            # En de nummers die niemand meer kan koppelen eruit. Zonder dit blijft er van élke
            # speler die ooit even in beeld liep een sleutel staan — de enige onbegrensd
            # groeiende boekhouding in deze lus (zie snoei_gevolgden).
            snoei_gevolgden(geschiedenis, laatst_gezien, vorige, t, gat_s)
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


def werper_op(reeks: list[dict], tijd: float, marge_s: float = 1e-6,
              wie: int | str | None = None) -> dict | None:
    """Wie wierp er op dit moment, en waar stond die? (De meting het dichtst bij dat tijdstip.)

    `marge_s` bestaat voor de twee passages: het moment komt dan uit de fijne passage, maar de
    werper uit de grove — die volgt de spelers dóór de hele video en houdt hun nummer vast,
    terwijl de fijne passage alleen losse stukken rond de kandidaten ziet en dus na elk gat
    opnieuw zou beginnen tellen.

    Met `wie` telt alleen een meting waar díe speler de piek-werper was: bij twee worpen kort
    na elkaar mag de positie van speler A niet aan de worp van speler B hangen.
    """
    beste: tuple[float, dict] | None = None
    for r in reeks:
        if r.get('werper') is None:
            continue
        if wie is not None and str(r['werper']) != str(wie):
            continue
        afstand = abs(r.get('t', 1e9) - tijd)
        if afstand <= marge_s and (beste is None or afstand < beste[0]):
            beste = (afstand, r)
    return beste[1] if beste else None


def maak_events(momenten: list[tuple], reeks: list[dict], match_id: int | None,
                drempel: float, werperreeks: list[dict] | None = None,
                werper_marge_s: float = 1e-6) -> list[dict]:
    """`momenten` mag (t, score) zijn, of (t, score, werper-id) uit de per-speler-zoektocht.

    Weet het moment zélf al wie er wierp, dan wint dat: de dichtstbijzijnde meting kan bij twee
    worpen kort na elkaar de piek van de ándere speler dragen. De positie komt dan van een
    meting waar diezélfde speler de piek was — of blijft weg, want een verkeerde plek is erger
    dan geen.
    """
    events = []
    for m in momenten:
        t, s = m[0], m[1]
        wie = m[2] if len(m) > 2 else None
        bron = werperreeks if werperreeks is not None else reeks
        w = werper_op(bron, t, werper_marge_s, wie=wie)
        if w is not None:
            # Wélke werper (een volgnummer dat door de hele video hetzelfde blijft zolang de
            # speler gevolgd kan worden) en waar die stond. Daarmee groepeert de app de worpen
            # per werper, zodat je één keer per speler zegt wie het is.
            werper_velden = {'werper': w['werper'], 'werper_px': [w.get('x'), w.get('y')]}
        elif wie is not None:
            werper_velden = {'werper': wie, 'werper_px': [None, None]}
        else:
            werper_velden = {}
        events.append({
            'match_id': match_id,
            'video_time_s': round(t, 3),
            'frame': None,
            'event_type': 'worp',
            'worp_type': worp_type(reeks, t, wie=wie),
            'zone': None,
            'afstand_m': None,
            'speler': None,
            'score_delta': 0,
            'confidence': round(vertrouwen(s, drempel), 3),
            **werper_velden,
            'provenance': {'model': MODEL_NAAM, 'model_version': MODEL_VERSION},
        })
    return events


def _lever_afgeronde_reeks(meetreeks: list[dict], uit: Path, match_id: int | None,
                           drempel: float, min_afstand: float) -> None:
    """De uitkomst van een al voltooide meting opnieuw opleveren, zonder iets te meten.

    Een reeks mét passage-2-regels is de definitieve, herschreven vorm van een afgeronde
    twee-passages-run: de grove metingen binnen de nakijkvensters zijn daarin vervángen door
    fijne. Daar valt niets te hervatten. De hervat-filter zou de fijne regels weggooien en met
    gaten van ± 1,6 s precies rond elke eerder gevonden worp verder "meten" — waarna de herrun
    stilletjes nul worpen meldt. Dit gebeurt niet alleen bij wie bewust herstart: de server
    zet --hervat óók als een látere stap (balbaan, landing) struikelde, en dan draait deze
    voltooide stap gewoon opnieuw. De beslissing is deterministisch, dus opnieuw beslissen op
    de bewaarde reeks geeft dezelfde worpen als de oorspronkelijke run — dat verrast de keten
    het minst, en het spaart ook nog het model laden uit.
    """
    # Per speler beslissen, net als de oorspronkelijke run; een oude reeks zonder
    # `per_speler`-veld valt daarbinnen vanzelf terug op de frame-maximum-zoektocht.
    momenten = [(t, s) for t, s, _wie in
                vind_worpmomenten_per_speler(meetreeks, drempel, min_afstand)]
    # De werper komt uit de doorlopende (grove) passage; binnen de nakijkvensters bestaan die
    # regels niet meer, dus de dichtstbijzijnde ernaast moet volstaan. De werper-ids van de
    # fijne passage zeggen niets over de wedstrijd als geheel, dus het per-speler-id van het
    # moment zelf gaat hier bewust niet mee.
    grof = [r for r in meetreeks if r.get('passage') != 2]
    events = maak_events(momenten, meetreeks, match_id, drempel,
                         werperreeks=grof or None, werper_marge_s=1.0)
    with uit.open('w', encoding='utf-8') as f:
        for e in events:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')
    rapport_pad = uit.with_suffix(uit.suffix + '.rapport.json')
    if not rapport_pad.is_file():
        # Het rapport van de oorspronkelijke run staat er meestal nog en is rijker; alleen als
        # het weg is komt er een kaal exemplaar, zodat de app tenminste weet wat er bekeken is.
        bekeken = meetreeks[-1]['t'] - meetreeks[0]['t'] if len(meetreeks) > 1 else 0.0
        rapport = {
            'bekeken_s': round(bekeken, 1),
            'metingen': len(meetreeks),
            'passages': 2,
            'kandidaten': len(events),
            'model': MODEL_NAAM,
            'drempel': drempel,
            'min_afstand_s': min_afstand,
            'hergebruikt': True,
        }
        rapport_pad.write_text(json.dumps(rapport, ensure_ascii=False), encoding='utf-8')
    print(f'{len(events)} worpen → {uit} (uit de bewaarde meetreeks, zonder nieuwe meting)')


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

    # Hervatten: wat er al gemeten was, staat in --reeks-uit. Dit gebeurt vóór het model laden:
    # blijkt de meting al helemaal af, dan hoeft dat dure laden niet eens.
    eerder: list[dict] = []
    vanaf = 0.0
    eerste_werper = 0
    if args.hervat and args.reeks_uit:
        alles = lees_reeks(args.reeks_uit)
        if any(r.get('passage') == 2 for r in alles):
            # Nakijk-metingen in het bestand: dit is de definitieve, herschreven vorm van een
            # run die al helemaal rond was. Hervatten zou die regels wegfilteren en alle worpen
            # stil kwijtraken — dus niets opnieuw meten, de bestaande uitkomst leveren.
            print('Hervatten: de meetreeks was al afgerond (ze bevat nakijk-metingen). '
                  'Er wordt niets opnieuw gemeten; de uitslag komt uit de bewaarde reeks.')
            _lever_afgeronde_reeks(alles, args.uit, args.match, drempel, min_afstand)
            return
        eerder, vanaf, eerste_werper = hervatpunt(alles)
        if eerder:
            print(f'Hervatten: {len(eerder)} metingen tot {vanaf / 60:.1f} min stonden al op '
                  'schijf; de video wordt vanaf daar gemeten (met een vol venster overlap, '
                  'zodat de naad niet koud begint).')

    # Het model laden kan bij de eerste keer minuten duren (rtmlib haalt dan zijn gewichten op).
    # Zonder deze twee meldingen lijkt de analyse in die tijd stil te staan.
    zoek_mode = args.zoek_mode or args.mode
    print(f'Houdingsmodel laden ({zoek_mode}) …')
    laden = Melder(1.0)
    laden.meld(0.0, 'houdingsmodel laden', forceer=True)
    model = laad_model(zoek_mode)
    laden.meld(0.0, 'houdingsmodel geladen', forceer=True)

    # Meteen wegschrijven terwijl er gemeten wordt: wat op schijf staat, overleeft een herstart.
    schrijver = None
    reeksbestand = None
    if args.reeks_uit:
        if eerder:
            # De overlap rond de naad wordt opnieuw gemeten; de oude regels in die overlap horen
            # dan niet meer in het bestand — anders staan die tijdstippen er straks twee keer in
            # en leest een vólgende onderbreking weer een vervuilde naad.
            with args.reeks_uit.open('w', encoding='utf-8') as f:
                for r in eerder:
                    f.write(json.dumps(r, ensure_ascii=False) + '\n')
        reeksbestand = args.reeks_uit.open('a' if eerder else 'w', encoding='utf-8')

        def schrijver(meting, _f=reeksbestand):  # noqa: F811
            _f.write(json.dumps(meting, ensure_ascii=False) + '\n')
            _f.flush()

    # Twee passages delen de balk: zoeken is het leeuwendeel van de tijd, nakijken de rest.
    print(f'Spelers meten in {args.video} (± {args.analyse_fps:g} beelden/s) …')
    gemeten = meet_video(args.video, model, args.analyse_fps, args.tot,
                         deel=(0.0, 0.75) if args.twee_passages else None,
                         vanaf=vanaf, schrijf=schrijver, eerste_werper=eerste_werper)
    reeks = eerder + gemeten
    if not reeks:
        _fout('geen enkel beeld kon gelezen worden')

    # Tweede passage: alleen rond de kandidaten, maar dan élk beeld.
    fijn: list[dict] = []
    vensters: list[tuple[float, float]] = []
    if args.twee_passages:
        # Bewust een lage drempel: wat de zoekpassage mist, kan het nakijken niet meer vinden.
        # Vals alarm mag — dat sneuvelt straks alsnog op de echte drempel. Per speler gezocht:
        # werpen twee spelers kort na elkaar, dan verdient elk zijn eigen nakijkvenster.
        kandidaten = [(t, s) for t, s, _wie in
                      vind_worpmomenten_per_speler(reeks, drempel * ZOEK_FACTOR,
                                                   min_afstand * 0.5)]
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
                # Eerst het zoekmodel écht loslaten. Zonder dit staan er even twee ONNX-sessies
                # in het geheugen, en op een krappe container is dat precies het moment waarop
                # de kernel het proces neerlegt (SIGKILL, geen foutmelding).
                model = None
                gc.collect()
                model = laad_model(args.mode)
            # De nakijkpassage nummert haar spelers boven die van de zoekpassage: anders kan
            # `worp_type` aan de rand van een venster de hoogtes van een grove meting lezen
            # waar hetzelfde nummer een ándere speler was.
            fijn = meet_video(args.video, model, ELK_BEELD, args.tot,
                              vensters=vensters, deel=(0.75, 1.0),
                              eerste_werper=volgend_werpernummer(reeks))
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

    # Per speler beslissen: twee spelers die binnen de minimale afstand van elkáár werpen
    # (werper en vanger die terugwerpt, twee velden naast elkaar) zijn twee worpen.
    momenten_per_speler = vind_worpmomenten_per_speler(meetreeks, drempel, min_afstand)
    # De wérper komt uit de doorlopende passage: die volgt de spelers door de hele wedstrijd,
    # terwijl de fijne passage losse stukken ziet en na elk gat opnieuw begint te tellen. Bij
    # twee passages zijn de per-speler-ids van het moment dus lokale (fijne) nummers en gaan
    # ze niet mee naar de events; in één passage zijn ze wél de doorlopende nummers.
    momenten = ([(t, s) for t, s, _wie in momenten_per_speler] if fijn
                else momenten_per_speler)
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
