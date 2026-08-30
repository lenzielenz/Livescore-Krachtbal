"""Tests voor filmen vanaf zijkant/achterkant: posities, spiegel-guard en 180°-draai."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import calibrate  # noqa: E402
import veld  # noqa: E402


class TestAanbevolenLabels(unittest.TestCase):
    def test_zijlijn_en_hoek_geven_alle_veertien(self):
        self.assertEqual(len(veld.aanbevolen_labels('zijlijn')), 14)
        self.assertEqual(len(veld.aanbevolen_labels('hoek')), 14)

    def test_achterkant_geeft_enkel_de_eigen_kant_plus_middellijn(self):
        thuis = veld.aanbevolen_labels('achter-thuis')
        self.assertEqual(len(thuis), 8)
        self.assertTrue(all('_uit_' not in l for l in thuis))
        self.assertIn('middellijn_links', thuis)
        uit = veld.aanbevolen_labels('achter-uit')
        self.assertTrue(all('_thuis_' not in l for l in uit))

    def test_onbekende_positie_faalt(self):
        with self.assertRaises(ValueError):
            veld.aanbevolen_labels('tribune')


def _identiteit(punten_labels: list[str], spiegel: bool = False) -> list[dict]:
    """Klikpunten waar het beeld 1 px = 1 m is; met spiegel wisselen links/rechts van pixel."""
    labels = veld.kruispunt_per_label(10.0)
    uit = []
    for label in punten_labels:
        k = labels[label]
        px = (veld.BREEDTE_M - k.x_m) if spiegel else k.x_m
        uit.append({'label': k.label, 'beeld_px': [px, k.y_m], 'veld_m': [k.x_m, k.y_m]})
    return uit


VIER = ['achterlijn_thuis_links', 'achterlijn_thuis_rechts', 'middellijn_links', 'middellijn_rechts']


class TestSpiegelGuard(unittest.TestCase):
    def test_gewone_kalibratie_is_positief_georienteerd(self):
        punten = _identiteit(VIER)
        matrix = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        self.assertGreater(calibrate.orientatie_det(matrix, punten), 0)
        calibrate.controleer_orientatie(matrix, punten)  # geen fout

    def test_gedraaide_camera_blijft_geldig(self):
        # 180° om de optische as (andere zijlijn): rotatie, géén spiegel.
        matrix = [[-1.0, 0.0, veld.BREEDTE_M], [0.0, -1.0, 46.0], [0.0, 0.0, 1.0]]
        punten = [{'label': 'x', 'beeld_px': [3.0, 5.0], 'veld_m': [0, 0]}]
        self.assertGreater(calibrate.orientatie_det(matrix, punten), 0)

    def test_spiegelbeeld_wordt_geweigerd(self):
        # Links/rechts verwisseld bij het klikken: x klapt om → negatieve determinant.
        matrix = [[-1.0, 0.0, veld.BREEDTE_M], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        punten = [{'label': 'x', 'beeld_px': [3.0, 5.0], 'veld_m': [0, 0]}]
        self.assertLess(calibrate.orientatie_det(matrix, punten), 0)
        with self.assertRaises(SystemExit) as ctx:
            calibrate.controleer_orientatie(matrix, punten)
        self.assertNotEqual(ctx.exception.code, 0)


class TestDraai180(unittest.TestCase):
    def test_labels_wisselen_thuis_uit_en_links_rechts(self):
        self.assertEqual(calibrate.draai_label_180('achterlijn_thuis_links'), 'achterlijn_uit_rechts')
        self.assertEqual(calibrate.draai_label_180('doellijn_uit_rechts'), 'doellijn_thuis_links')
        self.assertEqual(calibrate.draai_label_180('middellijn_links'), 'middellijn_rechts')

    def test_draai_houdt_het_bestand_consistent(self):
        data = {
            'doelgebied_diepte_m': 10.0,
            'matrix_beeld_naar_veld': [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            'punten': _identiteit(VIER),
        }
        gedraaid = calibrate.draai_kalibratie_180(data)
        lengte = veld.totale_lengte_m(10.0)
        # Elk punt: pixel onveranderd, veldcoördinaat 180° gedraaid, label gewisseld.
        for oud, nieuw in zip(data['punten'], gedraaid['punten']):
            self.assertEqual(nieuw['beeld_px'], oud['beeld_px'])
            self.assertAlmostEqual(nieuw['veld_m'][0], veld.BREEDTE_M - oud['veld_m'][0])
            self.assertAlmostEqual(nieuw['veld_m'][1], lengte - oud['veld_m'][1])
            self.assertEqual(nieuw['label'], calibrate.draai_label_180(oud['label']))
        # De matrix projecteert het pixelpunt exact op de nieuwe veldcoördinaat (fout 0).
        for p in gedraaid['punten']:
            x, y = calibrate._projecteer(gedraaid['matrix_beeld_naar_veld'], *p['beeld_px'])
            self.assertAlmostEqual(x, p['veld_m'][0], places=6)
            self.assertAlmostEqual(y, p['veld_m'][1], places=6)
        # En blijft correct georiënteerd (rotatie is geen spiegel).
        self.assertGreater(calibrate.orientatie_det(gedraaid['matrix_beeld_naar_veld'], gedraaid['punten']), 0)


if __name__ == '__main__':
    unittest.main()
