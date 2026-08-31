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
    """Klikpunten in een ÉCHT beeld: 1 px = 1 m, maar de y-as loopt naar beneden.

    Dat laatste is geen detail. In een beeld staat de verte bovenaan, dus loopt de diepte van
    het veld tegen de beeld-y-as in — en precies die omkering bepaalt het teken waarop de
    spiegel-guard oordeelt. Een testbeeld met y omhoog (zoals een landkaart) geeft het
    omgekeerde teken van elke echte camera, en dan test je de guard achterstevoren.
    """
    labels = veld.kruispunt_per_label(10.0)
    lengte = veld.totale_lengte_m(10.0)
    uit = []
    for label in punten_labels:
        k = labels[label]
        px = (veld.BREEDTE_M - k.x_m) if spiegel else k.x_m
        uit.append({'label': k.label, 'beeld_px': [px, lengte - k.y_m], 'veld_m': [k.x_m, k.y_m]})
    return uit


def _camera(pos, kijk, f=1400.0, breed=1920, hoog=1080):
    """Een echte pinhole-camera boven het veld: veldpunt (z=0) → beeldpunt (y naar beneden)."""
    import math
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
        return (breed / 2 + f * xc / zc, hoog / 2 - f * yc / zc)

    return naar_beeld


def _klikpunten(naar_beeld, breed=1920, hoog=1080) -> list[dict]:
    punten = []
    for k in veld.kruispunten(10.0):
        p = naar_beeld(k.x_m, k.y_m)
        if p and 0 <= p[0] <= breed and 0 <= p[1] <= hoog:
            punten.append({'label': k.label, 'beeld_px': [p[0], p[1]], 'veld_m': [k.x_m, k.y_m]})
    return punten


VIER = ['achterlijn_thuis_links', 'achterlijn_thuis_rechts', 'middellijn_links', 'middellijn_rechts']


BREED, LENGTE = veld.BREEDTE_M, veld.totale_lengte_m(10.0)

# Vier standpunten waarop echt gefilmd wordt. De camera achter het veld is er nadrukkelijk bij:
# die ziet de volle diepte, en juist dáár ging de guard vroeger de mist in.
STANDPUNTEN = {
    'zijlijn links': ((-16.0, LENGTE / 2, 6.0), (BREED / 2, LENGTE / 2, 0.0)),
    'zijlijn rechts': ((BREED + 16.0, LENGTE / 2, 6.0), (BREED / 2, LENGTE / 2, 0.0)),
    'achter de thuislijn': ((BREED / 2, -14.0, 8.0), (BREED / 2, LENGTE / 2, 0.0)),
    'achter de uitlijn': ((BREED / 2, LENGTE + 14.0, 8.0), (BREED / 2, LENGTE / 2, 0.0)),
}


class TestSpiegelGuard(unittest.TestCase):
    def test_elk_echt_standpunt_wordt_aanvaard(self):
        # In een beeld loopt y naar beneden terwijl de diepte naar boven loopt; een correct
        # aangeduid veld heeft daardoor een NEGATIEVE determinant — bij elk standpunt.
        for naam, (pos, kijk) in STANDPUNTEN.items():
            with self.subTest(standpunt=naam):
                punten = _klikpunten(_camera(pos, kijk))
                self.assertGreaterEqual(len(punten), 4)
                matrix = calibrate.fit_homografie(punten)
                self.assertLess(calibrate.orientatie_det(matrix, punten), 0)
                calibrate.controleer_orientatie(matrix, punten)  # geen fout

    def test_camera_achter_het_veld_ziet_alle_veertien_punten(self):
        punten = _klikpunten(_camera(*STANDPUNTEN['achter de thuislijn']))
        self.assertEqual(len(punten), 14)

    def test_links_rechts_verwisseld_wordt_geweigerd(self):
        punten = _klikpunten(_camera(*STANDPUNTEN['achter de thuislijn']))
        labels = veld.kruispunt_per_label(10.0)
        gespiegeld = []
        for p in punten:
            naam = p['label'].replace('links', 'X').replace('rechts', 'links').replace('X', 'rechts')
            k = labels[naam]
            gespiegeld.append({'label': naam, 'beeld_px': p['beeld_px'], 'veld_m': [k.x_m, k.y_m]})
        matrix = calibrate.fit_homografie(gespiegeld)
        self.assertGreater(calibrate.orientatie_det(matrix, gespiegeld), 0)
        with self.assertRaises(SystemExit) as ctx:
            calibrate.controleer_orientatie(matrix, gespiegeld)
        self.assertNotEqual(ctx.exception.code, 0)

    def test_gedraaide_camera_blijft_geldig(self):
        # Filmen vanaf de overkant is een 180°-draai, geen spiegel: het teken blijft gelijk.
        punten = _klikpunten(_camera(*STANDPUNTEN['achter de thuislijn']))
        labels = veld.kruispunt_per_label(10.0)
        gedraaid = []
        for p in punten:
            naam = calibrate.draai_label_180(p['label'])
            k = labels[naam]
            gedraaid.append({'label': naam, 'beeld_px': p['beeld_px'], 'veld_m': [k.x_m, k.y_m]})
        matrix = calibrate.fit_homografie(gedraaid)
        self.assertLess(calibrate.orientatie_det(matrix, gedraaid), 0)
        calibrate.controleer_orientatie(matrix, gedraaid)  # geen fout


class TestDraai180(unittest.TestCase):
    def test_labels_wisselen_thuis_uit_en_links_rechts(self):
        self.assertEqual(calibrate.draai_label_180('achterlijn_thuis_links'), 'achterlijn_uit_rechts')
        self.assertEqual(calibrate.draai_label_180('doellijn_uit_rechts'), 'doellijn_thuis_links')
        self.assertEqual(calibrate.draai_label_180('middellijn_links'), 'middellijn_rechts')

    def test_draai_houdt_het_bestand_consistent(self):
        # De matrix hoort bij _identiteit: 1 px = 1 m, met de beeld-y-as naar beneden.
        data = {
            'doelgebied_diepte_m': 10.0,
            'matrix_beeld_naar_veld': [[1.0, 0.0, 0.0], [0.0, -1.0, veld.totale_lengte_m(10.0)],
                                       [0.0, 0.0, 1.0]],
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
        self.assertLess(calibrate.orientatie_det(gedraaid['matrix_beeld_naar_veld'], gedraaid['punten']), 0)


if __name__ == '__main__':
    unittest.main()
