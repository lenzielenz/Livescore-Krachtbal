"""Echte terreinmaten: alle meterberekeningen moeten meeschalen met breedte/speelveld."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import calibrate  # noqa: E402
import landing  # noqa: E402
import veld  # noqa: E402


class TestVeldMaten(unittest.TestCase):
    def test_naar_meters_schaalt_met_de_echte_breedte(self):
        # Zelfde genormaliseerd punt, smaller veld → kleinere x in meters.
        x14, _ = veld.naar_meters(0.5, 0.5, 10.0)
        x12, _ = veld.naar_meters(0.5, 0.5, 10.0, breedte_m=12.0)
        self.assertAlmostEqual(x14, 7.0)
        self.assertAlmostEqual(x12, 6.0)

    def test_doellijn_en_vrijeworplijn_schuiven_mee_met_het_speelveld(self):
        # Speelveld 24 m + diepte 10 m → totale lengte 44 m, doellijn op 10/44.
        self.assertAlmostEqual(veld.totale_lengte_m(10.0, 24.0), 44.0)
        self.assertAlmostEqual(veld.doellijn_norm(10.0, 24.0), 10.0 / 44.0)
        self.assertAlmostEqual(veld.vrijeworplijn_norm(10.0, 24.0), 14.0 / 44.0)

    def test_kruispunten_liggen_op_de_echte_maten(self):
        labels = veld.kruispunt_per_label(10.0, breedte_m=12.0, speelveld_m=24.0)
        self.assertAlmostEqual(labels['achterlijn_thuis_rechts'].x_m, 12.0)
        self.assertAlmostEqual(labels['middellijn_links'].y_m, 22.0)
        self.assertAlmostEqual(labels['achterlijn_uit_rechts'].y_m, 44.0)
        # x_norm blijft 0..1 op de eigen breedte.
        self.assertAlmostEqual(labels['achterlijn_thuis_rechts'].x_norm, 1.0)


class TestLandingMetMaten(unittest.TestCase):
    def test_zone_en_score_gebruikt_de_echte_lengte(self):
        # y = 35 m: op een reglementair veld (46 m totaal, doellijn op 36) nog
        # spelersveld, op een kort veld (speelveld 24 → doellijn op 34) doelgebied.
        zone_lang, score_lang = landing.zone_en_score(6.0, 35.0, 'rugworp', 10.0)
        self.assertFalse(zone_lang['in_doelgebied'])
        self.assertEqual(score_lang, 0)
        zone_kort, score_kort = landing.zone_en_score(6.0, 35.0, 'rugworp', 10.0, speelveld_m=24.0)
        self.assertTrue(zone_kort['in_doelgebied'])
        self.assertEqual(score_kort, 2)

    def test_klem_op_veld_klemt_op_de_echte_randen(self):
        x, y = landing.klem_op_veld(13.5, 45.0, 10.0, breedte_m=12.0, speelveld_m=24.0)
        self.assertAlmostEqual(x, 12.0)
        self.assertAlmostEqual(y, 44.0)


class TestKalibratieMetMaten(unittest.TestCase):
    def test_draai_180_gebruikt_de_maten_uit_het_bestand(self):
        data = {
            'veld': {'doelgebied_diepte_m': 10.0, 'breedte_m': 12.0, 'speelveld_m': 24.0},
            'matrix_beeld_naar_veld': [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            'punten': [{'label': 'achterlijn_thuis_links', 'beeld_px': [0.0, 0.0], 'veld_m': [0.0, 0.0]}],
        }
        gedraaid = calibrate.draai_kalibratie_180(data)
        # (0,0) draait naar de overstaande hoek van het écht opgemeten veld.
        self.assertEqual(gedraaid['punten'][0]['veld_m'], [12.0, 44.0])
        self.assertEqual(gedraaid['punten'][0]['label'], 'achterlijn_uit_rechts')


if __name__ == '__main__':
    unittest.main()
