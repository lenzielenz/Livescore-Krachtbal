"""Echte terreinmaten: alle meterberekeningen moeten meeschalen met breedte/speelveld."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import calibrate  # noqa: E402
import heatmap  # noqa: E402
import landing  # noqa: E402
import sync  # noqa: E402
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


class TestWeakLabelsMetMaten(unittest.TestCase):
    def _event(self, y_norm: float) -> dict:
        return {
            'video_time_s': 12.0, 'event_type': 'worp', 'worp_type': 'nek', 'outcome': 'goal',
            'landing': {'x_norm': 0.5, 'y_norm': y_norm, 'x_m': 7.0, 'y_m': y_norm * 44.0},
            'speler': {'team': 'home', 'rugnummer': 7},
        }

    def test_in_doelgebied_volgt_de_echte_speelveldlengte(self):
        # y_norm 0.22 ligt op een kort veld (speelveld 24 → doellijn 10/44 ≈ 0.227) nog in het
        # doelgebied, op een reglementair veld (10/46 ≈ 0.217) er net buiten.
        kort = sync.naar_weak_label(self._event(0.22), 1, 10.0, None, speelveld_m=24.0)
        lang = sync.naar_weak_label(self._event(0.22), 1, 10.0, None)
        self.assertTrue(kort['zone']['in_doelgebied'])
        self.assertFalse(lang['zone']['in_doelgebied'])


class TestHeatmapMetMaten(unittest.TestCase):
    def test_raster_volgt_de_echte_maten_en_gooit_niets_weg(self):
        # Diep terrein (15 m): totale lengte 56 m — een positie op y=50 hoort in het raster.
        raster = heatmap.bouw_raster([{'track': 1, 'x_m': 7.0, 'y_m': 50.0}], diepte_m=15.0)
        self.assertEqual(raster['posities'], 1)
        self.assertEqual(raster['lengte'], round(56.0 / heatmap.CEL_M))
        # Op een reglementair raster (46 m) zou datzelfde punt buiten het veld vallen.
        weg = heatmap.bouw_raster([{'track': 1, 'x_m': 7.0, 'y_m': 50.0}], diepte_m=10.0)
        self.assertEqual(weg['posities'], 0)

    def test_smaller_veld_geeft_smaller_raster(self):
        raster = heatmap.bouw_raster([{'track': 1, 'x_m': 11.9, 'y_m': 20.0}], diepte_m=10.0,
                                     breedte_m=12.0, speelveld_m=24.0)
        self.assertEqual(raster['breedte'], round(12.0 / heatmap.CEL_M))
        self.assertEqual(raster['posities'], 1)
        # Buiten de opgemeten breedte telt niet mee.
        buiten = heatmap.bouw_raster([{'track': 1, 'x_m': 13.0, 'y_m': 20.0}], diepte_m=10.0,
                                     breedte_m=12.0, speelveld_m=24.0)
        self.assertEqual(buiten['posities'], 0)


class TestKalibratieMetMaten(unittest.TestCase):
    def test_veldinfo_leest_de_maten_waar_ze_geschreven_worden(self):
        # schrijf_kalibratie zet ze onder 'veld' — het rapport moet daar kijken.
        data = {'veld': {'doelgebied_diepte_m': 15.0, 'breedte_m': 14.0, 'speelveld_m': 26.0}}
        self.assertEqual(calibrate.veldinfo_uit(data), (15.0, 26.0))
        # Oudere bestanden hadden de diepte op het hoogste niveau: die blijven werken.
        self.assertEqual(calibrate.veldinfo_uit({'doelgebied_diepte_m': 12.0}), (12.0, 26.0))
        # Leeg bestand valt terug op het reglement.
        self.assertEqual(calibrate.veldinfo_uit({}), (veld.STANDAARD_DOELGEBIED_DIEPTE_M, veld.SPEELVELD_LENGTE_M))

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
