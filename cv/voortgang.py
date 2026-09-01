#!/usr/bin/env python3
"""Laten weten hoe ver een stap staat, terwijl ze bezig is.

Waarom dit bestaat
------------------
De zware stappen (het houdingsmodel, het veld volgen, de bewegingsdetectie) duren
minuten tot een uur. De app toonde intussen enkel *welke* stap draaide, en die
balk stond dus een halfuur stil: niet te onderscheiden van een vastgelopen taak.

Elke lange lus meldt hier voortaan hoe ver ze staat. Eén regel op stdout:

    VOORTGANG 0.412 253s van 614s

`src/lib/cv-analyse.ts` leest die regels mee en zet ze in de stand van de
analyse; de balk kruipt daardoor ook binnen één stap vooruit, en de app kan zien
wanneer een stap voor het laatst iets van zich liet horen.

Geknepen op de klok (standaard om de 3 s), niet op het aantal beelden: een lus
die duizend keer per seconde rondgaat mag de uitvoer niet dichtslibben, en een
lus die één keer per tien seconden rondgaat moet toch iets laten horen.
"""

from __future__ import annotations

import sys
import time

VOORTGANG_PREFIX = 'VOORTGANG'
STANDAARD_INTERVAL_S = 3.0
# Pas een resterende tijd melden als de stap al zo lang bezig is; daarvóór is elke schatting
# een gok op basis van één beeld.
MIN_VOOR_SCHATTING_S = 10.0


def _tijd(seconden: float) -> str:
    """Seconden als m:ss — leesbaarder dan een kaal getal in de logs."""
    seconden = max(0.0, seconden)
    return f'{int(seconden // 60)}:{int(seconden % 60):02d}'


class Melder:
    """Meldt met tussenpozen hoe ver een lus staat.

    `totaal` is de noemer (meestal de duur van de video in seconden). Is die
    onbekend, dan wordt er geen fractie gemeld maar wel een teken van leven — ook
    dát is nuttig: het onderscheidt "traag" van "vastgelopen".
    """

    def __init__(self, totaal: float | None = None, interval_s: float = STANDAARD_INTERVAL_S,
                 stroom=None, klok=time.monotonic, deel: tuple[float, float] | None = None) -> None:
        self.totaal = totaal if (totaal and totaal > 0) else None
        self.interval_s = max(0.0, interval_s)
        self.stroom = stroom if stroom is not None else sys.stdout
        self.klok = klok
        # Vult deze lus maar een stuk van de balk? Dan meldt ze binnen dat stuk. Twee passages
        # over dezelfde video die elk van 0 naar 100% lopen, laten de balk terugspringen — en
        # een balk die terugspringt lijkt kapot, ook al klopt er niets aan.
        self.deel = deel
        self._laatst = -1e9
        self._start = self.klok()
        self.meldingen = 0

    def _in_deel(self, fractie: float) -> float:
        if not self.deel:
            return fractie
        van, tot = self.deel
        return van + (tot - van) * fractie

    def _schrijf(self, fractie: float | None, tekst: str) -> None:
        deel = f'{fractie:.3f}' if fractie is not None else '?'
        self.stroom.write(f'{VOORTGANG_PREFIX} {deel} {tekst}\n'.replace('\n\n', '\n'))
        try:
            self.stroom.flush()
        except (AttributeError, ValueError):
            pass
        self.meldingen += 1

    def meld(self, gedaan: float, extra: str = '', forceer: bool = False) -> bool:
        """Meld dat `gedaan` (seconden video, of eender welke eenheid) klaar is.

        Geeft terug of er echt geschreven is — handig in tests. Buiten het
        interval gebeurt er niets, tenzij `forceer`.
        """
        nu = self.klok()
        if not forceer and nu - self._laatst < self.interval_s:
            return False
        self._laatst = nu
        if self.totaal:
            fractie = min(1.0, max(0.0, gedaan / self.totaal))
            tekst = f'{_tijd(gedaan)} van {_tijd(self.totaal)}'
            # Hoelang nog? Pas melden als er genoeg gemeten is om iets te kunnen zeggen: een
            # schatting uit de eerste seconde is een gok, en een verkeerde gok is erger dan geen.
            verstreken = nu - self._start
            if fractie > 0.02 and verstreken >= MIN_VOOR_SCHATTING_S:
                tekst += f', nog ± {_tijd(verstreken * (1 - fractie) / fractie)}'
        else:
            fractie = None
            tekst = f'{_tijd(gedaan)} bekeken'
        self._schrijf(self._in_deel(fractie) if fractie is not None else None,
                      f'{tekst} {extra}'.strip())
        return True

    def klaar(self, extra: str = '') -> None:
        """De stap is rond: één laatste melding op het einde van dit deel."""
        self._laatst = self.klok()
        self._schrijf(self._in_deel(1.0), extra or 'klaar')


def duur_van_video(cv2, cap) -> float | None:
    """De lengte van een geopende video in seconden, of None als ze niet te weten valt.

    Niet elke container draagt een betrouwbaar aantal beelden mee; dan liever geen
    noemer dan een verzonnen percentage dat halverwege over de 100 gaat.
    """
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    if fps <= 0 or frames <= 0:
        return None
    return float(frames) / float(fps)
