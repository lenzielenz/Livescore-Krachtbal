"""Tests voor landing.py (fase 2): zone/score-afleiding en de demo-verrijking."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import landing  # noqa: E402
import veld  # noqa: E402


def _det(t: float, worp_type: str | None = 'nekworp') -> dict:
    return {
        'match_id': 1, 'video_time_s': t, 'frame': None, 'event_type': 'worp',
        'worp_type': worp_type, 'zone': None, 'afstand_m': None, 'speler': None,
        'score_delta': 0, 'confidence': 0.7, 'provenance': {'model': 'test', 'model_version': '0'},
    }


def _label(t: float, x_m: float, y_m: float) -> dict:
    return {
        'video_time_s': t, 'event_type': 'worp', 'worp_type': 'nekworp',
        'zone': {'in_doelgebied': False, 'x_m': x_m, 'y_m': y_m}, 'speler': None,
    }


class TestZoneEnScore(unittest.TestCase):
    def test_doelgebied_en_dubbele_rugworp(self):
        # y=2 m ligt diep in het doelgebied (diepte 10): nekworp +1, rugworp +2 (§6.6).
        zone, score = landing.zone_en_score(7.0, 2.0, 'nekworp', 10.0)
        self.assertTrue(zone['in_doelgebied'])
        self.assertEqual(score, 1)
        _, score2 = landing.zone_en_score(7.0, 2.0, 'rugworp', 10.0)
        self.assertEqual(score2, 2)

    def test_middenveld_scoort_niet(self):
        zone, score = landing.zone_en_score(7.0, 23.0, 'rugworp', 10.0)
        self.assertFalse(zone['in_doelgebied'])
        self.assertEqual(score, 0)

    def test_exact_op_de_doellijn_telt_niet(self):
        # Strikte ongelijkheid, consistent met field.ts (§6.6: volledig over de lijn).
        zone, score = landing.zone_en_score(7.0, 10.0, 'nekworp', 10.0)
        self.assertFalse(zone['in_doelgebied'])
        self.assertEqual(score, 0)

    def test_diepte_15_verschuift_de_lijn(self):
        zone, _ = landing.zone_en_score(7.0, 12.0, 'nekworp', 15.0)
        self.assertTrue(zone['in_doelgebied'])
        zone2, _ = landing.zone_en_score(7.0, 12.0, 'nekworp', 10.0)
        self.assertFalse(zone2['in_doelgebied'])


class TestKlem(unittest.TestCase):
    def test_klemt_binnen_het_veld(self):
        x, y = landing.klem_op_veld(-3.0, 99.0, 10.0)
        self.assertEqual(x, 0.0)
        self.assertEqual(y, veld.totale_lengte_m(10.0))


class TestDemoLanding(unittest.TestCase):
    def test_gematchte_detectie_krijgt_gelabelde_landing_met_ruis(self):
        labels = [_label(10.0, 7.0, 2.0)]
        detecties = [_det(10.3, 'rugworp')]
        verrijkt, rapport = landing.demo_landing(detecties, labels, seed=1, sigma_m=0.1, diepte_m=10.0)
        self.assertEqual(rapport['met_label'], 1)
        zone = verrijkt[0]['zone']
        # Kleine sigma: het punt blijft vlak bij het label en dus in het doelgebied.
        self.assertTrue(zone['in_doelgebied'])
        self.assertLess(abs(zone['x_m'] - 7.0), 1.0)
        self.assertEqual(verrijkt[0]['score_delta'], 2)

    def test_valse_positief_krijgt_willekeurig_veldpunt(self):
        verrijkt, rapport = landing.demo_landing([_det(500.0)], [_label(10.0, 7.0, 2.0)], seed=3, sigma_m=0.1, diepte_m=10.0)
        self.assertEqual(rapport['zonder_label'], 1)
        zone = verrijkt[0]['zone']
        self.assertIsNotNone(zone)
        self.assertTrue(0.0 <= zone['x_m'] <= veld.BREEDTE_M)
        self.assertTrue(0.0 <= zone['y_m'] <= veld.totale_lengte_m(10.0))

    def test_reproduceerbaar_met_seed(self):
        labels = [_label(10.0, 7.0, 25.0), _label(40.0, 3.0, 40.0)]
        detecties = [_det(10.2), _det(40.4), _det(300.0)]
        a, _ = landing.demo_landing(detecties, labels, seed=9, sigma_m=0.5, diepte_m=10.0)
        b, _ = landing.demo_landing(detecties, labels, seed=9, sigma_m=0.5, diepte_m=10.0)
        self.assertEqual(a, b)


class TestLandingUitSpoor(unittest.TestCase):
    def test_dalende_reeks_eindigt_op_de_landing(self):
        # Beeld-y stijgt terwijl de bal valt; de landing is het einde van die reeks.
        spoor = [(0.0, 100.0, 50.0), (0.1, 110.0, 80.0), (0.2, 120.0, 120.0), (0.3, 130.0, 150.0)]
        punt = landing.landing_uit_spoor(spoor)
        self.assertIsNotNone(punt)
        self.assertEqual(punt[0], 0.3)

    def test_te_kort_spoor_geeft_niets(self):
        self.assertIsNone(landing.landing_uit_spoor([(0.0, 1.0, 1.0)]))


if __name__ == '__main__':
    unittest.main()
