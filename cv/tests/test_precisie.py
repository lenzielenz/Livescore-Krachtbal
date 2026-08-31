#!/usr/bin/env python3
"""Hoe scherp meet een camerastandpunt, en wáár?

Bij een camera op de zijlijn is één pixel overal ongeveer even veel meters waard. Staat ze
achter het veld en kijkt ze in de diepte, dan is dat vooraan een paar centimeter en achteraan
al gauw een halve meter — dezelfde kalibratie, maar een meting die vooraan klopt en achteraan
een schatting is. Dat verschil moet meetbaar zijn, anders kan de app het niet tonen.
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import calibrate  # noqa: E402
import veld  # noqa: E402

DIEPTE, BREED, SPEEL = 10.0, 14.0, 26.0


def _camera(pos, kijk, f=1400.0, b=1920, h=1080):
    """Een echte pinhole-camera: veldpunt (z=0) → beeldpunt."""
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
        return (b / 2 + f * xc / zc, h / 2 - f * yc / zc)

    return naar_beeld


def _fit(naar_beeld, b=1920, h=1080):
    punten = []
    for k in veld.kruispunten(DIEPTE, BREED, SPEEL):
        p = naar_beeld(k.x_m, k.y_m)
        if p and 0 <= p[0] <= b and 0 <= p[1] <= h:
            punten.append({'label': k.label, 'beeld_px': [p[0], p[1]], 'veld_m': [k.x_m, k.y_m]})
    return calibrate.fit_homografie(punten) if len(punten) >= 4 else None, len(punten)


class TestMetersPerPixel(unittest.TestCase):
    def test_een_zuivere_schaal_geeft_overal_dezelfde_waarde(self):
        # 20 pixels per meter, geen perspectief: één pixel is overal 5 cm.
        matrix = [[1 / 20, 0.0, 0.0], [0.0, 1 / 20, 0.0], [0.0, 0.0, 1.0]]
        for x, y in ((1.0, 1.0), (7.0, 23.0), (13.0, 45.0)):
            self.assertAlmostEqual(calibrate.meters_per_pixel(matrix, x, y), 0.05, places=6)

    def test_geeft_niets_terug_waar_de_matrix_ontaardt(self):
        ontaard = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 1.0, 0.0]]
        self.assertIsNone(calibrate.meters_per_pixel(ontaard, 7.0, 23.0))


class TestPrecisiekaart(unittest.TestCase):
    def test_zijlijn_meet_overal_ongeveer_even_scherp(self):
        matrix, _ = _fit(_camera((-16.0, 23.0, 6.0), (BREED / 2, 23.0, 0.0)))
        kaart = calibrate.precisiekaart(matrix, DIEPTE, BREED, SPEEL)
        self.assertLess(abs(kaart['thuis'] - kaart['uit']), 0.05)

    def test_achter_het_veld_wordt_naar_achter_toe_ruwer(self):
        # Precies wat de vraag was: werkt een camera achter het veld? Ja — maar de overkant
        # kost precisie, en dat moet het cijfer laten zien in plaats van het te verzwijgen.
        matrix, zichtbaar = _fit(_camera((BREED / 2, -14.0, 8.0), (BREED / 2, 23.0, 0.0)))
        kaart = calibrate.precisiekaart(matrix, DIEPTE, BREED, SPEEL)
        self.assertEqual(zichtbaar, 14)                  # ze ziet wél het hele veld
        self.assertLess(kaart['thuis'], 0.10)            # vooraan scherp
        self.assertGreater(kaart['uit'], 2 * kaart['thuis'])  # achteraan fors ruwer
        self.assertEqual(kaart['slechtste'], max(kaart['thuis'], kaart['midden'], kaart['uit']))

    def test_hoger_opstellen_helpt_de_overkant(self):
        laag, _ = _fit(_camera((BREED / 2, -10.0, 4.0), (BREED / 2, 23.0, 0.0)))
        hoog, _ = _fit(_camera((BREED / 2, -12.0, 12.0), (BREED / 2, 23.0, 0.0)))
        self.assertGreater(calibrate.precisiekaart(laag, DIEPTE, BREED, SPEEL)['uit'],
                           calibrate.precisiekaart(hoog, DIEPTE, BREED, SPEEL)['uit'])


if __name__ == '__main__':
    unittest.main()
