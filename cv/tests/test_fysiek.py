"""Tests voor fysiek.py: loopafstand, sprintjes en topsnelheid per spoor/speler."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fysiek  # noqa: E402


def _spoor(track: int, stappen: list[tuple[float, float, float]]) -> list[dict]:
    return [{'t': t, 'track': track, 'x_m': x, 'y_m': y} for t, x, y in stappen]


class TestFysiekPerSpoor(unittest.TestCase):
    def test_afstand_en_topsnelheid(self):
        # 4 stappen van 2 m per 0,5 s = 8 m gelopen aan constant 4 m/s.
        posities = _spoor(1, [(0.0, 0.0, 0.0), (0.5, 0.0, 2.0), (1.0, 0.0, 4.0), (1.5, 0.0, 6.0), (2.0, 0.0, 8.0)])
        f = fysiek.fysiek_per_spoor(posities)[1]
        self.assertAlmostEqual(f['afstand_m'], 8.0)
        self.assertAlmostEqual(f['topsnelheid_m_s'], 4.0)
        self.assertAlmostEqual(f['actieve_s'], 2.0)

    def test_een_lange_sprint_telt_een_keer(self):
        # 3 s aan 5 m/s zonder onderbreking: één sprint, niet drie.
        stappen = [(i * 0.5, 0.0, i * 2.5) for i in range(7)]
        f = fysiek.fysiek_per_spoor(_spoor(1, stappen))[1]
        self.assertEqual(f['sprints'], 1)

    def test_twee_sprints_met_rust_ertussen(self):
        stappen = (
            [(i * 0.5, 0.0, i * 2.5) for i in range(4)]                      # sprint 1: 0–1,5 s aan 5 m/s
            + [(2.0 + i * 0.5, 0.0, 7.5 + 0.1 * i) for i in range(4)]        # wandelen
            + [(4.0 + i * 0.5, 0.0, 8.0 + i * 2.5) for i in range(4)]        # sprint 2
        )
        f = fysiek.fysiek_per_spoor(_spoor(1, stappen))[1]
        self.assertEqual(f['sprints'], 2)

    def test_korte_versnelling_is_geen_sprint(self):
        # Eén snelle stap van 0,5 s haalt de minimale sprintduur (1 s) niet.
        posities = _spoor(1, [(0.0, 0.0, 0.0), (0.5, 0.0, 2.5), (1.0, 0.0, 2.6)])
        f = fysiek.fysiek_per_spoor(posities)[1]
        self.assertEqual(f['sprints'], 0)

    def test_gaten_en_teleportaties_tellen_niet_mee(self):
        posities = _spoor(1, [
            (0.0, 0.0, 0.0), (0.5, 0.0, 1.0),
            (5.0, 0.0, 30.0),   # gat van 4,5 s: spoor was zoek
            (5.5, 0.0, 36.0),   # 12 m/s: identiteitswissel, geen menselijke stap
            (6.0, 0.0, 37.0),
        ])
        f = fysiek.fysiek_per_spoor(posities)[1]
        self.assertAlmostEqual(f['afstand_m'], 2.0)  # enkel de twee gewone stappen
        self.assertEqual(f['sprints'], 0)

    def test_demo_toewijzing_bundelt_acht_sporen_tot_acht_spelers(self):
        posities = []
        for track in range(1, 9):
            posities += _spoor(track, [(0.0, 1.0 * track, 0.0), (1.0, 1.0 * track, 3.0)])
        per_spoor = fysiek.fysiek_per_spoor(posities)
        spelers, anoniem = fysiek.bundel_per_speler(per_spoor, fysiek.demo_toewijzing())
        self.assertEqual(len(spelers), 8)
        self.assertEqual(anoniem, [])
        thuis = [s for s in spelers if s['team'] == 'thuis']
        self.assertEqual(sorted(s['rugnummer'] for s in thuis), [1, 2, 3, 4])

    def test_idwissel_twee_sporen_zelfde_rugnummer_tellen_op(self):
        posities = _spoor(1, [(0.0, 0.0, 0.0), (1.0, 0.0, 2.0)]) + _spoor(9, [(10.0, 0.0, 2.0), (11.0, 0.0, 5.0)])
        per_spoor = fysiek.fysiek_per_spoor(posities)
        spelers, anoniem = fysiek.bundel_per_speler(per_spoor, {
            '1': {'team': 'thuis', 'rugnummer': 7},
            '9': {'team': 'thuis', 'rugnummer': 7},
        })
        self.assertEqual(len(spelers), 1)
        self.assertAlmostEqual(spelers[0]['afstand_m'], 5.0)
        self.assertEqual(anoniem, [])

    def test_spoor_zonder_toewijzing_blijft_anoniem(self):
        per_spoor = fysiek.fysiek_per_spoor(_spoor(3, [(0.0, 0.0, 0.0), (1.0, 0.0, 1.0)]))
        spelers, anoniem = fysiek.bundel_per_speler(per_spoor, {})
        self.assertEqual(spelers, [])
        self.assertEqual(anoniem, [3])


if __name__ == '__main__':
    unittest.main()
