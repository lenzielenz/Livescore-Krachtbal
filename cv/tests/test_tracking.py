"""Tests voor tracking.py en heatmap.py (fase 5) en groundtruth.py (fase 6)."""

from __future__ import annotations

import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import groundtruth  # noqa: E402
import heatmap  # noqa: E402
import tracking  # noqa: E402
import veld  # noqa: E402


class TestKoppelaar(unittest.TestCase):
    def test_twee_stilstaande_spelers_houden_hun_spoor(self):
        k = tracking.Koppelaar()
        stap1 = k.stap(0.0, [(2.0, 10.0), (12.0, 30.0)])
        stap2 = k.stap(0.5, [(2.1, 10.1), (11.9, 30.2)])
        # Zelfde volgorde van koppeling: dichtstbijzijnde buur wint, id's blijven stabiel.
        self.assertEqual({tid for tid, _, _ in stap1}, {tid for tid, _, _ in stap2})
        toewijzing = {(round(x), round(y)): tid for tid, x, y in stap2}
        self.assertNotEqual(toewijzing[(2, 10)], toewijzing[(12, 30)])

    def test_te_grote_sprong_start_een_nieuw_spoor(self):
        k = tracking.Koppelaar(max_snelheid=8.0)
        (tid1, _, _), = k.stap(0.0, [(2.0, 10.0)])
        # 20 m in 0,5 s = 40 m/s: dat kan dezelfde speler niet zijn.
        (tid2, _, _), = k.stap(0.5, [(2.0, 30.0)])
        self.assertNotEqual(tid1, tid2)

    def test_spoor_sluit_na_te_lang_gat(self):
        k = tracking.Koppelaar(max_gat=2.0)
        (tid1, _, _), = k.stap(0.0, [(2.0, 10.0)])
        (tid2, _, _), = k.stap(5.0, [(2.0, 10.0)])  # zelfde plek, maar 5 s later
        self.assertNotEqual(tid1, tid2)

    def test_kruisende_koppeling_is_een_op_een(self):
        k = tracking.Koppelaar()
        k.stap(0.0, [(5.0, 10.0), (5.6, 10.0)])
        uit = k.stap(0.5, [(5.3, 10.0)])
        # Eén waarneming voor twee sporen: precies één koppeling, geen dubbel.
        self.assertEqual(len(uit), 1)


class TestOpschonen(unittest.TestCase):
    def test_dedupliceer_voegt_dubbele_detecties_samen(self):
        # HOG en MOG2 zien dezelfde speler: twee punten op 0,3 m = één persoon.
        punten = [(5.0, 10.0), (5.2, 10.2), (9.0, 10.0)]
        self.assertEqual(tracking.dedupliceer(punten), [(5.0, 10.0), (9.0, 10.0)])

    def test_dedupliceer_laat_echte_buren_staan(self):
        punten = [(5.0, 10.0), (6.0, 10.0)]
        self.assertEqual(tracking.dedupliceer(punten), punten)

    def test_filter_korte_sporen_gooit_flikker_weg(self):
        rijen = (
            [{'t': t / 2, 'track': 1, 'x_m': 1.0, 'y_m': 1.0} for t in range(10)]  # 4,5 s: blijft
            + [{'t': 3.0, 'track': 2, 'x_m': 2.0, 'y_m': 2.0}]                     # één flits: weg
        )
        uit = tracking.filter_korte_sporen(rijen, 3.0)
        self.assertEqual({r['track'] for r in uit}, {1})
        # min_duur 0 = alles houden.
        self.assertEqual(tracking.filter_korte_sporen(rijen, 0), rijen)


class TestBemonsterDuur(unittest.TestCase):
    """Containers zonder framecount-metadata (webm, geremuxte streams) geven 0 terug."""

    def test_bekende_metadata_geeft_de_echte_duur(self):
        self.assertAlmostEqual(tracking.bemonster_duur(3000, 25.0), 120.0)

    def test_onbekende_framecount_of_fps_geeft_geen_bovengrens(self):
        # Zonder vangnet zou duur 0 zijn: de lus draaide één frame en de tracking bleef leeg.
        self.assertEqual(tracking.bemonster_duur(0, 25.0), float('inf'))
        self.assertEqual(tracking.bemonster_duur(3000, 0.0), float('inf'))
        self.assertEqual(tracking.bemonster_duur(-1, -1), float('inf'))


class TestDemoPosities(unittest.TestCase):
    def test_reproduceerbaar_en_binnen_het_veld(self):
        a = tracking.demo_posities(seed=7, duur_s=10.0, diepte_m=10.0)
        b = tracking.demo_posities(seed=7, duur_s=10.0, diepte_m=10.0)
        self.assertEqual(a, b)
        lengte = veld.totale_lengte_m(10.0)
        for rij in a:
            self.assertTrue(0.0 <= rij['x_m'] <= veld.BREEDTE_M)
            self.assertTrue(0.0 <= rij['y_m'] <= lengte)
        self.assertEqual(len({r['track'] for r in a}), 8)

    def test_dichter_bemonsteren_verdubbelt_de_metingen_zonder_snellere_spelers(self):
        traag = tracking.demo_posities(seed=7, duur_s=60.0, diepte_m=10.0, stap_s=0.5)
        dicht = tracking.demo_posities(seed=7, duur_s=60.0, diepte_m=10.0, stap_s=0.25)
        self.assertAlmostEqual(len(dicht) / len(traag), 2.0, delta=0.05)
        # De ruis schaalt mee met de stap: de spelers lopen niet plots twee keer zo snel.
        import fysiek  # noqa: PLC0415
        gem = lambda rijen: sum(  # noqa: E731
            v['afstand_m'] for v in fysiek.fysiek_per_spoor(rijen).values()
        ) / 8
        self.assertLess(abs(gem(dicht) - gem(traag)) / gem(traag), 0.35)

    def test_demo_bevat_echte_sprintjes(self):
        # Zonder versnellingen in de demo zou de sprintteller van fysiek.py nooit
        # zichtbaar zijn in de volledige lus.
        import fysiek  # noqa: PLC0415
        rijen = tracking.demo_posities(seed=7, duur_s=600.0, diepte_m=10.0, stap_s=0.25)
        per = fysiek.fysiek_per_spoor(rijen)
        self.assertGreater(sum(v['sprints'] for v in per.values()), 0)
        self.assertGreater(max(v['topsnelheid_m_s'] for v in per.values()), 4.0)

    def test_demo_blijft_binnen_een_opgemeten_veld(self):
        # Met opgemeten maten (12 × 40 m) mag geen enkel spoor buiten dát veld lopen —
        # anders gooit de heatmap ze weg en klopt de demo-lus niet met de echte keten.
        rijen = tracking.demo_posities(seed=7, duur_s=30.0, diepte_m=10.0, breedte_m=12.0, speelveld_m=20.0)
        for rij in rijen:
            self.assertTrue(0.0 <= rij['x_m'] <= 12.0)
            self.assertTrue(0.0 <= rij['y_m'] <= 40.0)


class TestHeatmapRaster(unittest.TestCase):
    def test_binning_en_normalisatie(self):
        posities = [
            {'track': 1, 'x_m': 0.1, 'y_m': 0.1},
            {'track': 1, 'x_m': 0.2, 'y_m': 0.2},  # zelfde cel → piek 2
            {'track': 2, 'x_m': 7.0, 'y_m': 23.0},
        ]
        raster = heatmap.bouw_raster(posities, diepte_m=10.0, cel_m=0.5)
        self.assertEqual(raster['piek'], 2)
        self.assertEqual(raster['raster'][0][0], 1.0)  # genormaliseerd op de piek
        self.assertEqual(raster['posities'], 3)

    def test_rand_van_het_veld_valt_in_de_laatste_cel(self):
        raster = heatmap.bouw_raster(
            [{'track': 1, 'x_m': veld.BREEDTE_M, 'y_m': veld.totale_lengte_m(10.0)}],
            diepte_m=10.0, cel_m=0.5,
        )
        self.assertEqual(raster['posities'], 1)
        self.assertEqual(raster['raster'][-1][-1], 1.0)

    def test_buiten_het_veld_telt_niet_en_trackfilter_werkt(self):
        posities = [
            {'track': 1, 'x_m': -1.0, 'y_m': 5.0},
            {'track': 2, 'x_m': 7.0, 'y_m': 23.0},
        ]
        raster = heatmap.bouw_raster(posities, diepte_m=10.0, track=2)
        self.assertEqual(raster['posities'], 1)
        raster_leeg = heatmap.bouw_raster(posities, diepte_m=10.0, track=1)
        self.assertEqual(raster_leeg['posities'], 0)
        self.assertEqual(raster_leeg['piek'], 0)


class TestGroundtruthContract(unittest.TestCase):
    """Zelfde aanpak als test_sync.py: de responsvorm gespiegeld aan de int-test."""

    def _respons(self) -> dict:
        return {
            'match': {'id': 42},
            'reviews': [
                {
                    'id': 1, 'video_time_s': 42.0, 'event_type': 'worp', 'verdict': 'bevestigd',
                    'worp_type': 'rug', 'worp_type_origineel': 'nek', 'side': 'home', 'rugnummer': 7,
                    'in_doelgebied': False, 'x_m': None, 'y_m': None, 'afstand_m': None,
                    'confidence': 0.7, 'provenance': {'model': 'demo-ruis', 'model_version': '0.1.0'},
                },
                {
                    'id': 2, 'video_time_s': 67.0, 'event_type': 'worp', 'verdict': 'afgewezen',
                    'worp_type': 'nek', 'worp_type_origineel': 'nek', 'side': None, 'rugnummer': None,
                    'in_doelgebied': False, 'x_m': None, 'y_m': None, 'afstand_m': None,
                    'confidence': 0.4, 'provenance': {'model': 'demo-ruis', 'model_version': '0.1.0'},
                },
            ],
            'rapport': {'totaal': 2, 'bevestigd': 1, 'afgewezen': 1, 'worp_type_gecorrigeerd': 1},
        }

    def _draai(self, tmp: Path, respons: dict) -> tuple[list[dict], str]:
        uitpad = tmp / 'gt.jsonl'
        origineel = groundtruth.haal_reviews
        groundtruth.haal_reviews = lambda *a, **k: respons
        try:
            buf = io.StringIO()
            with redirect_stdout(buf):
                groundtruth.main(['--match', '42', '--uit', str(uitpad), '--token', 'x'])
        finally:
            groundtruth.haal_reviews = origineel
        regels = [json.loads(r) for r in uitpad.read_text(encoding='utf-8').splitlines()]
        return regels, buf.getvalue()

    def test_schrijft_reviews_en_rapporteert(self):
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            regels, uitvoer = self._draai(Path(d), self._respons())
        self.assertEqual(len(regels), 2)
        self.assertEqual(regels[0]['worp_type_origineel'], 'nek')
        self.assertEqual(regels[0]['worp_type'], 'rug')  # de menselijke correctie
        self.assertIn('1 bevestigd · 1 afgewezen', uitvoer)
        self.assertIn('1 worptype-correcties', uitvoer)

    def test_contractbreuk_faalt_hard(self):
        respons = self._respons()
        respons['reviews'] = []  # rapport zegt 2, wij tellen 0
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(SystemExit) as ctx:
                self._draai(Path(d), respons)
        self.assertNotEqual(ctx.exception.code, 0)


if __name__ == '__main__':
    unittest.main()
