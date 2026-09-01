"""Tests voor detectie.py — de pure rekenkern keypoints → bbox/voetpunt.

Zelfde aanpak als test_houding.py: verzonnen skeletten, geen rtmlib en geen
video. De modellaag zelf (laad_model/laad_bron) heeft rtmlib nodig en wordt
hier bewust niet gedraaid; de bron-vorm (een functie frame → detecties) wordt
in test_tracking.py met een geïnjecteerde functie door de hele keten getest.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import detectie  # noqa: E402


def _skelet() -> list[tuple[float, float]]:
    """Een rechtopstaand COCO-17-skelet: kruin op y=100, enkels op y=250."""
    return [
        (105.0, 100.0),  # 0 neus
        (103.0, 98.0), (107.0, 98.0),    # 1-2 ogen
        (101.0, 100.0), (109.0, 100.0),  # 3-4 oren
        (100.0, 130.0), (110.0, 130.0),  # 5-6 schouders
        (95.0, 150.0), (115.0, 150.0),   # 7-8 ellebogen
        (95.0, 170.0), (115.0, 170.0),   # 9-10 polsen
        (101.0, 180.0), (109.0, 180.0),  # 11-12 heupen
        (100.0, 215.0), (110.0, 215.0),  # 13-14 knieën
        (100.0, 250.0), (110.0, 250.0),  # 15-16 enkels
    ]


class TestPersoonUitKeypoints(unittest.TestCase):
    def test_bbox_en_voetpunt_uit_een_volledig_skelet(self):
        det = detectie.persoon_uit_keypoints(_skelet(), [0.9] * 17)
        self.assertIsNotNone(det)
        # De bbox omsluit alle zekere gewrichten.
        self.assertEqual(det['bbox'], (95.0, 98.0, 20.0, 152.0))
        # Het voetpunt is het gemiddelde van de enkels — het enige gewricht dat
        # óp de grond staat en dus door de grondvlak-homografie mag.
        self.assertEqual(det['voeten'], (105.0, 250.0))
        self.assertAlmostEqual(det['zekerheid'], 0.9)

    def test_onzekere_punten_rekken_de_bbox_niet_op(self):
        skelet = _skelet()
        skelet[9] = (500.0, -300.0)  # gehallucineerde pols, ver naast het lichaam
        scores = [0.9] * 17
        scores[9] = 0.1  # onder MIN_ZEKERHEID
        det = detectie.persoon_uit_keypoints(skelet, scores)
        self.assertEqual(det['bbox'], (95.0, 98.0, 20.0, 152.0))

    def test_zonder_zekere_enkels_valt_het_voetpunt_op_heup_x_en_bbox_onderkant(self):
        scores = [0.9] * 17
        scores[detectie.L_ENKEL] = scores[detectie.R_ENKEL] = 0.1  # enkels in het gras
        det = detectie.persoon_uit_keypoints(_skelet(), scores)
        # Zijwaarts de heupen (stabielste plek), verticaal de onderkant van wat
        # er nog zeker is (de knieën op y=215): dichter bij de grond komt dit
        # skelet niet.
        self.assertEqual(det['voeten'], (105.0, 215.0))

    def test_te_weinig_zekere_punten_is_geen_persoon(self):
        scores = [0.1] * 17
        scores[0] = scores[5] = scores[6] = 0.9  # drie punten < MIN_PUNTEN
        self.assertIsNone(detectie.persoon_uit_keypoints(_skelet(), scores))

    def test_zekerheid_middelt_alleen_de_zekere_scores(self):
        scores = [0.8] * 17
        scores[9] = 0.05  # telt niet mee
        det = detectie.persoon_uit_keypoints(_skelet(), scores)
        self.assertAlmostEqual(det['zekerheid'], 0.8)


class TestDetectiesUitPose(unittest.TestCase):
    def test_ruis_skeletten_vallen_weg_en_echte_blijven(self):
        goed = _skelet()
        ruis = [(0.0, 0.0)] * 17
        uit = detectie.detecties_uit_pose([goed, ruis], [[0.9] * 17, [0.05] * 17])
        self.assertEqual(len(uit), 1)
        self.assertEqual(uit[0]['voeten'], (105.0, 250.0))

    def test_maak_pose_bron_verpakt_model_uitvoer_als_detecties(self):
        # Een nepmodel volstaat: de bron is gewoon een functie frame → detecties.
        # Precies dat maakt de bron injecteerbaar voor tests en alternatieven.
        def nepmodel(frame):
            return [_skelet()], [[0.9] * 17]

        bron = detectie.maak_pose_bron(nepmodel)
        detecties = bron(object())  # het "frame" wordt alleen doorgegeven
        self.assertEqual(len(detecties), 1)
        self.assertEqual(set(detecties[0]), {'bbox', 'voeten', 'zekerheid'})


if __name__ == '__main__':
    unittest.main()
