"""Contracttests voor sync.py tegen de vaste responsvorm van het platform.

De vorm hieronder is gespiegeld aan wat GET /api/cv/match/[id]/labels écht
teruggeeft (vastgelegd door tests/int/cv-brug.int.spec.ts): de events onder de
sleutel ``labels`` en de ploegnamen onder ``match.ploegen``. Precies op die
sleutels ging het eerder mis — sync.py las een zelfbedacht contract en synctte
stilletjes nul events. Deze test houdt beide kanten voortaan in de pas.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sync  # noqa: E402


def _plat_respons() -> dict:
    """De responsvorm van het labels-endpoint, één-op-één met de int-test."""
    return {
        'match': {
            'id': 42,
            'ploegen': {'home': 'RS Thuis', 'away': 'RS Uit'},
            'videoUrl': 'https://voorbeeld/wedstrijd.mp4',
            'videoOffsetH1': 12.0,
            'videoOffsetH2': None,
            'goalAreaDepth': 10,
        },
        'labels': [
            {
                'half': 1, 'gameClock': 30, 'video_time_s': 42.0,
                'event_type': 'worp', 'worp_type': 'nekworp', 'outcome': 'in_field',
                'landing': {'x_norm': 0.5, 'y_norm': 0.6, 'x_m': 7.0, 'y_m': 27.6},
                'speler': {'team': 'home', 'rugnummer': 7},
            },
            {
                'half': 1, 'gameClock': 55, 'video_time_s': 67.0,
                'event_type': 'worp', 'worp_type': 'rugworp', 'outcome': 'caught',
                'landing': {'x_norm': 0.5, 'y_norm': 0.4, 'x_m': 7.0, 'y_m': 18.4},
                'speler': {'team': 'away', 'rugnummer': 12},
            },
            {
                'half': 2, 'gameClock': 10, 'video_time_s': None,
                'event_type': 'doelpunt', 'worp_type': 'nekworp', 'outcome': 'goal',
                'landing': {'x_norm': 0.5, 'y_norm': 0.97, 'x_m': 7.0, 'y_m': 44.62},
                'speler': {'team': 'home', 'rugnummer': 4},
            },
        ],
        'rapport': {'totaal': 3, 'syncbaar': 2, 'nietSyncbaar': 1},
    }


class TestContract(unittest.TestCase):
    def _draai(self, tmp: Path, respons: dict) -> tuple[list[dict], str]:
        """Draai main() met een gemockte haal_labels en vang uitvoer + JSONL."""
        import io
        from contextlib import redirect_stdout

        uitpad = tmp / 'labels.jsonl'
        origineel = sync.haal_labels
        sync.haal_labels = lambda *a, **k: respons
        try:
            buf = io.StringIO()
            with redirect_stdout(buf):
                sync.main(['--match', '42', '--fps', '2', '--uit', str(uitpad), '--token', 'x'])
        finally:
            sync.haal_labels = origineel
        regels = [json.loads(r) for r in uitpad.read_text(encoding='utf-8').splitlines()]
        return regels, buf.getvalue()

    def test_leest_labels_en_ploegen_volgens_het_echte_contract(self):
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            labels, uitvoer = self._draai(Path(d), _plat_respons())
        # De twee syncbare events komen door; het derde mist zijn helft-offset.
        self.assertEqual(len(labels), 2)
        self.assertIn('2 van 3 events gesynct', uitvoer)
        self.assertIn('RS Thuis — RS Uit', uitvoer)
        self.assertIn('videoOffsetH2', uitvoer)
        # frame = round(video_time_s × fps)
        self.assertEqual(labels[0]['frame'], 84)
        # outcome verfijnt het event_type: caught → vangst.
        self.assertEqual(labels[0]['event_type'], 'worp')
        self.assertEqual(labels[1]['event_type'], 'vangst')

    def test_buitenspel_uit_outcome(self):
        respons = _plat_respons()
        respons['labels'][0]['outcome'] = 'out_side'
        respons['rapport'] = {'totaal': 3, 'syncbaar': 2, 'nietSyncbaar': 1}
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            labels, _ = self._draai(Path(d), respons)
        self.assertEqual(labels[0]['event_type'], 'buitenspel')

    def test_contractbreuk_faalt_hard(self):
        # Meldt het platform méér syncbare events dan wij lokaal telden (zoals bij
        # de vroegere sleutel-mismatch), dan moet de tool falen — niet stil slagen.
        respons = _plat_respons()
        respons['labels'] = []
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(SystemExit) as ctx:
                self._draai(Path(d), respons)
        self.assertNotEqual(ctx.exception.code, 0)


if __name__ == '__main__':
    unittest.main()
