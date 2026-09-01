"""Tests voor goud.py: de gouden referentiewedstrijd (maatlat + synthetische wedstrijd).

Drie lagen, van puur naar end-to-end:

1. De rekenkern (scoor_assen) op verzonnen detecties versus labels — zonder video:
   een perfecte match hoort F1 1,0 en 0 m te geven, een verschoven meting exact de
   verschoven meters, en een uitbal-die-doelpunt-werd hoort apart geteld te worden.
2. De synthetische wedstrijd zelf: de weggeschreven labels moeten kloppen met wat er
   gerénderd is — een gelabeld landingspunt, door de gekende homografie geprojecteerd,
   moet in het frame van het landingsmoment ook echt een bal tonen.
3. Een end-to-end-rook: 12 s genereren, de landing-as van de maatlat erop draaien
   (zonder houdingsmodel) en nakijken dat het rapport eerlijk benoemt welke assen
   níét gemeten zijn.
"""

from __future__ import annotations

import atexit
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import goud  # noqa: E402
import veld  # noqa: E402


def _cv2_of_niets():
    try:
        import cv2  # noqa: PLC0415
        return cv2
    except ImportError:
        return None


def _label(t: float, x_m: float, y_m: float, worp_type: str = 'nekworp',
           in_doelgebied: bool = False, **extra) -> dict:
    basis = {
        'video_time_s': t, 'event_type': 'worp', 'worp_type': worp_type,
        'zone': {'in_doelgebied': in_doelgebied, 'x_m': x_m, 'y_m': y_m},
    }
    basis.update(extra)
    return basis


def _detectie(t: float, x_m: float | None = None, y_m: float | None = None,
              worp_type: str | None = 'nekworp', in_doelgebied: bool = False,
              **extra) -> dict:
    basis: dict = {'video_time_s': t, 'event_type': 'worp', 'worp_type': worp_type}
    if x_m is not None and y_m is not None:
        basis['zone'] = {'in_doelgebied': in_doelgebied, 'x_m': x_m, 'y_m': y_m}
    else:
        basis['zone'] = None
    basis.update(extra)
    return basis


class TestScoorAssen(unittest.TestCase):
    """De rekenkern: puur, zonder video — de cijfers moeten exact narekenbaar zijn."""

    def test_perfecte_match_geeft_f1_1_en_0_meter(self):
        labels = [_label(10.0, 7.0, 20.0, 'nekworp'), _label(20.0, 4.0, 40.0, 'rugworp'),
                  _label(30.0, 9.0, 12.0, 'nekworp')]
        detecties = [_detectie(10.0, 7.0, 20.0, 'nekworp'), _detectie(20.0, 4.0, 40.0, 'rugworp'),
                     _detectie(30.0, 9.0, 12.0, 'nekworp')]
        assen = goud.scoor_assen(labels, detecties, venster_s=2.0)
        self.assertEqual(assen['worpen']['f1'], 1.0)
        self.assertEqual(assen['moment']['mediaan_dt_s'], 0.0)
        self.assertEqual(assen['landing']['mediaan_m'], 0.0)
        self.assertEqual(assen['landing']['p90_m'], 0.0)
        self.assertEqual(assen['landing']['paren'], 3)
        self.assertEqual(assen['worptype']['accuraatheid'], 1.0)
        self.assertEqual(assen['uitbal']['als_doelpunt_gemeten'], 0)

    def test_verschoven_detectie_geeft_precies_de_verschoven_meters(self):
        # Een 3-4-5-driehoek: de landing 3 m opzij en 4 m dieper is exact 5 m fout, en
        # een halve seconde te laat is exact 0,5 s |Δt| — geen afronding, geen marge.
        labels = [_label(10.0, 7.0, 20.0)]
        detecties = [_detectie(10.5, 10.0, 24.0)]
        assen = goud.scoor_assen(labels, detecties, venster_s=2.0)
        self.assertEqual(assen['worpen']['tp'], 1)
        self.assertAlmostEqual(assen['moment']['mediaan_dt_s'], 0.5)
        self.assertAlmostEqual(assen['landing']['mediaan_m'], 5.0)

    def test_gemiste_worp_en_valse_positief_tellen_in_precisie_en_recall(self):
        labels = [_label(10.0, 7.0, 20.0), _label(30.0, 7.0, 20.0)]
        # Eén echte treffer en één detectie mijlenver naast elk label (vals alarm).
        detecties = [_detectie(10.2, 7.0, 20.0), _detectie(50.0, 1.0, 1.0)]
        assen = goud.scoor_assen(labels, detecties, venster_s=2.0)
        self.assertEqual((assen['worpen']['tp'], assen['worpen']['fp'], assen['worpen']['fn']),
                         (1, 1, 1))
        self.assertEqual(assen['worpen']['precision'], 0.5)
        self.assertEqual(assen['worpen']['recall'], 0.5)

    def test_uitbal_als_doelpunt_gemeten_wordt_apart_geteld(self):
        # Hét corruptiescenario uit de doorlichting: de bal ging over de achterlijn
        # (uitbal, plat dialect zonder zone) maar de keten meet een doelgebied-landing.
        labels = [{'video_time_s': 10.0, 'x_m': 7.0, 'y_m': 47.0,
                   'worp_type': 'rugworp', 'uitbal': True}]
        detecties = [_detectie(10.0, 7.0, 45.0, 'rugworp', in_doelgebied=True)]
        assen = goud.scoor_assen(labels, detecties, venster_s=2.0)
        self.assertEqual(assen['uitbal']['uit_labels'], 1)
        self.assertEqual(assen['uitbal']['als_doelpunt_gemeten'], 1)
        self.assertEqual(assen['uitbal']['juist_uit'], 0)
        # Het platte dialect draagt de landing tóch: de fout is meetbaar (2 m diep).
        self.assertAlmostEqual(assen['landing']['mediaan_m'], 2.0)

    def test_doelpunt_als_uitbal_gemeten_wordt_ook_geteld(self):
        labels = [_label(10.0, 7.0, 44.0, 'rugworp', in_doelgebied=True)]
        detecties = [{'video_time_s': 10.0, 'worp_type': 'rugworp', 'zone': None,
                      'uitbal': True, 'uitbal_x_m': 7.0, 'uitbal_y_m': 47.0}]
        assen = goud.scoor_assen(labels, detecties, venster_s=2.0)
        self.assertEqual(assen['uitbal']['doelpunt_als_uitbal_gemeten'], 1)
        # Het uitbal-punt van de detectie telt als landingsmeting: 3 m fout.
        self.assertAlmostEqual(assen['landing']['mediaan_m'], 3.0)

    def test_buitenspel_label_telt_als_uitbal_en_als_worp(self):
        # sync.py-dialect: een uitbal heet daar event_type 'buitenspel', zonder zone.
        labels = [{'video_time_s': 10.0, 'event_type': 'buitenspel',
                   'worp_type': 'nekworp', 'zone': None, 'x_m': 15.0, 'y_m': 30.0}]
        detecties = [{'video_time_s': 10.1, 'worp_type': 'nekworp', 'zone': None,
                      'uitbal': True, 'uitbal_x_m': 15.0, 'uitbal_y_m': 30.0}]
        assen = goud.scoor_assen(labels, detecties, venster_s=2.0)
        self.assertEqual(assen['labels'], 1)
        self.assertEqual(assen['uitbal']['juist_uit'], 1)
        self.assertEqual(assen['landing']['mediaan_m'], 0.0)

    def test_worptype_dialecten_nek_en_nekworp_zijn_hetzelfde(self):
        # houding.py zegt 'nek'/'rug', de labels 'nekworp'/'rugworp' — dat is géén fout.
        labels = [_label(10.0, 7.0, 20.0, 'nekworp'), _label(20.0, 7.0, 20.0, 'rugworp')]
        detecties = [_detectie(10.0, 7.0, 20.0, 'nek'), _detectie(20.0, 7.0, 20.0, 'rug')]
        assen = goud.scoor_assen(labels, detecties, venster_s=2.0)
        self.assertEqual(assen['worptype']['paren'], 2)
        self.assertEqual(assen['worptype']['accuraatheid'], 1.0)

    def test_afgewezen_en_vreemde_labels_tellen_niet_mee(self):
        labels = [
            _label(10.0, 7.0, 20.0),
            {'video_time_s': 20.0, 'event_type': 'time-out'},           # geen worp
            {**_label(30.0, 7.0, 20.0), 'verdict': 'afgewezen'},        # door een mens verworpen
        ]
        assen = goud.scoor_assen(labels, [_detectie(10.0, 7.0, 20.0)], venster_s=2.0)
        self.assertEqual(assen['labels'], 1)
        self.assertEqual(assen['labels_genegeerd'], 1)
        self.assertEqual(assen['labels_afgewezen'], 1)
        self.assertEqual(assen['worpen']['fn'], 0)


class TestWorpenPlan(unittest.TestCase):
    """Het worpenschema is de waarheid van de synthetische wedstrijd — dat moet kloppen."""

    def test_60_seconden_bevat_uitbal_en_doelgebied(self):
        plan = goud.worpen_plan(60.0)
        self.assertGreaterEqual(len(plan), 5)
        self.assertGreaterEqual(sum(1 for w in plan if w['uitbal']), 1)
        self.assertGreaterEqual(sum(1 for w in plan if w['in_doelgebied']), 1)
        # Geen worp die niet meer in de video past, en ruim uit elkaar (buiten het
        # zoekvenster van 6 s van landing.py — anders lekt de ene bal in het venster
        # van de andere worp).
        for a, b in zip(plan, plan[1:]):
            self.assertGreaterEqual(b['t'] - a['t'], 6.5)
        for worp in plan:
            self.assertLessEqual(worp['landing_t'] + 1.0, 60.0)

    def test_uitbal_en_doelgebied_spreken_de_veldregels(self):
        # De vlaggen in het plan moeten uit de échte veldgeometrie volgen, niet uit
        # een handmatig lijstje: anders liegt de waarheid zelf.
        lengte = veld.totale_lengte_m(10.0)
        for worp in goud.worpen_plan(60.0):
            x, y = worp['naar']
            buiten = x < -0.3 or x > veld.BREEDTE_M + 0.3 or y < -0.3 or y > lengte + 0.3
            self.assertEqual(worp['uitbal'], buiten, worp)
            if not buiten:
                self.assertEqual(
                    worp['in_doelgebied'],
                    veld.in_doelgebied(y / lengte, 10.0, x_norm=x / veld.BREEDTE_M), worp)

    def test_korte_wedstrijd_heeft_minstens_een_doelgebied_worp(self):
        # De CI-rook draait op ±10 s: dan moet er tóch al één worp zijn, en wel de
        # kernmeting (een doelgebied-landing) — die staat daarom vooraan in het schema.
        plan = goud.worpen_plan(12.0)
        self.assertEqual(len(plan), 1)
        self.assertTrue(plan[0]['in_doelgebied'])


# ---------------------------------------------------------------------------
# Synthetische wedstrijd + end-to-end: één keer genereren, twee keer gebruiken
# ---------------------------------------------------------------------------

_SYNT: dict | None = None


def _synthetische_wedstrijd() -> dict:
    """Genereer de korte gouden wedstrijd één keer voor alle tests hieronder."""
    global _SYNT
    if _SYNT is None:
        map_pad = Path(tempfile.mkdtemp(prefix='goud-test-'))
        atexit.register(shutil.rmtree, map_pad, ignore_errors=True)
        _SYNT = goud.maak_synthetisch(map_pad, duur_s=12.0)
    return _SYNT


@unittest.skipUnless(_cv2_of_niets(), 'opencv niet geïnstalleerd')
class TestSynthetischeWedstrijd(unittest.TestCase):
    def test_bestanden_en_kalibratiedialect(self):
        wedstrijd = _synthetische_wedstrijd()
        self.assertTrue(wedstrijd['video'].is_file())
        self.assertTrue(wedstrijd['labels'].is_file())
        data = json.loads(wedstrijd['kalibratie'].read_text(encoding='utf-8'))
        # Het dialect van calibrate.schrijf_kalibratie: dezelfde sleutels, 14 punten.
        for sleutel in ('versie', 'veld', 'punten', 'matrix_beeld_naar_veld',
                        'precisie_m_per_px', 'camerastandpunt'):
            self.assertIn(sleutel, data)
        self.assertEqual(len(data['punten']), 14)
        self.assertEqual(data['veld']['totale_lengte_m'], 46.0)

    def test_kalibratie_projecteert_de_punten_exact_terug(self):
        # De matrix en de aangeduide punten komen uit dezelfde gekende camera: beeld→veld
        # moet dan op elke millimeter na kloppen — en de oriëntatie (geen spiegelbeeld)
        # moet de bestaande toets van calibrate.py doorstaan.
        import calibrate  # noqa: PLC0415
        data = json.loads(_synthetische_wedstrijd()['kalibratie'].read_text(encoding='utf-8'))
        matrix = data['matrix_beeld_naar_veld']
        self.assertLess(calibrate.orientatie_det(matrix, data['punten']), 0)
        for punt in data['punten']:
            x_m, y_m = calibrate._projecteer(matrix, *punt['beeld_px'])
            self.assertAlmostEqual(x_m, punt['veld_m'][0], delta=0.02, msg=punt['label'])
            self.assertAlmostEqual(y_m, punt['veld_m'][1], delta=0.02, msg=punt['label'])

    def test_gelabelde_landing_staat_echt_in_beeld(self):
        # De labels moeten kloppen met wat er gerenderd is: projecteer het gelabelde
        # landingspunt door de gekende homografie (veld→beeld) en kijk in het frame van
        # het landingsmoment — dáár hoort de bal (bijna wit) te liggen, op het gras.
        cv2 = _cv2_of_niets()
        wedstrijd = _synthetische_wedstrijd()
        label = json.loads(wedstrijd['labels'].read_text(encoding='utf-8').splitlines()[0])
        camera = goud.synthetische_camera(0.0)
        beeld_x, beeld_y = goud.projecteer_3d(camera, (label['x_m'], label['y_m'], 0.0))

        cap = cv2.VideoCapture(str(wedstrijd['video']))
        cap.set(cv2.CAP_PROP_POS_FRAMES, round(label['landing_time_s'] * wedstrijd['fps']))
        ok, frame = cap.read()
        cap.release()
        self.assertTrue(ok)
        # Het helderste pixel in een klein venster rond de projectie: de balkleur is
        # (250,250,250), het gras donker — 200 scheidt ze ruim.
        x, y = int(round(beeld_x)), int(round(beeld_y))
        venster = frame[max(0, y - 4):y + 5, max(0, x - 4):x + 5]
        self.assertGreater(int(venster.max()), 200,
                           f'geen bal rond ({x}, {y}) op t={label["landing_time_s"]}')

    def test_pan_schrijft_een_kloppend_homografiespoor(self):
        # Bij --pan hoort er een spoor in het dialect van volg_veld.py te liggen, dat op
        # t=0 exact de kalibratie is en later écht meebeweegt met de pannende camera.
        from volg_veld import HomografieSpoor  # noqa: PLC0415
        map_pad = Path(tempfile.mkdtemp(prefix='goud-pan-'))
        self.addCleanup(shutil.rmtree, map_pad, ignore_errors=True)
        wedstrijd = goud.maak_synthetisch(map_pad, duur_s=7.0, pan=True)
        self.assertIsNotNone(wedstrijd['homografie'])
        spoor = HomografieSpoor.lees(wedstrijd['homografie'])
        kalibratie = json.loads(wedstrijd['kalibratie'].read_text(encoding='utf-8'))
        op_nul = spoor.op(0.0)
        for rij_spoor, rij_kal in zip(op_nul, kalibratie['matrix_beeld_naar_veld']):
            for a, b in zip(rij_spoor, rij_kal):
                self.assertAlmostEqual(a, b, places=6)
        # Halverwege de panperiode kijkt de camera elders: hetzelfde pixel moet dan op
        # een ándere veldplek uitkomen (anders pant er niets).
        import landing  # noqa: PLC0415
        vroeg = landing._projecteer(spoor.op(0.0), 480.0, 270.0)
        laat = landing._projecteer(spoor.op(5.0), 480.0, 270.0)
        self.assertGreater(abs(vroeg[1] - laat[1]), 0.5)


@unittest.skipUnless(_cv2_of_niets(), 'opencv niet geïnstalleerd')
class TestMaatlatEndToEnd(unittest.TestCase):
    def test_landing_as_meet_en_de_rest_is_eerlijk_niet_gemeten(self):
        # De rook uit de opdracht: 10-12 s synthetisch, de maatlat zonder houdingsmodel
        # erop, en het rapport moet (a) de landing echt in meters afrekenen en (b) de
        # assen benoemen die zonder rtmlib niet gemeten konden worden.
        wedstrijd = _synthetische_wedstrijd()
        uit = wedstrijd['video'].parent / 'rapport.json'
        goud.main([
            '--video', str(wedstrijd['video']),
            '--labels', str(wedstrijd['labels']),
            '--kalibratie', str(wedstrijd['kalibratie']),
            '--zonder-houding',  # deterministisch, óók op een machine mét rtmlib
            '--uit', str(uit),
        ])
        rapport = json.loads(uit.read_text(encoding='utf-8'))
        # Eerlijkheid: precies de houding-assen zijn niet gemeten, de landing wél.
        self.assertEqual(set(rapport['niet_gemeten']), {'worpen', 'moment', 'worptype'})
        self.assertTrue(rapport['keten']['landing']['gedraaid'])
        # En de meting zelf: de ene doelgebied-worp is gevonden én landt dicht bij de
        # gelabelde plek — de hele keten (bal-baan → homografie → veldmeters) klopt.
        landing_as = rapport['assen']['landing']
        self.assertEqual(landing_as['paren'], 1)
        self.assertLess(landing_as['mediaan_m'], 2.0)
        self.assertEqual(rapport['assen']['uitbal']['als_doelpunt_gemeten'], 0)


if __name__ == '__main__':
    unittest.main()
