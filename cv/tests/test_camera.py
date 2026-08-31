#!/usr/bin/env python3
"""Het camerastandpunt terugrekenen uit de kalibratie.

De harde toets: zet een camera op een bekende plek, laat ze het veld zien, fit de homografie
op wat ze ziet, en kijk of het standpunt eruit terugkomt. Lukt dat op meters, dan is de keuze
van de gebruiker ("midden achter het veld") narekenbaar in plaats van een etiket.
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import calibrate  # noqa: E402
import camera  # noqa: E402
import veld  # noqa: E402

DIEPTE, BREED, SPEEL = 10.0, 14.0, 26.0
LENGTE = veld.totale_lengte_m(DIEPTE, SPEEL)
B, H = 1920, 1080


def _camera(pos, kijk, f=1400.0):
    """Pinhole met vierkante pixels en het hoofdpunt in het midden: veldpunt → beeldpunt."""
    vw = [k - p for k, p in zip(kijk, pos)]
    n = math.dist((0, 0, 0), vw); vw = [c / n for c in vw]
    op = [0, 0, 1]
    r = [vw[1] * op[2] - vw[2] * op[1], vw[2] * op[0] - vw[0] * op[2], vw[0] * op[1] - vw[1] * op[0]]
    n = math.dist((0, 0, 0), r); r = [c / n for c in r]
    u = [r[1] * vw[2] - r[2] * vw[1], r[2] * vw[0] - r[0] * vw[2], r[0] * vw[1] - r[1] * vw[0]]

    def naar_beeld(x, y):
        d = [x - pos[0], y - pos[1], -pos[2]]
        xc = sum(a * b for a, b in zip(d, r))
        yc = sum(a * b for a, b in zip(d, u))
        zc = sum(a * b for a, b in zip(d, vw))
        if zc <= 0.1:
            return None
        return (B / 2 + f * xc / zc, H / 2 - f * yc / zc)

    return naar_beeld


def _homografie(pos, kijk, f=1400.0):
    nb = _camera(pos, kijk, f)
    punten = []
    for k in veld.kruispunten(DIEPTE, BREED, SPEEL):
        p = nb(k.x_m, k.y_m)
        if p and 0 <= p[0] <= B and 0 <= p[1] <= H:
            punten.append({'label': k.label, 'beeld_px': [p[0], p[1]], 'veld_m': [k.x_m, k.y_m]})
    return (calibrate.fit_homografie(punten) if len(punten) >= 4 else None), len(punten)


# Waar de camera echt staat, en welk standpunt de gebruiker daarvoor zou kiezen.
OPSTELLINGEN = [
    ('achter-thuis-midden', (BREED / 2, -14.0, 8.0)),
    ('achter-thuis-links', (-4.0, -12.0, 7.0)),
    ('achter-thuis-rechts', (BREED + 4.0, -12.0, 7.0)),
    ('achter-uit-midden', (BREED / 2, LENGTE + 14.0, 8.0)),
    ('zijlijn-links-midden', (-16.0, LENGTE / 2, 6.0)),
    ('zijlijn-rechts-midden', (BREED + 16.0, LENGTE / 2, 6.0)),
    ('hoek-thuis-links', (-10.0, -10.0, 9.0)),
    ('hoek-uit-rechts', (BREED + 10.0, LENGTE + 10.0, 9.0)),
]


class TestBrandpunt(unittest.TestCase):
    def test_vindt_de_brandpuntsafstand_terug(self):
        for f_echt in (900.0, 1400.0):
            for standpunt in ('achter-thuis-midden', 'zijlijn-links-midden'):
                with self.subTest(brandpunt=f_echt, standpunt=standpunt):
                    pos = dict(OPSTELLINGEN)[standpunt]
                    m, _ = _homografie(pos, (BREED / 2, LENGTE / 2, 0.0), f_echt)
                    g = camera._inverteer(m)
                    f, restfout = camera.brandpunt_uit_homografie(g, B / 2, H / 2, B)
                    self.assertAlmostEqual(f, f_echt, delta=f_echt * 0.01)
                    self.assertLess(restfout, 1e-6)

    def test_de_gesloten_formule_voor_loodrechtheid_ontspoort_achter_het_veld(self):
        # Precies de reden dat f gezócht wordt in plaats van uit één formule gehaald: bij een
        # camera die in de diepte kijkt is c1 bijna nul en deelt die formule door bijna niets.
        m, _ = _homografie((BREED / 2, -14.0, 8.0), (BREED / 2, LENGTE / 2, 0.0), 1400.0)
        loodrecht, gelijk = camera.brandpunt_gesloten_vorm(camera._inverteer(m), B / 2, H / 2)
        self.assertAlmostEqual(gelijk, 1400.0, delta=20.0)
        self.assertGreater(loodrecht, 2000.0)          # ver ernaast
        # En de zoektocht laat zich er niet door meeslepen.
        self.assertAlmostEqual(camera.camerastandpunt(m, B, H)['brandpunt_px'], 1400.0, delta=20.0)


class TestStandpunt(unittest.TestCase):
    def test_vindt_elk_standpunt_terug_op_een_halve_meter(self):
        for naam, pos in OPSTELLINGEN:
            with self.subTest(standpunt=naam):
                m, zicht = _homografie(pos, (BREED / 2, LENGTE / 2, 0.0))
                self.assertGreaterEqual(zicht, 4, 'te weinig punten in beeld')
                gemeten = camera.camerastandpunt(m, B, H)
                self.assertIsNotNone(gemeten)
                self.assertAlmostEqual(gemeten['x_m'], pos[0], delta=0.5)
                self.assertAlmostEqual(gemeten['y_m'], pos[1], delta=0.5)
                self.assertAlmostEqual(gemeten['hoogte_m'], pos[2], delta=0.5)

    def test_het_teruggerekende_standpunt_hoort_bij_de_gekozen_positie(self):
        for naam, pos in OPSTELLINGEN:
            with self.subTest(standpunt=naam):
                m, _ = _homografie(pos, (BREED / 2, LENGTE / 2, 0.0))
                oordeel = camera.beoordeel(naam, m, B, H, BREED, LENGTE)
                self.assertEqual(oordeel['oordeel'], 'klopt')

    def test_een_verkeerde_keuze_wordt_opgemerkt(self):
        # Camera stond achter de thuislijn, gebruiker koos "achter de uitlijn".
        m, _ = _homografie((BREED / 2, -14.0, 8.0), (BREED / 2, LENGTE / 2, 0.0))
        self.assertEqual(camera.beoordeel('achter-uit-midden', m, B, H, BREED, LENGTE)['oordeel'], 'wijkt af')

    def test_zonder_keuze_wordt_er_niet_geoordeeld(self):
        m, _ = _homografie((BREED / 2, -14.0, 8.0), (BREED / 2, LENGTE / 2, 0.0))
        oordeel = camera.beoordeel(None, m, B, H, BREED, LENGTE)
        self.assertEqual(oordeel['oordeel'], 'geen keuze')
        self.assertIsNotNone(oordeel['gemeten'])

    def test_zonder_perspectief_wordt_er_niets_beweerd(self):
        # Een zuivere schaling heeft geen perspectief: elke brandpuntsafstand past dan even
        # goed en hoogte en afstand schuiven evenredig mee. Wiskundig is dat een camera recht
        # boven het veld — maar het standpunt is er niet uit te halen, en dan hoort er geen
        # getal te komen. (Zonder deze controle gaf ze 9,74 m hoog met f=195 px: schijnzekerheid.)
        plat = [[0.05, 0.0, 0.0], [0.0, 0.05, 0.0], [0.0, 0.0, 1.0]]
        self.assertIsNone(camera.camerastandpunt(plat, B, H))
        self.assertEqual(camera.beoordeel('zijlijn-links-midden', plat, B, H)['oordeel'], 'onbekend')

    def test_een_verzonnen_homografie_krijgt_een_hoge_restfout(self):
        # Punten die niet bij één camerabeeld horen: de restfout laat dat zien in plaats van
        # een keurig ogend standpunt terug te geven.
        rommel = [[0.01, 0.004, -3.0], [0.002, 0.03, -8.0], [0.0004, 0.0011, 1.0]]
        gemeten = camera.camerastandpunt(rommel, B, H)
        if gemeten is not None:
            self.assertGreater(gemeten['restfout'], 0.001)


def _punten(pos, kijk, f=1400.0):
    nb = _camera(pos, kijk, f)
    uit = []
    for k in veld.kruispunten(DIEPTE, BREED, SPEEL):
        p = nb(k.x_m, k.y_m)
        if p and 0 <= p[0] <= B and 0 <= p[1] <= H:
            uit.append({'label': k.label, 'beeld_px': [p[0], p[1]], 'veld_m': [k.x_m, k.y_m]})
    return uit


class TestOnbetrouwbareGevallen(unittest.TestCase):
    """Een kalibratie kan perfect op alle punten passen en tóch bij een andere camera horen.

    Dat is geen theoretische zorg: bij een camera 8 m naast de zijlijn en 2 m hoog paste de fit
    op alle acht zichtbare punten met 0,0 px afwijking, en de ontbinding gaf een camera op
    (0,9 m; 0,2 m hoog) waar hij echt op (−8 m; 2 m hoog) stond. Zulke gevallen mogen nooit als
    zeker naar buiten komen — dat is precies wat de laat-één-punt-weg-proef verhindert.
    """

    def test_geen_enkel_wankel_geval_krijgt_een_zeker_oordeel(self):
        lastig = [
            ((-8.0, LENGTE / 2, 2.0), 900.0),    # laag en vlak naast de zijlijn
            ((-8.0, LENGTE / 2, 6.0), 1400.0),   # idem, langere lens
            ((-16.0, LENGTE / 2, 6.0), 2600.0),  # lange lens: amper vier punten in beeld
        ]
        for pos, f in lastig:
            with self.subTest(pos=pos, f=f):
                punten = _punten(pos, (BREED / 2, LENGTE / 2, 0.0), f)
                m = calibrate.fit_homografie(punten) if len(punten) >= 4 else None
                self.assertIsNotNone(m)
                oordeel = camera.beoordeel('zijlijn-links-midden', m, B, H, BREED, LENGTE, punten)
                gemeten = oordeel['gemeten']
                if gemeten is not None:
                    fout = max(abs(gemeten['x_m'] - pos[0]), abs(gemeten['y_m'] - pos[1]),
                               abs(gemeten['hoogte_m'] - pos[2]))
                    if fout > 1.0:
                        self.assertIn(oordeel['oordeel'], ('onzeker', 'onmogelijk', 'onbekend'))

    def test_een_betrouwbare_opstelling_verschuift_niet_als_je_een_punt_weglaat(self):
        for pos in ((BREED / 2, -14.0, 8.0), (-16.0, LENGTE / 2, 6.0)):
            with self.subTest(pos=pos):
                punten = _punten(pos, (BREED / 2, LENGTE / 2, 0.0))
                self.assertLess(camera.stabiliteit(punten, B, H, BREED, LENGTE), 0.1)

    def test_met_te_weinig_punten_valt_er_niets_te_toetsen(self):
        punten = _punten((BREED / 2, -14.0, 8.0), (BREED / 2, LENGTE / 2, 0.0))[:4]
        self.assertIsNone(camera.stabiliteit(punten, B, H, BREED, LENGTE))


class TestGebieden(unittest.TestCase):
    def test_elk_standpunt_kent_zijn_gebied(self):
        for naam in camera.POSITIES:
            (x0, x1), (y0, y1) = camera.verwacht_gebied(naam, BREED, LENGTE)
            self.assertLess(x0, x1)
            self.assertLess(y0, y1)

    def test_onbekend_standpunt_faalt_luid(self):
        with self.assertRaises(ValueError):
            camera.verwacht_gebied('op de maan')

    def test_valt_terug_op_de_vier_grondvormen_voor_de_aanbevolen_punten(self):
        self.assertEqual(camera.basispositie('achter-thuis-links'), 'achter-thuis')
        self.assertEqual(camera.basispositie('zijlijn-rechts-uit'), 'zijlijn')
        self.assertEqual(camera.basispositie('hoek-uit-links'), 'hoek')
        # En elk standpunt levert een lijst aanbevolen punten op.
        for naam in camera.POSITIES:
            self.assertGreaterEqual(len(veld.aanbevolen_labels(camera.basispositie(naam))), 8)


if __name__ == '__main__':
    unittest.main()
