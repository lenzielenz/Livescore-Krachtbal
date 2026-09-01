"""Unit-tests voor cv/evaluate.py — puur stdlib, geen video nodig.

Legt de matching- en metriekregels van het fase 1-acceptatierapport vast:
greedy één-op-één (dichtstbijzijnde eerst), dubbele detectie op één label =
één TP + één FP, detectie buiten het venster = FP (+ FN voor het label), de
precision/recall-formules en de 2×2-verwarringsmatrix voor nekworp/rugworp.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import evaluate  # noqa: E402


def _label(t: float, event_type: str = 'worp', worp_type: str | None = None) -> dict:
    return {'video_time_s': t, 'event_type': event_type, 'worp_type': worp_type}


def _detectie(t: float, worp_type: str | None = None) -> dict:
    return {'video_time_s': t, 'event_type': 'worp', 'worp_type': worp_type}


class TestMatching(unittest.TestCase):
    def test_dubbele_detectie_op_een_label_is_tp_plus_fp(self):
        m = evaluate.evalueer([_label(10.0)], [_detectie(9.9), _detectie(10.3)], venster=2.0)
        self.assertEqual((m['tp'], m['fp'], m['fn']), (1, 1, 0))
        self.assertEqual(m['precision'], 0.5)
        self.assertEqual(m['recall'], 1.0)
        # de dichtstbijzijnde (9.9, |Δt| 0.1) is de match
        self.assertAlmostEqual(m['gemiddelde_dt_s'], 0.1)

    def test_detectie_net_buiten_venster_is_fp(self):
        m = evaluate.evalueer([_label(10.0)], [_detectie(12.5)], venster=2.0)
        self.assertEqual((m['tp'], m['fp'], m['fn']), (0, 1, 1))
        self.assertEqual(m['precision'], 0.0)
        self.assertEqual(m['recall'], 0.0)
        self.assertEqual(m['f1'], 0.0)
        self.assertIsNone(m['gemiddelde_dt_s'])

    def test_venstergrens_telt_mee(self):
        # |Δt| exact = venster hoort er nog bij (<=)
        m = evaluate.evalueer([_label(10.0)], [_detectie(12.0)], venster=2.0)
        self.assertEqual(m['tp'], 1)

    def test_greedy_dichtstbijzijnde_eerst_maximaliseert_niet_maar_kiest_dichtst(self):
        # labels 10 en 11; detecties 10.4 en 10.9: (11↔10.9, Δ0.1) wint eerst,
        # daarna (10↔10.4, Δ0.4) — beide gematcht, elk hoogstens één keer.
        m = evaluate.evalueer(
            [_label(10.0), _label(11.0)],
            [_detectie(10.4), _detectie(10.9)],
            venster=2.0,
        )
        self.assertEqual((m['tp'], m['fp'], m['fn']), (2, 0, 0))
        self.assertAlmostEqual(m['gemiddelde_dt_s'], 0.25)

    def test_recall_formule(self):
        labels = [_label(t) for t in (10.0, 40.0, 70.0, 100.0)]
        detecties = [_detectie(t) for t in (10.2, 40.1, 69.5)]
        m = evaluate.evalueer(labels, detecties, venster=2.0)
        self.assertEqual((m['tp'], m['fp'], m['fn']), (3, 0, 1))
        self.assertEqual(m['recall'], 0.75)
        self.assertEqual(m['precision'], 1.0)
        self.assertAlmostEqual(m['f1'], 2 * 0.75 / 1.75)
        self.assertFalse(m['doel_gehaald'])  # 0.75 < 0.8

    def test_lege_invoer_geeft_nvt_geen_crash(self):
        m = evaluate.evalueer([], [], venster=2.0)
        self.assertIsNone(m['precision'])
        self.assertIsNone(m['recall'])
        self.assertIsNone(m['f1'])
        self.assertIsNone(m['doel_gehaald'])


class TestWorpMomenten(unittest.TestCase):
    def test_alle_vier_event_types_tellen_als_worp(self):
        # vangst/doelpunt/buitenspel zijn aflopen van een worp — allemaal worpen
        labels = [
            _label(10.0, 'worp'), _label(40.0, 'vangst'),
            _label(70.0, 'doelpunt'), _label(100.0, 'buitenspel'),
        ]
        detecties = [_detectie(t) for t in (10.0, 40.0, 70.0, 100.0)]
        m = evaluate.evalueer(labels, detecties, venster=2.0)
        self.assertEqual(m['labels'], 4)
        self.assertEqual(m['recall'], 1.0)
        self.assertEqual(m['labels_genegeerd'], 0)

    def test_onbekend_event_type_wordt_genegeerd(self):
        labels = [_label(10.0, 'worp'), _label(40.0, 'time-out')]
        m = evaluate.evalueer(labels, [_detectie(10.0)], venster=2.0)
        self.assertEqual(m['labels'], 1)
        self.assertEqual(m['labels_genegeerd'], 1)
        self.assertEqual(m['recall'], 1.0)

    def test_een_afgewezen_voorstel_telt_niet_als_worp(self):
        # Regressie: evalueer() negeerde het verdict-veld van groundtruth.py, waardoor een
        # detector die zijn eigen valse positieven herhaalt beloond werd — 1 bevestigd + 1
        # afgewezen label met detecties op beide meldde precision 1.00 waar 0.50 hoort.
        labels = [
            {'video_time_s': 10.0, 'event_type': 'worp', 'verdict': 'bevestigd'},
            {'video_time_s': 50.0, 'event_type': 'worp', 'verdict': 'afgewezen'},
        ]
        m = evaluate.evalueer(labels, [_detectie(10.1), _detectie(50.2)], venster=2.0)
        self.assertEqual(m['labels'], 1)
        self.assertEqual(m['labels_afgewezen'], 1)
        self.assertEqual(m['labels_genegeerd'], 0)
        self.assertEqual((m['tp'], m['fp'], m['fn']), (1, 1, 0))
        self.assertEqual(m['precision'], 0.5)
        self.assertEqual(m['recall'], 1.0)

    def test_labels_zonder_verdict_blijven_gewoon_meetellen(self):
        # Weak labels van sync.py dragen geen verdict — die mogen niet sneuvelen.
        m = evaluate.evalueer([_label(10.0)], [_detectie(10.0)], venster=2.0)
        self.assertEqual(m['labels'], 1)
        self.assertEqual(m['labels_afgewezen'], 0)


class TestVerwarringsmatrix(unittest.TestCase):
    def test_matrix_en_accuraatheid(self):
        labels = [
            _label(10.0, worp_type='nekworp'),
            _label(40.0, worp_type='nekworp'),
            _label(70.0, worp_type='rugworp'),
            _label(100.0, worp_type='nekworp'),  # match zonder worp_type aan detectiekant
            _label(130.0, worp_type=None),       # match zonder worp_type aan labelkant
        ]
        detecties = [
            _detectie(10.1, worp_type='nekworp'),   # juist
            _detectie(40.1, worp_type='rugworp'),   # fout: nek → rug
            _detectie(70.1, worp_type='rugworp'),   # juist
            _detectie(100.1, worp_type=None),
            _detectie(130.1, worp_type='nekworp'),
        ]
        m = evaluate.evalueer(labels, detecties, venster=2.0)
        wt = m['worp_type']
        # enkel de 3 paren met een worp_type aan béíde kanten tellen mee
        self.assertEqual(wt['paren'], 3)
        self.assertAlmostEqual(wt['accuraatheid'], 2 / 3)
        self.assertEqual(wt['verwarringsmatrix'], {
            'nekworp': {'nekworp': 1, 'rugworp': 1},
            'rugworp': {'nekworp': 0, 'rugworp': 1},
        })

    def test_geen_paren_met_worp_type(self):
        m = evaluate.evalueer([_label(10.0)], [_detectie(10.0)], venster=2.0)
        self.assertEqual(m['worp_type']['paren'], 0)
        self.assertIsNone(m['worp_type']['accuraatheid'])


class TestCli(unittest.TestCase):
    def _schrijf(self, pad: Path, events: list[dict]) -> None:
        with pad.open('w', encoding='utf-8') as f:
            for event in events:
                f.write(json.dumps(event) + '\n')

    def test_json_uitvoer_en_exitcode_0_bij_lage_scores(self):
        import io
        from contextlib import redirect_stdout

        with tempfile.TemporaryDirectory() as d:
            labelspad = Path(d) / 'labels.jsonl'
            detectiepad = Path(d) / 'detecties.jsonl'
            self._schrijf(labelspad, [_label(10.0), _label(40.0)])
            self._schrijf(detectiepad, [_detectie(200.0)])  # niets matcht: score 0
            buf = io.StringIO()
            with redirect_stdout(buf):
                # geen SystemExit: lage scores zijn een meting, geen fout
                evaluate.main(['--detecties', str(detectiepad),
                               '--labels', str(labelspad), '--json'])
        m = json.loads(buf.getvalue())
        self.assertEqual((m['tp'], m['fp'], m['fn']), (0, 1, 2))
        self.assertEqual(m['recall'], 0.0)
        self.assertFalse(m['doel_gehaald'])

    def test_onvindbaar_bestand_is_gebruiksfout(self):
        with tempfile.TemporaryDirectory() as d:
            labelspad = Path(d) / 'labels.jsonl'
            self._schrijf(labelspad, [_label(10.0)])
            with self.assertRaises(SystemExit) as ctx:
                evaluate.main(['--detecties', str(Path(d) / 'bestaat-niet.jsonl'),
                               '--labels', str(labelspad)])
            self.assertNotEqual(ctx.exception.code, 0)

    def test_nl_rapport_bevat_kernregels(self):
        import io
        from contextlib import redirect_stdout

        with tempfile.TemporaryDirectory() as d:
            labelspad = Path(d) / 'labels.jsonl'
            detectiepad = Path(d) / 'detecties.jsonl'
            self._schrijf(labelspad, [_label(10.0, worp_type='nekworp')])
            self._schrijf(detectiepad, [_detectie(10.2, worp_type='nekworp')])
            buf = io.StringIO()
            with redirect_stdout(buf):
                evaluate.main(['--detecties', str(detectiepad), '--labels', str(labelspad)])
        uitvoer = buf.getvalue()
        self.assertIn('Recall 1.000', uitvoer)
        self.assertIn('GEHAALD', uitvoer)
        self.assertIn('Verwarringsmatrix', uitvoer)


if __name__ == '__main__':
    unittest.main()
