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
        # Harde klem blijft bestaan voor SPELERSposities (tracking.py) — een landing
        # gaat via klem_of_uitbal, zie TestKlemOfUitbal.
        x, y = landing.klem_op_veld(-3.0, 99.0, 10.0)
        self.assertEqual(x, 0.0)
        self.assertEqual(y, veld.totale_lengte_m(10.0))


class TestKlemOfUitbal(unittest.TestCase):
    def test_aanduidruis_wordt_geklemd(self):
        # Tot 0,3 m buiten de lijnen is het meetruis: klemmen, geen uitbal.
        x, y, uitbal = landing.klem_of_uitbal(-0.2, 46.1, 10.0)
        self.assertEqual((x, y), (0.0, veld.totale_lengte_m(10.0)))
        self.assertFalse(uitbal)

    def test_achter_de_achterlijn_is_uitbal_met_het_echte_punt(self):
        # Regressie (doorlichting): 1,5 m achter de achterlijn werd vroeger op y=0
        # geklemd en telde als rugworp-doelpunt (+2). Nu: het echte punt terug, uitbal.
        x, y, uitbal = landing.klem_of_uitbal(7.0, -1.5, 10.0)
        self.assertEqual((x, y), (7.0, -1.5))
        self.assertTrue(uitbal)

    def test_naast_de_zijlijn_is_uitbal(self):
        x, y, uitbal = landing.klem_of_uitbal(14.5, 20.0, 10.0)
        self.assertEqual((x, y), (14.5, 20.0))
        self.assertTrue(uitbal)


class TestWerpplaats(unittest.TestCase):
    def test_parallax_schuift_terug_naar_de_werper(self):
        # Camera op (7, −9), 6 m hoog; werper 15 m verder op (7, 6). De grondvlak-
        # homografie projecteert de bal op 2 m loslaathoogte d·H/(H−h) van de camera:
        # op (7, 13.5) — 7,5 m voorbij de werper. De correctie geeft de werper terug.
        standpunt = {'x_m': 7.0, 'y_m': -9.0, 'hoogte_m': 6.0}
        x, y = landing.corrigeer_werphoogte(7.0, 13.5, standpunt)
        self.assertAlmostEqual(x, 7.0)
        self.assertAlmostEqual(y, 6.0)

    def test_camera_op_of_onder_loslaathoogte_corrigeert_niet(self):
        # De meetkunde klapt om als de camera lager staat dan de bal: dan liever niets.
        standpunt = {'x_m': 7.0, 'y_m': -9.0, 'hoogte_m': 1.5}
        self.assertEqual(landing.corrigeer_werphoogte(4.0, 20.0, standpunt), (4.0, 20.0))

    def test_vrijeworplijn_projectie_volgens_6_4(self):
        # Tussen doellijn (10) en vrijeworplijn (14) → terug tot 14; aan de uit-kant
        # (band 32–36 op een veld van 46) → terug tot 32; doelgebied en middenveld
        # blijven staan — spiegel van projectWerpplaats in field.ts.
        self.assertEqual(landing.projecteer_vrijeworplijn(12.0, 10.0), 14.0)
        self.assertEqual(landing.projecteer_vrijeworplijn(33.0, 10.0), 32.0)
        self.assertEqual(landing.projecteer_vrijeworplijn(20.0, 10.0), 20.0)
        self.assertEqual(landing.projecteer_vrijeworplijn(8.0, 10.0), 8.0)

    def test_vrijeworplijn_projectie_met_andere_maten(self):
        # Niet-reglementair terrein: diepte 15, speelveld 25 → lengte 55, doellijnen op
        # 15 en 40, vrijeworplijnen op 19 en 36. De band schuift mee met de maten.
        # De pariteit met field.ts (dat in de app de afstand uit deze werpplaats
        # berekent) wordt cross-language bewaakt in tests/unit/cv-naar-worp.unit.spec.ts.
        self.assertEqual(landing.projecteer_vrijeworplijn(16.0, 15.0, 25.0), 19.0)
        self.assertEqual(landing.projecteer_vrijeworplijn(38.0, 15.0, 25.0), 36.0)
        self.assertEqual(landing.projecteer_vrijeworplijn(20.0, 15.0, 25.0), 20.0)
        self.assertEqual(landing.projecteer_vrijeworplijn(14.0, 15.0, 25.0), 14.0)


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

    def test_landing_buiten_de_lijnen_wordt_uitbal_zonder_zone(self):
        # Regressie (doorlichting): een label 2 m achter de achterlijn (σ=0, dus geen
        # ruis) werd vroeger op y=0 geklemd en telde als doelpunt. Nu: uitbal-markering,
        # zone leeg, 0 punten — beter een expliciete uitbal dan een verzonnen doelpunt.
        labels = [_label(10.0, 7.0, -2.0)]
        detecties = [_det(10.3, 'nekworp')]
        verrijkt, _ = landing.demo_landing(detecties, labels, seed=1, sigma_m=0.0, diepte_m=10.0)
        self.assertTrue(verrijkt[0].get('uitbal'))
        self.assertIsNone(verrijkt[0]['zone'])
        self.assertEqual(verrijkt[0]['score_delta'], 0)

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

    def test_stuit_en_uitrol_verschuiven_de_landing_niet(self):
        # Regressie (doorlichting): val tot y=200 op t=0,3 (eerste grondcontact),
        # stuit omhoog naar 170, tweede val en drie uitrolframes. De oude code nam
        # het einde van de láátste daalreeks — (0.9, 190, 200), 0,6 s en 60 px te
        # ver. Het reglement telt het eerste grondcontact.
        spoor = [
            (0.0, 100.0, 50.0), (0.1, 110.0, 100.0), (0.2, 120.0, 150.0), (0.3, 130.0, 200.0),
            (0.4, 140.0, 170.0),  # stuit: de bal gaat weer omhoog
            (0.5, 150.0, 185.0), (0.6, 160.0, 200.0),  # tweede val
            (0.7, 170.0, 200.0), (0.8, 180.0, 200.0), (0.9, 190.0, 200.0),  # uitrol
        ]
        self.assertEqual(landing.landing_uit_spoor(spoor), (0.3, 130.0, 200.0))


if __name__ == '__main__':
    unittest.main()
