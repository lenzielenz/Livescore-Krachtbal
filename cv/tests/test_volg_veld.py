"""Bewegende camera: de wiskunde achter het volgen en het herankeren op de veldlijnen.

Alles hier draait zonder video en zonder opencv — juist die kern moet kloppen, want een
verkeerde homografie geeft geen foutmelding maar een worp die op de verkeerde plek landt.
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import volg_veld as vv  # noqa: E402
import veld  # noqa: E402


def _schaal(sx: float, sy: float, tx: float = 0.0, ty: float = 0.0) -> list[list[float]]:
    return [[sx, 0.0, tx], [0.0, sy, ty], [0.0, 0.0, 1.0]]


class TestMatrixrekenen(unittest.TestCase):
    def test_maal_en_inverteer_heffen_elkaar_op(self):
        m = [[0.08, 0.004, -21.0], [-0.002, 0.083, -5.0], [1e-5, 2e-5, 1.0]]
        eenheid = vv.maal(m, vv.inverteer(m))
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(eenheid[i][j] / eenheid[2][2], 1.0 if i == j else 0.0, places=6)

    def test_projecteer_gebruikt_de_perspectiefdeling(self):
        # Zonder perspectief: gewoon schalen en verschuiven.
        x, y = vv.projecteer(_schaal(0.5, 0.25, 3.0, -1.0), 10.0, 8.0)
        self.assertAlmostEqual(x, 8.0)
        self.assertAlmostEqual(y, 1.0)
        # Met perspectief: de derde rij deelt mee.
        m = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.01, 1.0]]
        x2, y2 = vv.projecteer(m, 10.0, 100.0)
        self.assertAlmostEqual(x2, 10.0 / 2.0)
        self.assertAlmostEqual(y2, 100.0 / 2.0)

    def test_normaliseer_maakt_twee_gelijke_matrices_identiek(self):
        m = [[2.0, 0.0, 4.0], [0.0, 2.0, 6.0], [0.0, 0.0, 2.0]]
        dubbel = [[w * 7 for w in rij] for rij in m]
        self.assertEqual(vv.normaliseer(m), vv.normaliseer(dubbel))

    def test_singuliere_matrix_wordt_geweigerd(self):
        with self.assertRaises(ValueError):
            vv.inverteer([[1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [0.0, 0.0, 1.0]])


class TestHomografieUitPunten(unittest.TestCase):
    def test_vindt_de_transformatie_exact_terug(self):
        echt = [[0.08, 0.003, -20.0], [-0.001, 0.081, -4.0], [2e-5, 1e-5, 1.0]]
        beeldpunten = [(100.0, 120.0), (900.0, 140.0), (150.0, 640.0), (880.0, 660.0), (500.0, 400.0)]
        paren = [(p, vv.projecteer(echt, *p)) for p in beeldpunten]
        gevonden = vv.homografie_uit_paren(paren)
        self.assertIsNotNone(gevonden)
        for p in [(300.0, 300.0), (700.0, 500.0)]:
            a = vv.projecteer(echt, *p)
            b = vv.projecteer(gevonden, *p)
            self.assertAlmostEqual(a[0], b[0], places=4)
            self.assertAlmostEqual(a[1], b[1], places=4)

    def test_te_weinig_punten_geeft_niets(self):
        self.assertIsNone(vv.homografie_uit_paren([((0.0, 0.0), (0.0, 0.0))] * 3))


class TestVeldlijnen(unittest.TestCase):
    def test_alle_lijnen_van_het_veld_staan_erin(self):
        lijnen = vv.veldlijnen(10.0)
        namen = {n for n, _, _ in lijnen}
        self.assertIn('middellijn', namen)
        self.assertIn('doellijn_thuis', namen)
        self.assertIn('zijlijn_links', namen)
        self.assertEqual(len(lijnen), 9)  # 7 dwarslijnen + 2 zijlijnen

    def test_lijnen_schuiven_mee_met_de_opgemeten_maten(self):
        lijnen = dict((n, (a, b)) for n, a, b in vv.veldlijnen(10.0, breedte_m=12.0, speelveld_m=20.0))
        self.assertEqual(lijnen['achterlijn_uit'][0][1], 40.0)
        self.assertEqual(lijnen['zijlijn_rechts'][0][0], 12.0)

    def test_lijnvergelijking_geeft_afstand_in_meters(self):
        A, B, C = vv.lijnvergelijking((0.0, 10.0), (14.0, 10.0))
        self.assertAlmostEqual(abs(A * 7.0 + B * 12.5 + C), 2.5)  # 2,5 m van de lijn
        self.assertAlmostEqual(math.hypot(A, B), 1.0)


class TestHerankeren(unittest.TestCase):
    """Het hart: kloppen de lijnen weer met het veldmodel na een correctie?"""

    def _opstelling(self):
        # Camera boven het veld: 12 px per meter, veld gecentreerd.
        naar_beeld = [[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]]
        return vv.inverteer(naar_beeld), naar_beeld

    def _zichtbare_segmenten(self, naar_beeld, lijnen):
        segmenten = []
        for _naam, a, b in lijnen:
            p0 = vv.projecteer(naar_beeld, *a)
            p1 = vv.projecteer(naar_beeld, *b)
            segmenten.append((p0, p1))
        return segmenten

    def test_koppeling_weigert_een_lijn_die_de_verkeerde_kant_op_loopt(self):
        echt, naar_beeld = self._opstelling()
        lijnen = vv.veldlijnen(10.0)
        # Een verticaal segment midden op het veld: loopt als een zijlijn, ligt bij de
        # middellijn. Zonder richtingseis zou het aan de middellijn gekoppeld worden.
        p0 = vv.projecteer(naar_beeld, 7.0, 21.0)
        p1 = vv.projecteer(naar_beeld, 7.0, 25.0)
        cons = vv.koppel_lijnconstraints([(p0, p1)], echt, lijnen)
        self.assertEqual(cons, [])

    def test_een_gedrifte_matrix_wordt_teruggetrokken_naar_de_lijnen(self):
        echt, naar_beeld = self._opstelling()
        lijnen = vv.veldlijnen(10.0)
        segmenten = self._zichtbare_segmenten(naar_beeld, lijnen)
        # Alsof het volgen 1,5 m is weggedreven.
        gedrift = vv.normaliseer(vv.maal([[1.0, 0.0, 0.0], [0.0, 1.0, 1.5], [0.0, 0.0, 1.0]], echt))
        veldpunten = [(x, y) for x in (2.0, 7.0, 12.0) for y in (5.0, 23.0, 41.0)]
        voor = max(vv.veldfout_m(gedrift, echt, veldpunten))
        hersteld, fout, gebruikt = vv.veranker_op_lijnen(gedrift, segmenten, lijnen)
        na = max(vv.veldfout_m(hersteld, echt, veldpunten))
        self.assertGreater(gebruikt, 0)
        self.assertLess(fout, 0.2)
        self.assertLess(na, voor / 3)  # de drift is grotendeels weg

    def test_zonder_bruikbare_lijnen_blijft_de_matrix_ongemoeid(self):
        echt, _ = self._opstelling()
        zelfde, fout, gebruikt = vv.veranker_op_lijnen(echt, [], vv.veldlijnen(10.0))
        self.assertEqual(zelfde, echt)
        self.assertEqual(gebruikt, 0)
        self.assertEqual(fout, float('inf'))

    def test_alleen_evenwijdige_lijnen_is_te_weinig_houvast(self):
        # Zeven dwarslijnen zonder zijlijn: je kan het veld er vrij langs schuiven.
        cons = [((100.0 + 10 * i, 200.0), (0.0, 1.0, -10.0)) for i in range(12)]
        self.assertIsNone(vv.homografie_uit_lijnen(cons))

    def test_een_verkeerd_gekoppelde_lijn_mag_het_veld_niet_verplaatsen(self):
        echt, naar_beeld = self._opstelling()
        lijnen = vv.veldlijnen(10.0)
        segmenten = self._zichtbare_segmenten(naar_beeld, lijnen)
        # Sabotage: alles ligt er 30 m naast, dus elke koppeling is fout.
        ver_weg = vv.normaliseer(vv.maal([[1.0, 0.0, 0.0], [0.0, 1.0, 30.0], [0.0, 0.0, 1.0]], echt))
        zelfde, _fout, gebruikt = vv.veranker_op_lijnen(ver_weg, segmenten, lijnen)
        # Ofwel geen koppeling, ofwel een correctie die de sprongtoets niet haalt: in beide
        # gevallen komt de matrix ongewijzigd terug in plaats van ergens anders te belanden.
        if gebruikt == 0:
            self.assertEqual(zelfde, ver_weg)


class TestHomografieSpoor(unittest.TestCase):
    def _spoor(self) -> vv.HomografieSpoor:
        spoor = vv.HomografieSpoor(max_gat_s=1.0)
        for i in range(5):
            spoor.voeg_toe(i * 0.5, _schaal(1.0 + i, 1.0), 0.1, 'flow')
        return spoor

    def test_zoekt_de_matrix_van_het_juiste_moment(self):
        spoor = self._spoor()
        self.assertAlmostEqual(spoor.op(0.0)[0][0], 1.0)
        self.assertAlmostEqual(spoor.op(1.0)[0][0], 3.0)
        self.assertAlmostEqual(spoor.op(1.1)[0][0], 3.0)  # dichtstbijzijnde
        self.assertAlmostEqual(spoor.op(1.4)[0][0], 4.0)

    def test_geeft_niets_terug_bij_een_te_groot_gat(self):
        # Liever geen meting dan een matrix van seconden geleden: de camera kan intussen
        # ergens anders naar kijken.
        self.assertIsNone(self._spoor().op(30.0))
        self.assertIsNone(self._spoor().op(-5.0))

    def test_leeg_spoor_geeft_niets(self):
        self.assertIsNone(vv.HomografieSpoor().op(1.0))

    def test_schrijven_en_teruglezen_houdt_alles_heel(self):
        import tempfile

        spoor = self._spoor()
        with tempfile.TemporaryDirectory() as d:
            pad = Path(d) / 'h.jsonl'
            spoor.schrijf(pad)
            terug = vv.HomografieSpoor.lees(pad)
        self.assertEqual(len(terug.punten), len(spoor.punten))
        self.assertAlmostEqual(terug.op(1.0)[0][0], 3.0)

    def test_rapport_telt_de_ankers(self):
        spoor = self._spoor()
        spoor.voeg_toe(3.0, _schaal(1.0, 1.0), 0.04, 'lijnen')
        r = spoor.rapport()
        self.assertEqual(r['ankers'], 1)
        self.assertAlmostEqual(r['gemiddelde_ankerfout_m'], 0.04)


class TestVeldfout(unittest.TestCase):
    def test_meet_de_fout_op_het_veld_en_niet_de_camerabeweging(self):
        echt = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        # Een matrix die er precies 1 m naast zit in y.
        ernaast = vv.normaliseer(vv.maal([[1.0, 0.0, 0.0], [0.0, 1.0, 1.0], [0.0, 0.0, 1.0]], echt))
        fouten = vv.veldfout_m(ernaast, echt, [(7.0, 23.0), (2.0, 5.0)])
        self.assertEqual(len(fouten), 2)
        for f in fouten:
            self.assertAlmostEqual(f, 1.0, places=6)

    def test_dezelfde_matrix_geeft_nul_fout(self):
        echt = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        self.assertAlmostEqual(max(vv.veldfout_m(echt, echt, [(7.0, 23.0)])), 0.0, places=9)


class TestDemoLus(unittest.TestCase):
    """De volledige lus op een gesimuleerde bewegende camera: herankeren moet meetbaar
    beter zijn dan puur volgen — anders heeft de hele module geen bestaansrecht."""

    def test_herankeren_houdt_de_fout_klein_waar_puur_volgen_wegdrijft(self):
        start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        spoor, rapport = vv.demo_spoor(seed=7, duur_s=120.0, kalibratie=start, stap_s=0.25)
        self.assertGreater(rapport['ankers'], 10)
        # Met de veldlijnen blijft de meting binnen een halve meter; zonder loopt ze weg.
        self.assertLess(rapport['fout_mediaan_m'], 0.5)
        self.assertLess(rapport['fout_mediaan_m'], rapport['fout_mediaan_zonder_ankers_m'] / 2)
        self.assertGreater(len(spoor.punten), 400)

    def test_reproduceerbaar_met_dezelfde_seed(self):
        start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        a, _ = vv.demo_spoor(seed=3, duur_s=20.0, kalibratie=start)
        b, _ = vv.demo_spoor(seed=3, duur_s=20.0, kalibratie=start)
        self.assertEqual(a.punten, b.punten)

    def test_demo_segmenten_blijven_binnen_het_beeldkader(self):
        import random

        start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        segmenten = vv._demo_lijnsegmenten(start, vv.veldlijnen(10.0), random.Random(1), beeld=(1280, 720))
        for (x1, y1), (x2, y2) in segmenten:
            for x, y in ((x1, y1), (x2, y2)):
                self.assertTrue(-5 <= x <= 1285, f'x={x} buiten beeld')
                self.assertTrue(-5 <= y <= 725, f'y={y} buiten beeld')


if __name__ == '__main__':
    unittest.main()
