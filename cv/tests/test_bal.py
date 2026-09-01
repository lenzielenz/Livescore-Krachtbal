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
        t, x, _y, gezien = bal.landingsmoment(model, punten)
        self.assertAlmostEqual(t, 1.6, places=2)
        self.assertAlmostEqual(x, 200 + 180 * 1.6, delta=2.0)
        self.assertTrue(gezien)   # de bal is tot op de grond gevolgd: niets doorgetrokken

    def test_loslaten_ligt_op_het_begin(self):
        model, punten = self._model_en_punten(t0=3.0, duur=1.2)
        t, x, _y = bal.loslaatmoment(model, punten)
        self.assertAlmostEqual(t, 3.0, places=2)
        self.assertAlmostEqual(x, 200 + 180 * 3.0, delta=2.0)

    def test_landing_komt_nooit_vóór_het_hoogste_punt(self):
        # Verdwijnt de bal al tijdens het stijgen uit beeld, dan is het laatste gemeten punt
        # niet de landing: de baan wordt over de top heen doorgetrokken tot het symmetrische
        # grondpunt — en dat is dan uiteraard niet gezien.
        punten = baan(duur=0.4)                       # top ligt op t ≈ 0,68
        model = bal.bouw_model(punten)
        t, _x, _y, gezien = bal.landingsmoment(model, punten)
        self.assertGreaterEqual(t, 0.6)
        self.assertFalse(gezien)

    def test_de_baan_vult_een_ontbrekend_einde_op(self):
        # De laatste vier metingen ontbreken (bal achter een speler). Het model komt toch tot
        # een landing in de buurt van de echte, in plaats van te stoppen waar de blob wegviel.
        volledig = baan()
        gedeeltelijk = volledig[:-4]
        model = bal.bouw_model(gedeeltelijk)
        t, x, _y, _gezien = bal.landingsmoment(model, gedeeltelijk)
        echt_x = 200 + 180 * volledig[-1][0]
        self.assertLess(abs(x - echt_x), 120.0)   # richting klopt; het gat kost precisie
        self.assertGreater(t, 1.3)


class TestLandingDoorgetrokken(unittest.TestCase):
    """Regressie: het landingsmoment stopte op de laatste blob, zodat bij occlusie een
    lúchtpunt als grondpunt de homografie inging (0,4 s occlusie = 109 px te hoog, en na
    projectie meters te ver van de camera)."""

    def _geknipt(self):
        # De testbaan met de laatste 0,4 s weggeknipt: de bal verdwijnt vóór de grond
        # achter een speler. De volledige baan landt op t=1,6 met y ≈ 470.
        return [p for p in baan() if p[0] <= 1.2 + 1e-9]

    def test_occlusie_voor_de_grond_wordt_doorgetrokken(self):
        geknipt = self._geknipt()
        model = bal.bouw_model(geknipt)
        t, _x, y, gezien = bal.landingsmoment(model, geknipt)
        # Zonder doortrekken bleef dit op t=1,20 met y ≈ 362 hangen — in de lucht. Per
        # symmetrie daalt de baan door tot hij weer op loslaathoogte hangt (y ≈ 400).
        self.assertFalse(gezien)
        self.assertAlmostEqual(t, 1.368, places=2)
        self.assertAlmostEqual(y, 400.0, delta=2.0)

    def test_bekende_grondlijn_geeft_het_echte_grondpunt(self):
        # Kent de aanroeper de beeld-y van het veldvlak, dan hoort de landing op het
        # snijpunt van de dalende tak met die grondlijn te liggen: het échte grondpunt.
        geknipt = self._geknipt()
        grond_y = 400 - 260 * 1.6 + 190 * 1.6 ** 2    # 470,4: waar de volledige baan landt
        model = bal.bouw_model(geknipt)
        t, x, y, gezien = bal.landingsmoment(model, geknipt, grond_y=grond_y)
        self.assertFalse(gezien)
        self.assertAlmostEqual(t, 1.6, places=2)
        self.assertAlmostEqual(x, 200 + 180 * 1.6, delta=2.0)
        self.assertAlmostEqual(y, grond_y, delta=2.0)

    def test_bal_gezien_onder_de_grondlijn_telt_als_gezien(self):
        # Ligt de opgegeven grondlijn te hoog (de bal is nog verder gevolgd), dan wint het
        # laatste meetpunt: er valt niets door te trekken.
        punten = baan()
        model = bal.bouw_model(punten)
        t, _x, _y, gezien = bal.landingsmoment(model, punten, grond_y=430.0)
        self.assertAlmostEqual(t, 1.6, places=2)
        self.assertTrue(gezien)


def waarnemingen_met_verschuiving(verschuiving, sprong_op=None):
    """De testbaan gezien door een verschuivende camera, als frames zoals de videolaag ze
    aanlevert: per frame (t, blobs in framepixels, camerastap). ``verschuiving`` geeft per
    tijd de (dx, dy) van de camera; op ``sprong_op`` is de stap onbekend (None), zoals
    wanneer de flow-schatting mislukt."""
    uit = []
    vorige = None
    for t, x, y in baan():
        dx, dy = verschuiving(t)
        stap = None
        if vorige is not None and (sprong_op is None or abs(t - sprong_op) > 1e-9):
            vdx, vdy = vorige
            # Het vorige frame op dit frame leggen = meeschuiven met de camera.
            stap = [[1.0, 0.0, vdx - dx], [0.0, 1.0, vdy - dy], [0.0, 0.0, 1.0]]
        uit.append((t, [(x - dx, y - dy)], stap))
        vorige = (dx, dy)
    return uit


class TestRegistratie(unittest.TestCase):
    """Regressie: de kandidaten stonden elk in de pixels van hun eigen frame en werden toch
    als één stelsel gefit — een pan verlegde de landing (t 1,16 i.p.v. 1,60), een tilt
    drukte de kromming weg (ey 82 i.p.v. 190)."""

    def test_pan_middenin_verschuift_de_landing_niet(self):
        # Een pan van 300 px/s die op t=1,1 start. In ruwe framepixels leek de baan daardoor
        # al rond t ≈ 1,16 te "landen", 116 px boven de grond; geregistreerd hoort t=1,6.
        waarnemingen = waarnemingen_met_verschuiving(lambda t: (300.0 * max(0.0, t - 1.1), 0.0))
        stukken = bal.registreer_ketenend(waarnemingen)
        self.assertEqual(len(stukken), 1)
        beste = bal.beste_baan_uit_stukken(stukken)
        self.assertIsNotNone(beste)
        model, punten, registratie = beste
        self.assertAlmostEqual(model['ey'], 190.0, delta=10.0)
        t, xr, yr, gezien = bal.landingsmoment(model, punten)
        self.assertAlmostEqual(t, 1.6, places=2)
        self.assertTrue(gezien)
        # Terug naar de pixels van het frame op t=1,6 (waar de grondhomografie geldt): de
        # opgebouwde pan van 150 px zit er dan weer in.
        x_frame, y_frame = bal.naar_framepixels(registratie, t, xr, yr)
        self.assertAlmostEqual(x_frame, (200 + 180 * 1.6) - 300 * 0.5, delta=2.0)
        self.assertAlmostEqual(y_frame, 400 - 260 * 1.6 + 190 * 1.6 ** 2, delta=2.0)

    def test_tilt_drukt_de_kromming_niet_meer_weg(self):
        # Een camera die vanaf t=0,6 mee omlaag kantelt haalde de helft van de kromming uit
        # de fit (ey ≈ 82); geregistreerd blijft de echte kromming staan.
        waarnemingen = waarnemingen_met_verschuiving(lambda t: (0.0, 150.0 * max(0.0, t - 0.6) ** 2))
        beste = bal.beste_baan_uit_stukken(bal.registreer_ketenend(waarnemingen))
        self.assertIsNotNone(beste)
        self.assertAlmostEqual(beste[0]['ey'], 190.0, delta=10.0)

    def test_vlakkere_baan_overleeft_de_tilt(self):
        # Bij een vlakkere echte baan (ey=90) duwde diezelfde tilt de gefitte kromming onder
        # de valt_echt-drempel: de hele worp verdween. Geregistreerd blijft er een meting.
        uit = []
        vorige = None
        for t, x, y in baan(ey=90.0):
            dy = 150.0 * max(0.0, t - 0.6) ** 2
            stap = None
            if vorige is not None:
                stap = [[1.0, 0.0, 0.0], [0.0, 1.0, vorige - dy], [0.0, 0.0, 1.0]]
            uit.append((t, [(x, y - dy)], stap))
            vorige = dy
        beste = bal.beste_baan_uit_stukken(bal.registreer_ketenend(uit))
        self.assertIsNotNone(beste)
        self.assertAlmostEqual(beste[0]['ey'], 90.0, delta=10.0)

    def test_camerasprong_breekt_in_stukken_en_mengt_niet(self):
        # Op t=0,8 verspringt het beeld en is de camerastap onbekend: de pixels vóór en ná
        # staan in verschillende stelsels. De fit mag die nooit in één baan mengen.
        waarnemingen = waarnemingen_met_verschuiving(
            lambda t: (400.0, -250.0) if t >= 0.8 else (0.0, 0.0), sprong_op=0.8)
        stukken = bal.registreer_ketenend(waarnemingen)
        self.assertEqual(len(stukken), 2)
        beste = bal.beste_baan_uit_stukken(stukken)
        self.assertIsNotNone(beste)
        _model, punten, _registratie = beste
        tijden = [p[0] for p in punten]
        self.assertTrue(all(t < 0.8 for t in tijden) or all(t >= 0.8 for t in tijden))

    def test_veldspoor_overbrugt_de_camerasprong(self):
        # Met het volg_veld-spoor (--homografie in de keten) kennen beide kanten van de
        # sprong hun eigen veldstand: alles komt in één stelsel en de hele baan telt mee.
        waarnemingen = waarnemingen_met_verschuiving(
            lambda t: (400.0, -250.0) if t >= 0.8 else (0.0, 0.0), sprong_op=0.8)
        s = 0.05  # zomaar een schaal beeld→veld; de registratie moet er ongevoelig voor zijn

        def matrix_op(t):
            if t >= 0.8:
                return [[s, 0.0, 400.0 * s], [0.0, s, -250.0 * s], [0.0, 0.0, 1.0]]
            return [[s, 0.0, 0.0], [0.0, s, 0.0], [0.0, 0.0, 1.0]]

        stukken = bal.registreer_met_veldspoor(waarnemingen, matrix_op)
        self.assertEqual(len(stukken), 1)
        beste = bal.beste_baan_uit_stukken(stukken)
        self.assertIsNotNone(beste)
        model, punten, registratie = beste
        self.assertGreaterEqual(len(punten), 35)      # beide kanten van de sprong tellen mee
        t, xr, yr, gezien = bal.landingsmoment(model, punten)
        self.assertAlmostEqual(t, 1.6, places=2)
        self.assertTrue(gezien)
        # Terugprojectie naar het frame van de landing: mét de sprong er weer in.
        x_frame, y_frame = bal.naar_framepixels(registratie, t, xr, yr)
        self.assertAlmostEqual(x_frame, (200 + 180 * 1.6) - 400.0, delta=2.0)
        self.assertAlmostEqual(y_frame, (400 - 260 * 1.6 + 190 * 1.6 ** 2) + 250.0, delta=2.0)


if __name__ == '__main__':
    unittest.main()
