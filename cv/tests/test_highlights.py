"""Tests voor highlights.py (fase 4): selectie, vensters, namen en commando's."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import highlights  # noqa: E402


def _event(t: float, **extra) -> dict:
    basis = {
        'video_time_s': t, 'event_type': 'worp', 'worp_type': 'nekworp',
        'speler': {'team': 'home', 'rugnummer': 7}, 'score_delta': 0,
    }
    basis.update(extra)
    return basis


class TestSelectie(unittest.TestCase):
    def test_doelpunten_via_event_type_en_score_delta(self):
        events = [
            _event(10.0, event_type='doelpunt'),
            _event(20.0, score_delta=2),
            _event(30.0),  # gewone worp
        ]
        uit = highlights.selecteer(events, doelpunten=True, speler=None, team=None)
        self.assertEqual([e['video_time_s'] for e in uit], [10.0, 20.0])

    def test_filter_op_speler_en_team(self):
        events = [
            _event(10.0),
            _event(20.0, speler={'team': 'away', 'rugnummer': 7}),
            _event(30.0, speler={'team': 'home', 'rugnummer': 9}),
        ]
        uit = highlights.selecteer(events, doelpunten=False, speler=7, team='home')
        self.assertEqual([e['video_time_s'] for e in uit], [10.0])

    def test_zonder_videotijd_valt_af_en_uitvoer_is_gesorteerd(self):
        events = [_event(30.0), {'event_type': 'worp', 'video_time_s': None}, _event(10.0)]
        uit = highlights.selecteer(events, doelpunten=False, speler=None, team=None)
        self.assertEqual([e['video_time_s'] for e in uit], [10.0, 30.0])


class TestVensterEnNaam(unittest.TestCase):
    def test_venster_klemt_op_nul_zonder_de_naloop_op_te_rekken(self):
        start, duur = highlights.clipvenster(3.0, voorloop=8.0, naloop=5.0)
        self.assertEqual(start, 0.0)
        self.assertEqual(duur, 8.0)  # 3 s voorloop die er is + 5 s naloop

    def test_gewoon_venster(self):
        start, duur = highlights.clipvenster(100.0, voorloop=8.0, naloop=5.0)
        self.assertEqual((start, duur), (92.0, 13.0))

    def test_clipnaam_is_sprekend_en_veilig(self):
        naam = highlights.clipnaam(_event(754.0, event_type='doelpunt', worp_type='rugworp'), 3)
        self.assertEqual(naam, '03_doelpunt_12m34_rugworp_thuis7.mp4')

    def test_clipnaam_zonder_speler(self):
        naam = highlights.clipnaam({'video_time_s': 61.0, 'event_type': 'worp'}, 1)
        self.assertEqual(naam, '01_worp_01m01.mp4')


class TestCommandos(unittest.TestCase):
    def test_hercoderen_is_de_standaard(self):
        cmd = highlights.ffmpeg_commando(Path('a.mp4'), Path('uit.mp4'), 92.0, 13.0, kopie=False)
        self.assertIn('libx264', cmd)
        self.assertIn('+faststart', cmd)
        # Snelle seek: -ss stáát vóór -i.
        self.assertLess(cmd.index('-ss'), cmd.index('-i'))

    def test_kopie_knipt_zonder_hercodering(self):
        cmd = highlights.ffmpeg_commando(Path('a.mp4'), Path('uit.mp4'), 0.0, 13.0, kopie=True)
        self.assertIn('copy', cmd)
        self.assertNotIn('libx264', cmd)

    def test_concat_lijst(self):
        tekst = highlights.concat_lijst([Path('clips/01.mp4'), Path('clips/02.mp4')])
        self.assertEqual(tekst, "file 'clips/01.mp4'\nfile 'clips/02.mp4'\n")


if __name__ == '__main__':
    unittest.main()
