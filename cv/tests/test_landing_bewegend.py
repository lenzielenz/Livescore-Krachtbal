#!/usr/bin/env python3
"""Twee worpen op een bewegende camera — het pad waar landing.py over zijn eigen spoor viel.

De homografie-reeks (per moment een matrix) en het balspoor (de gevolgde bal) deelden één
variabele. Bij de eerste worp ging alles goed; bij de tweede riep de code `.op(t)` aan op wat
intussen een lijst geworden was. Eén worp per video merkte dat nooit — vandaar deze test met
twee.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import landing  # noqa: E402


def _cv2_of_niets():
    try:
        import cv2  # noqa: PLC0415
        return cv2
    except ImportError:
        return None


@unittest.skipUnless(_cv2_of_niets(), 'opencv niet geïnstalleerd')
class TestTweeWorpenBewegendeCamera(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import numpy as np
        cv2 = _cv2_of_niets()
        cls.map = Path(tempfile.mkdtemp())
        cls.video = cls.map / 'proef.mp4'
        schrijver = cv2.VideoWriter(str(cls.video), cv2.VideoWriter_fourcc(*'mp4v'), 25.0, (320, 180))
        for i in range(25 * 20):
            beeld = np.full((180, 320, 3), 30, np.uint8)
            # Eén bewegend stipje op balgrootte, zodat er iets te volgen valt.
            cv2.circle(beeld, (20 + (i * 3) % 280, 40 + (i * 2) % 100), 4, (240, 240, 240), -1)
            schrijver.write(beeld)
        schrijver.release()

        # Een homografie-reeks: elk halve seconde dezelfde eenvoudige matrix.
        cls.homografie = cls.map / 'homografie.jsonl'
        with cls.homografie.open('w') as f:
            t = 0.0
            while t <= 20.0:
                f.write(json.dumps({'t': round(t, 2), 'bron': 'kalibratie', 'fout_m': 0.0,
                                    'H': [[0.05, 0.0, 0.0], [0.0, 0.05, 0.0], [0.0, 0.0, 1.0]]}) + '\n')
                t += 0.5

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.map, ignore_errors=True)

    def test_meerdere_worpen_verwerken_zonder_te_struikelen(self):
        class Args:
            video = self.video
            homografie = self.homografie
            kalibratie = None
            balspoor = None
            diepte, breedte, speelveld = 10.0, 14.0, 26.0
            venster_start, venster_einde = 0.4, 2.0
            bal_min_px, bal_max_px = 3, 30

        detecties = [
            {'match_id': 1, 'video_time_s': 3.0, 'event_type': 'worp', 'confidence': 0.5},
            {'match_id': 1, 'video_time_s': 9.0, 'event_type': 'worp', 'confidence': 0.5},
            {'match_id': 1, 'video_time_s': 14.0, 'event_type': 'worp', 'confidence': 0.5},
        ]
        verrijkt, rapport = landing.video_landing(Args(), detecties)
        self.assertEqual(len(verrijkt), 3)
        self.assertEqual(rapport['detecties'], 3)


if __name__ == '__main__':
    unittest.main()
