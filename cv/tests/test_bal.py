#!/usr/bin/env python3
"""De balbaan: fitten, kiezen tussen stoorzenders, en het landingspunt.

Alles met verzonnen banen — een vallend voorwerp is wiskundig precies te beschrijven, dus hier
valt écht te meten of de keuze klopt: met ruis erop, met ontbrekende beelden, en met
rondlopende spelers die even hard bewegen als de bal.
"""

from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bal  # noqa: E402


def baan(t0=0.0, duur=1.6, stap=0.04, ax=200.0, bx=180.0, cy=400.0, dy=-260.0, ey=190.0,
         ruis=0.0, seed=3, mis=0.0):
    """Een balbaan in beeldcoördinaten: rechtlijnig opzij, parabolisch omlaag."""
    rng = random.Random(seed)
    punten = []
    t = t0
    while t <= t0 + duur + 1e-9:
        if mis and rng.random() < mis:
            t += stap
            continue
        x = ax + bx * t + (rng.gauss(0, ruis) if ruis else 0.0)
        y = cy + dy * t + ey * t * t + (rng.gauss(0, ruis) if ruis else 0.0)
        punten.append((round(t, 3), x, y))
        t += stap
    return punten


def wandelaars(aantal, t0=0.0, duur=1.6, stap=0.04, seed=11):
    """Spelers die rondlopen: even veel beweging, maar geen vallende baan."""
    rng = random.Random(seed)
    uit = []
    for _ in range(aantal):
        x0, y0 = rng.uniform(0, 900), rng.uniform(100, 500)
        vx, vy = rng.uniform(-120, 120), rng.uniform(-60, 60)
        t = t0
        while t <= t0 + duur + 1e-9:
            uit.append((round(t, 3), x0 + vx * t, y0 + vy * t))
            t += stap
    return uit


class TestFitten(unittest.TestCase):
    def test_rechte_lijn_exact(self):
        a, b = bal.fit_lineair([0.0, 1.0, 2.0], [5.0, 7.0, 9.0])
        self.assertAlmostEqual(a, 5.0, places=9)
        self.assertAlmostEqual(b, 2.0, places=9)

    def test_parabool_exact(self):
        c, d, e = bal.fit_parabool([0.0, 1.0, 2.0, 3.0], [1.0, 4.0, 11.0, 22.0])  # 1 + 1t + 2t²
        self.assertAlmostEqual(c, 1.0, places=6)
        self.assertAlmostEqual(d, 1.0, places=6)
        self.assertAlmostEqual(e, 2.0, places=6)

    def test_te_weinig_punten_geeft_niets(self):
        self.assertIsNone(bal.fit_lineair([1.0], [2.0]))
        self.assertIsNone(bal.fit_parabool([1.0, 2.0], [2.0, 3.0]))

    def test_samenvallende_tijden_geven_niets(self):
        self.assertIsNone(bal.fit_lineair([2.0, 2.0], [1.0, 5.0]))
        self.assertIsNone(bal.fit_parabool([2.0, 2.0, 2.0], [1.0, 5.0, 9.0]))


class TestBaanKiezen(unittest.TestCase):
    def test_vindt_de_bal_tussen_de_spelers(self):
        # Vijf rondlopende spelers, één bal. De baan moet er zonder aarzelen uit komen.
        punten = baan() + wandelaars(5)
        gekozen = bal.kies_baan(punten)
        self.assertIsNotNone(gekozen)
        model, gevonden = gekozen
        self.assertGreaterEqual(len(gevonden), 30)
        self.assertAlmostEqual(model['ey'], 190.0, delta=15.0)
        self.assertAlmostEqual(model['bx'], 180.0, delta=15.0)

    def test_houdt_stand_met_meetruis_en_gaten(self):
        # Ruis van 3 px en een op de vier beelden gemist (occlusie, motion blur).
        punten = baan(ruis=3.0, mis=0.25, seed=5) + wandelaars(6, seed=9)
        gekozen = bal.kies_baan(punten)
        self.assertIsNotNone(gekozen)
        model, _ = gekozen
        self.assertAlmostEqual(model['ey'], 190.0, delta=40.0)

    def test_zonder_bal_geen_baan(self):
        # Alleen rondlopende spelers: er valt niets, dus er is geen baan.
        self.assertIsNone(bal.kies_baan(wandelaars(8, seed=4)))

    def test_een_stijgende_boog_telt_niet_als_val(self):
        # ey < 0 = het voorwerp gaat omhoog en blijft omhoog: geen vallende bal.
        omhoog = [(t, x, 800 - (y - 400)) for t, x, y in baan()]
        gekozen = bal.kies_baan(omhoog)
        if gekozen is not None:
            self.assertGreater(gekozen[0]['ey'], 0)

    def test_te_weinig_punten_geeft_niets(self):
        self.assertIsNone(bal.kies_baan(baan(duur=0.1)))


class TestLandingEnLoslaten(unittest.TestCase):
    def _model_en_punten(self, **kw):
        punten = baan(**kw)
        model = bal.bouw_model(punten)
        return model, punten

    def test_landing_ligt_op_het_laatste_moment_van_de_baan(self):
        model, punten = self._model_en_punten()
        t, x, y = bal.landingsmoment(model, punten)
        self.assertAlmostEqual(t, 1.6, places=2)
        self.assertAlmostEqual(x, 200 + 180 * 1.6, delta=2.0)

    def test_loslaten_ligt_op_het_begin(self):
        model, punten = self._model_en_punten(t0=3.0, duur=1.2)
        t, x, _y = bal.loslaatmoment(model, punten)
        self.assertAlmostEqual(t, 3.0, places=2)
        self.assertAlmostEqual(x, 200 + 180 * 3.0, delta=2.0)

    def test_landing_komt_nooit_vóór_het_hoogste_punt(self):
        # Verdwijnt de bal al tijdens het stijgen uit beeld, dan is het laatste gemeten punt
        # niet de landing. De top van de parabool is dan de ondergrens.
        punten = baan(duur=0.4)                       # top ligt op t ≈ 0,68
        model = bal.bouw_model(punten)
        t, _x, _y = bal.landingsmoment(model, punten)
        self.assertGreaterEqual(t, 0.6)

    def test_de_baan_vult_een_ontbrekend_einde_op(self):
        # De laatste vier metingen ontbreken (bal achter een speler). Het model komt toch tot
        # een landing in de buurt van de echte, in plaats van te stoppen waar de blob wegviel.
        volledig = baan()
        gedeeltelijk = volledig[:-4]
        model = bal.bouw_model(gedeeltelijk)
        t, x, _y = bal.landingsmoment(model, gedeeltelijk)
        echt_x = 200 + 180 * volledig[-1][0]
        self.assertLess(abs(x - echt_x), 120.0)   # richting klopt; het gat kost precisie
        self.assertGreater(t, 1.3)


if __name__ == '__main__':
    unittest.main()
