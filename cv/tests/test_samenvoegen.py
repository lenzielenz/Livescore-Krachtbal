"""Twee halve beelden tot één volledig veld samenvoegen.

Staat de camera midden op het veld en pant ze heen en weer, dan toont het ene ijkbeeld enkel
de thuiskant en het andere enkel de uitkant. Elk beeld heeft dan genoeg punten voor een
homografie (vier volstaat), maar die punten liggen allemaal in één helft — en zo'n fit
extrapoleert slecht naar de overkant, precies daar waar je straks meet.

Hier ligt vast dat het samenvoegen dat oplost, en dat het zwijgt wanneer het niet kan.
"""

from __future__ import annotations

import math
import random
import statistics
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import veld  # noqa: E402
from volg_veld import inverteer, maal, normaliseer, projecteer, samengevoegde_ankers  # noqa: E402


def _cv2_of_niets():
    try:
        import cv2  # noqa: PLC0415

        return cv2
    except ImportError:
        return None


DIEPTE = 10.0
EENHEID = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]


def _camera(pan_graden: float):
    """Een échte pinhole-camera naast het veld, gepand over `pan_graden`."""
    import numpy as np  # noqa: PLC0415

    f, cx, cy = 1400.0, 960.0, 540.0
    K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]], float)
    C = np.array([-6.0, 23.0, 5.0])
    yaw = math.radians(pan_graden)
    draai = np.array([
        [math.cos(yaw), -math.sin(yaw), 0],
        [math.sin(yaw), math.cos(yaw), 0],
        [0, 0, 1],
    ])
    basis = np.array([[0, 1, 0], [0, 0, -1], [1, 0, 0]], float)
    R = basis @ draai.T
    t = -R @ C
    H = K @ np.column_stack([R[:, 0], R[:, 1], t])
    return normaliseer(np.linalg.inv(H).tolist())


def _punten(H, labels, sigma, rng, kaart):
    """Waar die labels in dit beeld liggen — met de onnauwkeurigheid van een mens erbij."""
    Hinv = inverteer(H)
    uit = []
    for label in labels:
        k = kaart[label]
        x, y = projecteer(Hinv, k.x_m, k.y_m)
        uit.append({'label': label, 'x': x + rng.gauss(0, sigma), 'y': y + rng.gauss(0, sigma)})
    return uit


@unittest.skipUnless(_cv2_of_niets(), 'opencv niet geïnstalleerd')
class TestSamenvoegen(unittest.TestCase):
    def setUp(self):
        self.kaart = veld.kruispunt_per_label(DIEPTE)
        self.thuis = [l for l in self.kaart if 'thuis' in l or 'middellijn' in l]
        self.uit = [l for l in self.kaart if 'uit' in l or 'middellijn' in l]
        self.H1 = _camera(-18.0)
        self.H2 = _camera(18.0)
        # De camerabeweging tussen beide beelden, zoals het volgen ze levert.
        self.K2 = normaliseer(maal(inverteer(self.H1), self.H2))

    def _keten(self, tijd):
        return EENHEID if tijd == 0.0 else self.K2

    def _veldpunt(self, label):
        k = self.kaart.get(label)
        return (k.x_m, k.y_m) if k else None

    def _fout_over_het_veld(self, matrix):
        """Mediane en slechtste fout in meters, gemeten over álle veertien kruispunten."""
        Hinv1 = inverteer(self.H1)
        fouten = []
        for label, k in self.kaart.items():
            bx, by = projecteer(Hinv1, k.x_m, k.y_m)
            mx, my = projecteer(matrix, bx, by)
            fouten.append(math.hypot(mx - k.x_m, my - k.y_m))
        return statistics.median(fouten), max(fouten)

    def test_halveert_de_fout_over_het_hele_veld(self):
        from calibrate import fit_homografie  # noqa: PLC0415

        los_med, los_max, samen_med, samen_max = [], [], [], []
        for seed in range(25):
            rng = random.Random(seed)
            p1 = _punten(self.H1, self.thuis, 3.0, rng, self.kaart)
            p2 = _punten(self.H2, self.uit, 3.0, rng, self.kaart)
            los = normaliseer(fit_homografie([
                {'beeld_px': [q['x'], q['y']], 'veld_m': list(self._veldpunt(q['label']))} for q in p1
            ]))
            samen = samengevoegde_ankers([(0.0, p1), (10.0, p2)], self._keten, self._veldpunt)
            self.assertIsNotNone(samen)
            a, b = self._fout_over_het_veld(los)
            c, d = self._fout_over_het_veld(samen[0][1])
            los_med.append(a)
            los_max.append(b)
            samen_med.append(c)
            samen_max.append(d)

        # Gemeten met 3 px aanduidruis: mediaan 0,15 → 0,07 m en het slechtste punt 0,66 → 0,24 m.
        # De marge hieronder is ruim; het gaat om de richting, niet om het precieze cijfer.
        self.assertLess(statistics.median(samen_med), statistics.median(los_med) * 0.8)
        self.assertLess(statistics.median(samen_max), statistics.median(los_max) * 0.6)

    def test_elk_ijkbeeld_krijgt_zijn_eigen_matrix(self):
        rng = random.Random(1)
        p1 = _punten(self.H1, self.thuis, 1.0, rng, self.kaart)
        p2 = _punten(self.H2, self.uit, 1.0, rng, self.kaart)
        samen = samengevoegde_ankers([(0.0, p1), (10.0, p2)], self._keten, self._veldpunt)
        self.assertEqual([t for t, _ in samen], [0.0, 10.0])
        # En ze zijn niet dezelfde matrix: elk anker staat in zijn eigen beeld.
        self.assertNotEqual(samen[0][1], samen[1][1])

    def test_zwijgt_als_het_niet_kan(self):
        rng = random.Random(2)
        p1 = _punten(self.H1, self.thuis, 1.0, rng, self.kaart)
        # Eén beeld valt niets samen te voegen.
        self.assertIsNone(samengevoegde_ankers([(0.0, p1)], self._keten, self._veldpunt))
        # Zonder keten op dat moment ook niet — dan liever de losse ankers houden dan iets
        # verzinnen met een onbekende camerabeweging.
        self.assertIsNone(
            samengevoegde_ankers([(0.0, p1), (99.0, p1)], lambda t: EENHEID if t == 0.0 else None, self._veldpunt)
        )


if __name__ == '__main__':
    unittest.main()
