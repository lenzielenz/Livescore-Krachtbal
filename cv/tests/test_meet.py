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
    def test_tracking_bemonstert_dichter_dan_de_event_detectie(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=True, seed=7,
            video=None, kalibratie=None, upload=False, fps=2.0, tracking=True, tracking_fps=4.0,
        )
        volg = _argv_van(stappen, 'videotracking')
        self.assertIn('--fps', volg)
        self.assertIn('4.0', volg)
        # De event-detectie houdt haar eigen (lagere) fps voor de framenummers.
        self.assertIn('2.0', _argv_van(stappen, 'kandidaat-worpen'))

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


class TestOpgemetenTerrein(unittest.TestCase):
    """Zonder kalibratie (demomodus) is het platform de enige bron van de echte maten."""

    def test_demo_geeft_de_opgemeten_maten_door_aan_landing_en_heatmap(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=True, seed=7,
            video=None, kalibratie=None, upload=False, fps=2.0, tracking=True,
            breedte=12.0, speelveld=20.0,
        )
        landing = _argv_van(stappen, 'landing')
        self.assertIn('--breedte', landing)
        self.assertIn('12.0', landing)
        self.assertIn('--speelveld', landing)
        self.assertIn('20.0', landing)
        heat = _argv_van(stappen, 'heatmap')
        self.assertIn('--speelveld', heat)
        # Ook de demo-sporen moeten op het opgemeten veld lopen, anders valt de helft
        # buiten het raster en klopt de demo-lus niet met de echte keten.
        volg = _argv_van(stappen, 'videotracking')
        self.assertIn('--breedte', volg)
        self.assertIn('--speelveld', volg)

    def test_reglementair_terrein_geeft_geen_vlaggen(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=True, seed=7,
            video=None, kalibratie=None, upload=False, fps=2.0, tracking=True,
        )
        landing = _argv_van(stappen, 'landing')
        self.assertNotIn('--breedte', landing)
        self.assertNotIn('--speelveld', landing)

    def test_maten_argumenten_laat_lege_maten_weg(self):
        self.assertEqual(meet.maten_argumenten(None, None), [])
        self.assertEqual(meet.maten_argumenten(12.0, None), ['--breedte', '12.0'])
        self.assertEqual(meet.maten_argumenten(None, 20.0), ['--speelveld', '20.0'])

    def test_waarschuwt_wanneer_de_kalibratie_andere_maten_heeft(self):
        import io
        import json
        import tempfile
        from contextlib import redirect_stderr

        with tempfile.TemporaryDirectory() as d:
            kal = Path(d) / 'kal.json'
            kal.write_text(json.dumps({'veld': {'breedte_m': 14.0, 'speelveld_m': 26.0}}), encoding='utf-8')
            buf = io.StringIO()
            with redirect_stderr(buf):
                meet.waarschuw_bij_afwijkende_kalibratie(kal, 12.0, 20.0)
            uitvoer = buf.getvalue()
            self.assertIn('breedte verschilt', uitvoer)
            self.assertIn('speelveld verschilt', uitvoer)
            # Gelijke maten: geen ruis.
            buf2 = io.StringIO()
            with redirect_stderr(buf2):
                meet.waarschuw_bij_afwijkende_kalibratie(kal, 14.0, 26.0)
            self.assertEqual(buf2.getvalue(), '')


class TestBewegendeCamera(unittest.TestCase):
    """Met een gsm in de hand klopt één vaste kalibratie na de eerste pan al niet meer;
    dan hoort volg_veld.py vooraan te staan en moeten landing en tracking dat spoor lezen."""

    def _stappen(self, **extra):
        return meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=False, seed=None,
            video=Path('match.mp4'), kalibratie=Path('kal.json'), upload=False, fps=2.0,
            **extra,
        )

    def test_het_veld_volgen_komt_voor_de_landing(self):
        stappen = self._stappen(bewegend=True)
        namen = [oms for oms, _ in stappen]
        volg = next(i for i, n in enumerate(namen) if 'volgen' in n)
        landing = next(i for i, n in enumerate(namen) if 'landing' in n)
        self.assertLess(volg, landing)
        argv = _argv_van(stappen, 'volgen')
        self.assertIn('match.mp4', argv)
        self.assertIn('kal.json', argv)
        self.assertIn(str(Path('m') / 'homografie.jsonl'), argv)

    def test_landing_rekent_met_het_spoor_in_plaats_van_een_vaste_matrix(self):
        landing = _argv_van(self._stappen(bewegend=True), 'landing')
        self.assertIn('--homografie', landing)
        self.assertIn(str(Path('m') / 'homografie.jsonl'), landing)

    def test_tracking_krijgt_hetzelfde_spoor_mee(self):
        volg = _argv_van(self._stappen(bewegend=True, tracking=True), 'videotracking')
        self.assertIn('--homografie', volg)

    def test_vaste_camera_blijft_zonder_extra_stap(self):
        namen = [oms for oms, _ in self._stappen()]
        self.assertFalse(any('volgen' in n for n in namen))
        self.assertNotIn('--homografie', _argv_van(self._stappen(), 'landing'))


class TestTracking(unittest.TestCase):
    def test_demo_met_tracking_en_upload_stuurt_fysiek_mee(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=True, seed=7,
            video=None, kalibratie=None, upload=True, fps=2.0, tracking=True,
        )
        volg = _argv_van(stappen, 'videotracking')
        self.assertIn('--demo', volg)
        fysiek = _argv_van(stappen, 'fysieke stats')
        self.assertIn(str(Path('m') / 'posities.jsonl'), fysiek)
        self.assertIn('--upload', fysiek)  # demo-toewijzing is bekend → meteen naar het platform
        heat = _argv_van(stappen, 'heatmap')
        self.assertIn(str(Path('m') / 'posities.jsonl'), heat)
        self.assertNotIn('--png', heat)  # zonder opencv geen PNG vragen (het JSON-raster telt)
        self.assertIn('heatmap', stappen[-1][0])

    def test_heatmap_png_alleen_met_opencv(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=True, seed=7,
            video=None, kalibratie=None, upload=False, fps=2.0, tracking=True, heatmap_png=True,
        )
        heat = _argv_van(stappen, 'heatmap')
        self.assertIn('--png', heat)

    def test_video_met_tracking_schrijft_sjabloon_en_uploadt_fysiek_niet(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=False, seed=None,
            video=Path('match.mp4'), kalibratie=Path('kal.json'), upload=True, fps=2.0, tracking=True,
        )
        volg = _argv_van(stappen, 'videotracking')
        self.assertIn('match.mp4', volg)
        self.assertIn('kal.json', volg)
        fysiek = _argv_van(stappen, 'fysieke stats')
        self.assertIn('--sjabloon', fysiek)
        self.assertIn(str(Path('m') / 'wie.json'), fysiek)
        # Wie-is-wie is nog niet ingevuld: fysiek uploaden kan pas ná de toewijzing.
        self.assertNotIn('--upload', fysiek)

    def test_heatmap_krijgt_de_kalibratie_mee_op_echte_video(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=False, seed=None,
            video=Path('match.mp4'), kalibratie=Path('kal.json'), upload=False, fps=2.0, tracking=True,
        )
        heat = _argv_van(stappen, 'heatmap')
        # Zonder de kalibratie zou het raster op een niet-reglementair terrein posities weggooien.
        self.assertIn('--kalibratie', heat)
        self.assertIn('kal.json', heat)

    def test_zonder_tracking_geen_extra_stappen(self):
        stappen = meet.bouw_stappen(
            match=42, uitmap=Path('m'), base='http://x', demo=True, seed=7,
            video=None, kalibratie=None, upload=False, fps=2.0,
        )
        self.assertTrue(all('tracking' not in oms and 'heatmap' not in oms for oms, _ in stappen))


if __name__ == '__main__':
    unittest.main()
