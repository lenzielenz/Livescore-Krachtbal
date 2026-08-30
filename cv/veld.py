"""Veldmodel voor de CV-pipeline — gespiegeld aan ``src/lib/field.ts``.

Bron van waarheid voor de geometrie is en blijft ``src/lib/field.ts`` (KVKBF
reglement 01072025). Dit bestand spiegelt die constanten en conversies exact,
zodat Python (CV) en TypeScript (platform) dezelfde coördinaten spreken.

Conventies (identiek aan field.ts):
  - Genormaliseerde coördinaten: x ∈ [0,1] over de BREEDTE (14 m),
    y ∈ [0,1] over de VOLLEDIGE lengte incl. beide doelgebieden.
  - y=0 = achterlijn-zijde "thuis", y=1 = zijde "uit".
  - De doelgebied-diepte is per terrein instelbaar (min. 10 m, 15 m voor
    nieuwe terreinen); het speelveld tussen de doellijnen is altijd 26 m,
    dus totale lengte = 26 + 2 × diepte.
  - De middellijn ligt altijd exact op y=0.5; doellijn en vrijeworplijn
    verschuiven mét de diepte.

Puur stdlib — bewust geen numpy/cv2, zodat dit module en de tests overal
draaien (ook op de CI zonder CV-dependencies).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Constanten — spiegel van FIELD in src/lib/field.ts
# (widthM / playingLengthM / freeThrowOffsetM / defaultGoalAreaDepthM)
BREEDTE_M = 14.0
SPEELVELD_LENGTE_M = 26.0
VRIJEWORP_OFFSET_M = 4.0
STANDAARD_DOELGEBIED_DIEPTE_M = 10.0


def totale_lengte_m(
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
    speelveld_m: float = SPEELVELD_LENGTE_M,
) -> float:
    """Totale veldlengte (m) = speelveld (standaard 26 m) + 2 doelgebieden.

    Spiegel van totalLengthM. Niet elk terrein is reglementair: geef de
    opgemeten speelveldlengte mee (zelfde waarde als "veldSpeelveld" op de
    wedstrijd in het platform) en de meters kloppen ook daar.
    """
    return speelveld_m + 2.0 * doelgebied_diepte_m


def doellijn_norm(
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
    speelveld_m: float = SPEELVELD_LENGTE_M,
) -> float:
    """Genormaliseerde y van de doellijn aan de y=0-zijde (uit-zijde = 1 − dit).

    Spiegel van goalLineNorm.
    """
    return doelgebied_diepte_m / totale_lengte_m(doelgebied_diepte_m, speelveld_m)


def vrijeworplijn_norm(
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
    speelveld_m: float = SPEELVELD_LENGTE_M,
) -> float:
    """Genormaliseerde y van de vrijeworplijn aan de y=0-zijde (4 m vóór de doellijn).

    Spiegel van freeThrowNorm.
    """
    return (doelgebied_diepte_m + VRIJEWORP_OFFSET_M) / totale_lengte_m(doelgebied_diepte_m, speelveld_m)


def naar_meters(
    x_norm: float,
    y_norm: float,
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte_m: float = BREEDTE_M,
    speelveld_m: float = SPEELVELD_LENGTE_M,
) -> tuple[float, float]:
    """Genormaliseerd punt → meters. Spiegel van toMeters (echte maten optioneel)."""
    return (x_norm * breedte_m, y_norm * totale_lengte_m(doelgebied_diepte_m, speelveld_m))


def naar_norm(
    x_m: float,
    y_m: float,
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte_m: float = BREEDTE_M,
    speelveld_m: float = SPEELVELD_LENGTE_M,
) -> tuple[float, float]:
    """Meters → genormaliseerd punt. Inverse van naar_meters."""
    return (x_m / breedte_m, y_m / totale_lengte_m(doelgebied_diepte_m, speelveld_m))


def afstand_m(
    van: tuple[float, float],
    naar: tuple[float, float],
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
) -> float:
    """Hemelsbrede afstand (m) tussen twee GENORMALISEERDE punten (x, y).

    Spiegel van distanceM: de y-component schaalt met de werkelijke veldlengte.
    """
    dx = (naar[0] - van[0]) * BREEDTE_M
    dy = (naar[1] - van[1]) * totale_lengte_m(doelgebied_diepte_m)
    return math.hypot(dx, dy)


def in_doelgebied(
    y_norm: float,
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
    x_norm: float | None = None,
    speelveld_m: float = SPEELVELD_LENGTE_M,
) -> bool:
    """Ligt de genormaliseerde y in één van BEIDE doelgebieden?

    Richting-agnostisch (de CV-pipeline weet niet welke ploeg aanvalt); wie de
    aanvalsrichting wél kent gebruikt isInTargetGoalArea/isInOwnGoalArea in
    field.ts. Punten exact óp de doellijn tellen niet als in het doelgebied
    (consistent met de strikte ongelijkheden in field.ts). Geef ``x_norm`` mee
    zodra die gekend is (CV-detecties in fase 1+): buiten de zijlijnen is het
    nooit doelgebied — zelfde semantiek als isInTargetGoalArea in field.ts.
    """
    if x_norm is not None and not 0.0 <= x_norm <= 1.0:
        return False
    g = doellijn_norm(doelgebied_diepte_m, speelveld_m)
    return y_norm < g or y_norm > 1.0 - g


@dataclass(frozen=True)
class Kruispunt:
    """Eén gekend lijn-kruispunt op het veld, voor de homografie-kalibratie."""

    nummer: int  # 1-gebaseerd volgnummer (voor aanklikken in calibrate.py)
    label: str  # bv. 'doellijn_thuis_links'
    x_m: float  # veldcoördinaat in meters (x over de breedte, 0 = linkerzijlijn)
    y_m: float  # veldcoördinaat in meters (y over de lengte, 0 = achterlijn thuis)
    x_norm: float
    y_norm: float


def kruispunten(
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte_m: float = BREEDTE_M,
    speelveld_m: float = SPEELVELD_LENGTE_M,
) -> list[Kruispunt]:
    """Alle gekende lijn-kruispunten voor de kalibratie.

    Elk kruispunt van {achterlijn, doellijn, vrijeworplijn (×2 zijden),
    middellijn} × {linkerzijlijn, rechterzijlijn} → 7 dwarslijnen × 2
    zijlijnen = 14 punten. Volgorde: van thuis (y=0) naar uit (y=1), telkens
    eerst links (x=0) dan rechts (x=14 m).
    """
    lengte = totale_lengte_m(doelgebied_diepte_m, speelveld_m)
    dwarslijnen: list[tuple[str, float]] = [
        ('achterlijn_thuis', 0.0),
        ('doellijn_thuis', doelgebied_diepte_m),
        ('vrijeworplijn_thuis', doelgebied_diepte_m + VRIJEWORP_OFFSET_M),
        ('middellijn', lengte / 2.0),
        ('vrijeworplijn_uit', lengte - doelgebied_diepte_m - VRIJEWORP_OFFSET_M),
        ('doellijn_uit', lengte - doelgebied_diepte_m),
        ('achterlijn_uit', lengte),
    ]
    zijlijnen: list[tuple[str, float]] = [('links', 0.0), ('rechts', breedte_m)]

    punten: list[Kruispunt] = []
    nummer = 1
    for lijn_label, y_m in dwarslijnen:
        for zijde_label, x_m in zijlijnen:
            punten.append(
                Kruispunt(
                    nummer=nummer,
                    label=f'{lijn_label}_{zijde_label}',
                    x_m=x_m,
                    y_m=y_m,
                    x_norm=x_m / breedte_m,
                    y_norm=y_m / lengte,
                )
            )
            nummer += 1
    return punten


CAMERA_POSITIES = ('zijlijn', 'achter-thuis', 'achter-uit', 'hoek')


def aanbevolen_labels(
    positie: str,
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
) -> list[str]:
    """Welke kruispunten zijn vanaf deze camerapositie betrouwbaar aan te klikken?

    De veldconventie om links/rechts en thuis/uit eenduidig te houden, waar je
    ook staat: ga (in gedachten) op de THUIS-achterlijn staan en kijk naar de
    uit-kant — links is dan x=0, rechts x=14 m. Film je vanaf de uit-achterkant,
    dan is wat jij links in beeld ziet dus veld-RECHTS.

    - zijlijn: hoog op de middellijn (het standaardprotocol) — alle 14 punten.
    - achter-thuis / achter-uit: achter een achterlijn — de lijnen aan jouw kant
      plus de middellijn (8 punten). De overkant is dan geëxtrapoleerd:
      zones/afstanden dáár zijn onbetrouwbaar; calibrate.py --test zegt dat ook.
    - hoek: alle punten zichtbaar, maar neem er minstens één op élke helft.
    """
    if positie not in CAMERA_POSITIES:
        raise ValueError(f'onbekende camerapositie: {positie} (kies uit {", ".join(CAMERA_POSITIES)})')
    alle = [k.label for k in kruispunten(doelgebied_diepte_m)]
    if positie == 'achter-thuis':
        return [l for l in alle if '_thuis_' in l or l.startswith('middellijn')]
    if positie == 'achter-uit':
        return [l for l in alle if '_uit_' in l or l.startswith('middellijn')]
    return alle


def kruispunt_per_label(
    doelgebied_diepte_m: float = STANDAARD_DOELGEBIED_DIEPTE_M,
    breedte_m: float = BREEDTE_M,
    speelveld_m: float = SPEELVELD_LENGTE_M,
) -> dict[str, Kruispunt]:
    """Kruispunten geïndexeerd op label (kleine letters), voor headless kalibratie."""
    return {k.label: k for k in kruispunten(doelgebied_diepte_m, breedte_m, speelveld_m)}
