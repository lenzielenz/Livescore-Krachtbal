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
from types import SimpleNamespace

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


# Eenvoudige schuif-homografieën (0,02 m/px): H_WORP is de stand op het worpmoment,
# H_LAND dezelfde camera 200 px verder gepand (hetzelfde pixel wijst 4 m verderop).
# De beeld-x loopt langs de veldlengte, zodat een pan een fout in de worpafstand geeft.
H_WORP = [[0.0, 0.02, 0.0], [0.02, 0.0, 0.0], [0.0, 0.0, 1.0]]
H_LAND = [[0.0, 0.02, 0.0], [0.02, 0.0, 4.0], [0.0, 0.0, 1.0]]


@unittest.skipUnless(_cv2_of_niets(), 'opencv niet geïnstalleerd')
class TestWerpplaatsEnUitbal(unittest.TestCase):
    """Regressies uit de doorlichting, deterministisch via het --balbanen-pad.

    De baan (loslaat- en landingspunt in beeldpixels) komt uit een balbanen-JSONL,
    dus er valt niets te tracken — precies wat we willen: hier toetsen we alleen
    de projectie naar veldmeters, de uitbal-afhandeling en de afstand.
    """

    @classmethod
    def setUpClass(cls):
        import numpy as np
        cv2 = _cv2_of_niets()
        cls.map = Path(tempfile.mkdtemp())
        cls.video = cls.map / 'proef.mp4'
        schrijver = cv2.VideoWriter(str(cls.video), cv2.VideoWriter_fourcc(*'mp4v'), 25.0, (320, 180))
        for _ in range(25):
            schrijver.write(np.full((180, 320, 3), 30, np.uint8))
        schrijver.release()

        # Homografie-reeks voor de bewegende camera: op het worpmoment H_WORP, op het
        # landingsmoment H_LAND (de pan gebeurde terwijl de bal vloog).
        cls.homografie = cls.map / 'homografie.jsonl'
        with cls.homografie.open('w') as f:
            for t, h in ((3.0, H_WORP), (3.1, H_WORP), (4.5, H_LAND),
                         (9.0, H_WORP), (9.1, H_WORP), (10.0, H_WORP)):
                f.write(json.dumps({'t': t, 'bron': 'lijnen', 'fout_m': 0.0, 'H': h}) + '\n')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.map, ignore_errors=True)

    def _args(self, balbanen: Path, kalibratie: Path | None = None, homografie: Path | None = None):
        return SimpleNamespace(
            video=self.video, homografie=homografie, kalibratie=kalibratie,
            balbanen=balbanen, balspoor=None,
            diepte=10.0, breedte=14.0, speelveld=26.0,
            venster_start=0.4, venster_einde=2.0, bal_min_px=3, bal_max_px=30,
        )

    def _schrijf_banen(self, banen: list[dict]) -> Path:
        pad = self.map / f'banen_{id(banen)}.jsonl'
        with pad.open('w') as f:
            for baan in banen:
                f.write(json.dumps(baan) + '\n')
        return pad

    def test_werpplaats_gebruikt_de_matrix_van_het_worpmoment(self):
        # Regressie (doorlichting, ~r359): loslaatpixel (300,400) op t=3,1 is onder
        # H_WORP veldpunt (8, 6); de landing (900,400) op t=4,5 onder H_LAND (8, 22).
        # Echte afstand: 16 m. De oude code projecteerde het loslaatpixel met de
        # LANDINGSmatrix → (8, 10) → 12 m: precies de pan van 4 m te kort.
        banen = self._schrijf_banen([{
            'worp_s': 3.0,
            'los': {'t': 3.1, 'x': 300, 'y': 400},
            'landing': {'t': 4.5, 'x': 900, 'y': 400},
            'spoor': [[3.1, 300, 400], [4.5, 900, 400]],
        }])
        detecties = [{'match_id': 1, 'video_time_s': 3.0, 'event_type': 'worp',
                      'worp_type': None, 'confidence': 0.5}]
        verrijkt, _ = landing.video_landing(self._args(banen, homografie=self.homografie), detecties)
        self.assertEqual(verrijkt[0]['zone'], {'in_doelgebied': False, 'x_m': 8.0, 'y_m': 22.0})
        self.assertEqual(verrijkt[0]['afstand_m'], 16.0)

    def test_landing_buiten_de_lijnen_wordt_uitbal(self):
        # Regressie (doorlichting, ~r100): de landing projecteert op (8, 48) — 2 m
        # achter de uit-achterlijn (46). Vroeger geklemd op y=46 → doelpunt (+1);
        # nu een uitbal: zone leeg, 0 punten, wel geteld als gevonden landing.
        banen = self._schrijf_banen([{
            'worp_s': 9.0,
            'los': {'t': 9.1, 'x': 300, 'y': 400},
            'landing': {'t': 10.0, 'x': 2400, 'y': 400},
            'spoor': [[9.1, 300, 400], [10.0, 2400, 400]],
        }])
        detecties = [{'match_id': 1, 'video_time_s': 9.0, 'event_type': 'worp',
                      'worp_type': 'nekworp', 'confidence': 0.5, 'score_delta': 0}]
        verrijkt, rapport = landing.video_landing(self._args(banen, homografie=self.homografie), detecties)
        self.assertTrue(verrijkt[0].get('uitbal'))
        self.assertIsNone(verrijkt[0].get('zone'))
        self.assertEqual(verrijkt[0].get('score_delta', 0), 0)
        self.assertEqual(rapport['uitbal'], 1)
        self.assertEqual(rapport['met_landing'], 1)

    def test_vaste_camera_corrigeert_de_loslaathoogte_parallax(self):
        # Regressie (doorlichting, ~r361): camera op (7, −9) en 6 m hoog. Het
        # loslaatpixel projecteert op (7, 13.5) terwijl de werper op (7, 6) staat
        # (2 m loslaathoogte → d·h/(H−h) = 7,5 m parallax). Landing op (7, 38):
        # echte afstand 32 m; zonder correctie rapporteerde de code 24,5 m.
        kalibratie = self.map / 'kalibratie.json'
        kalibratie.write_text(json.dumps({
            'matrix_beeld_naar_veld': [[0.02, 0.0, 0.0], [0.0, 0.02, 0.0], [0.0, 0.0, 1.0]],
            'doelgebied_diepte_m': 10.0,
            'veld': {'breedte_m': 14.0, 'speelveld_m': 26.0},
            'camerastandpunt': {
                'gemeten': {'x_m': 7.0, 'y_m': -9.0, 'hoogte_m': 6.0, 'brandpunt_px': 1200.0},
                'oordeel': 'klopt',
            },
        }), encoding='utf-8')
        banen = self._schrijf_banen([{
            'worp_s': 3.0,
            'los': {'t': 3.1, 'x': 350, 'y': 675},
            'landing': {'t': 4.5, 'x': 350, 'y': 1900},
            'spoor': [[3.1, 350, 675], [4.5, 350, 1900]],
        }])
        detecties = [{'match_id': 1, 'video_time_s': 3.0, 'event_type': 'worp',
                      'worp_type': None, 'confidence': 0.5}]
        verrijkt, _ = landing.video_landing(self._args(banen, kalibratie=kalibratie), detecties)
        self.assertTrue(verrijkt[0]['zone']['in_doelgebied'])
        self.assertEqual(verrijkt[0]['afstand_m'], 32.0)


if __name__ == '__main__':
    unittest.main()
