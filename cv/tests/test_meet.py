"""Tests voor meet.py: het stappenplan is de plumbing — die moet exact kloppen."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import meet  # noqa: E402


def _argv_van(stappen, omschrijving_deel: str) -> list[str]:
    for omschrijving, argv in stappen:
        if omschrijving_deel in omschrijving:
            return argv
    raise AssertionError(f'stap "{omschrijving_deel}" niet gevonden')


class TestStappenplan(unittest.TestCase):
    def test_demo_lus_in_de_juiste_volgorde_met_doorgegeven_bestanden(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=True, seed=7,
            video=None, kalibratie=None, upload=True, fps=2.0,
        )
        namen = [oms for oms, _ in stappen]
        self.assertEqual(len(namen), 6)  # sync, detect, landing, spelers, rapport, upload
        # Elke stap leest wat de vorige schreef.
        self.assertIn(str(Path('m') / 'labels.jsonl'), _argv_van(stappen, 'sync'))
        detect = _argv_van(stappen, 'kandidaat-worpen')
        self.assertIn('--demo', detect)
        self.assertIn(str(Path('m') / 'labels.jsonl'), detect)
        self.assertIn('--match', detect)
        landing = _argv_van(stappen, 'landing')
        self.assertIn(str(Path('m') / 'detecties.jsonl'), landing)
        spelers = _argv_van(stappen, 'spelers')
        self.assertIn(str(Path('m') / 'met_landing.jsonl'), spelers)
        rapport = _argv_van(stappen, 'RAPPORT')
        self.assertIn(str(Path('m') / 'met_spelers.jsonl'), rapport)
        upload = _argv_van(stappen, 'uploaden')
        self.assertIn(str(Path('m') / 'met_spelers.jsonl'), upload)
        self.assertIn('--bestand', upload)

    def test_videomodus_geeft_video_positioneel_aan_de_detector(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=False, seed=None,
            video=Path('match.mp4'), kalibratie=Path('kal.json'), upload=False, fps=2.0,
        )
        detect = _argv_van(stappen, 'kandidaat-worpen')
        # detect_worpen.py neemt de video positioneel — géén --video-vlag.
        self.assertIn('match.mp4', detect)
        self.assertNotIn('--video', detect)
        self.assertNotIn('--demo', detect)
        landing = _argv_van(stappen, 'landing')
        self.assertIn('--kalibratie', landing)
        self.assertIn('kal.json', landing)
        # Zonder --upload: vijf stappen, het rapport is de laatste.
        self.assertEqual(len(stappen), 5)
        self.assertIn('RAPPORT', stappen[-1][0])


if __name__ == '__main__':
    unittest.main()
