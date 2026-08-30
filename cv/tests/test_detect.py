"""Unit-tests voor cv/detect_worpen.py — puur stdlib, geen video/cv2 nodig.

De piekdetectie wordt getest op synthetische energiereeksen (bekende pieken
moeten gevonden worden; plateaus en ruis niet), de demo-modus op exacte
reproduceerbaarheid met een seed en op de beloofde aantallen (weggelaten
labels + valse positieven), want daar steunt de zelfverificatie van de
demo-lus tegen evaluate.py op.
"""

from __future__ import annotations

import json
import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import detect_worpen as dw  # noqa: E402


def _reeks_met_pieken(lengte: int, pieken: dict[int, float], basis: float = 1.0) -> list[float]:
    """Vlakke basislijn met kleine deterministische ruis en injecteerde pieken."""
    rng = random.Random(1234)
    reeks = [basis + rng.uniform(-0.05, 0.05) for _ in range(lengte)]
    for index, hoogte in pieken.items():
        reeks[index] = basis + hoogte
    return reeks


class TestPiekdetectie(unittest.TestCase):
    def test_bekende_pieken_worden_gevonden(self):
        reeks = _reeks_met_pieken(300, {50: 5.0, 120: 4.0, 180: 3.0})
        pieken = dw.vind_pieken(reeks, min_afstand=10)
        self.assertEqual([i for i, _ in pieken], [50, 120, 180])

    def test_plateau_levert_geen_piek(self):
        # een camerazwaai houdt de energie seconden hoog: plateau, geen piek
        reeks = [0.0] * 50 + [5.0] * 30 + [0.0] * 50
        self.assertEqual(dw.vind_pieken(reeks, min_afstand=1), [])

    def test_ruis_onder_de_adaptieve_drempel(self):
        # uniforme ruis: max < mediaan + 3×MAD → geen enkele piek
        rng = random.Random(99)
        reeks = [rng.random() for _ in range(200)]
        self.assertEqual(dw.vind_pieken(reeks, k=3.0, min_afstand=1), [])

    def test_min_afstand_hoogste_piek_wint(self):
        reeks = _reeks_met_pieken(300, {100: 5.0, 105: 4.0})
        pieken = dw.vind_pieken(reeks, min_afstand=10)
        self.assertEqual([i for i, _ in pieken], [100])
        # met een kleiner venster mogen ze allebei blijven
        pieken = dw.vind_pieken(reeks, min_afstand=3)
        self.assertEqual([i for i, _ in pieken], [100, 105])

    def test_adaptieve_drempel_is_mediaan_plus_k_mad(self):
        reeks = [1.0, 1.0, 1.0, 2.0, 1.0, 0.0, 1.0]  # mediaan 1, MAD 0
        self.assertEqual(dw.adaptieve_drempel(reeks, k=3.0), 1.0)
        reeks = [0.0, 1.0, 2.0, 3.0, 4.0]  # mediaan 2, MAD 1
        self.assertEqual(dw.adaptieve_drempel(reeks, k=3.0), 5.0)

    def test_glad_lopend_gemiddelde(self):
        self.assertEqual(dw.glad_lopend_gemiddelde([0.0, 3.0, 0.0], 3), [1.5, 1.0, 1.5])
        # venster 1 = ongewijzigd
        self.assertEqual(dw.glad_lopend_gemiddelde([1.0, 2.0], 1), [1.0, 2.0])


class TestConfidence(unittest.TestCase):
    def test_afgekapt_op_bereik_en_plafond(self):
        confs = dw.bereken_confidences([10.0, 2.001, 6.0], drempel=2.0, plafond=0.95)
        self.assertEqual(confs[0], 0.95)  # hoogste piek = plafond
        self.assertEqual(confs[1], 0.05)  # amper boven de drempel → ondergrens
        self.assertTrue(all(0.05 <= c <= 0.95 for c in confs))

    def test_lager_plafond_zonder_pose(self):
        confs = dw.bereken_confidences([10.0], drempel=2.0,
                                       plafond=dw.CONF_PLAFOND_ZONDER_POSE)
        self.assertEqual(confs, [0.75])


def _demo_labels(n: int = 10, match_id: int = 42) -> list[dict]:
    return [
        {
            'match_id': match_id,
            'video_time_s': 30.0 * (i + 1),
            'event_type': 'worp',
            'worp_type': 'nekworp' if i % 2 == 0 else 'rugworp',
        }
        for i in range(n)
    ]


class TestDemoModus(unittest.TestCase):
    def test_zelfde_seed_zelfde_uitvoer(self):
        labels = _demo_labels()
        events_a, _ = dw.demo_detecties(labels, seed=7)
        events_b, _ = dw.demo_detecties(labels, seed=7)
        self.assertEqual(events_a, events_b)

    def test_andere_seed_andere_tijden(self):
        labels = _demo_labels()
        events_a, _ = dw.demo_detecties(labels, seed=7)
        events_b, _ = dw.demo_detecties(labels, seed=8)
        self.assertNotEqual(
            [e['video_time_s'] for e in events_a],
            [e['video_time_s'] for e in events_b],
        )

    def test_aantallen_exact_zoals_beloofd(self):
        # 10 labels, mis-fractie 0.2 → exact 2 weggelaten; vals=3 → 8 + 3 = 11 events
        events, rapport = dw.demo_detecties(_demo_labels(10), seed=1,
                                            mis_fractie=0.2, vals=3)
        self.assertEqual(rapport, {'gelezen': 10, 'weggelaten': 2, 'vals': 3})
        self.assertEqual(len(events), 11)

    def test_eventvorm_volgt_het_brugcontract(self):
        events, _ = dw.demo_detecties(_demo_labels(4), seed=3, vals=1)
        tijden = [e['video_time_s'] for e in events]
        self.assertEqual(tijden, sorted(tijden))
        for event in events:
            self.assertEqual(event['event_type'], 'worp')
            self.assertEqual(event['score_delta'], 0)
            self.assertIsNone(event['zone'])
            self.assertEqual(event['provenance'],
                             {'model': 'demo-ruis', 'model_version': dw.MODEL_VERSION})
            self.assertGreaterEqual(event['confidence'], dw.CONF_MIN)
            self.assertLessEqual(event['confidence'], dw.CONF_PLAFOND)
            self.assertGreaterEqual(event['video_time_s'], 0.0)


class TestDemoCli(unittest.TestCase):
    def test_demo_zonder_seed_faalt(self):
        with tempfile.TemporaryDirectory() as d:
            labelspad = Path(d) / 'labels.jsonl'
            labelspad.write_text(json.dumps(_demo_labels(1)[0]) + '\n', encoding='utf-8')
            with self.assertRaises(SystemExit) as ctx:
                dw.main(['--demo', str(labelspad)])
            self.assertNotEqual(ctx.exception.code, 0)

    def test_demo_einde_tot_einde_schrijft_jsonl(self):
        import io
        from contextlib import redirect_stdout

        with tempfile.TemporaryDirectory() as d:
            labelspad = Path(d) / 'labels.jsonl'
            with labelspad.open('w', encoding='utf-8') as f:
                for label in _demo_labels(5):
                    f.write(json.dumps(label) + '\n')
            uitpad = Path(d) / 'detecties.jsonl'
            buf = io.StringIO()
            with redirect_stdout(buf):
                dw.main(['--demo', str(labelspad), '--seed', '7', '--vals', '2',
                         '--mis-fractie', '0.2', '--uit', str(uitpad)])
            events = [json.loads(r) for r in
                      uitpad.read_text(encoding='utf-8').splitlines()]
        # 5 labels − round(0.2×5)=1 weggelaten + 2 vals = 6 events
        self.assertEqual(len(events), 6)
        self.assertIn('1 weggelaten', buf.getvalue())
        self.assertTrue(all(e['match_id'] == 42 for e in events))

    def test_video_en_demo_sluiten_elkaar_uit(self):
        with self.assertRaises(SystemExit) as ctx:
            dw.main([])  # geen video én geen --demo
        self.assertNotEqual(ctx.exception.code, 0)


if __name__ == '__main__':
    unittest.main()
