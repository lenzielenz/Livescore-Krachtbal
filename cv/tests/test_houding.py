#!/usr/bin/env python3
"""Worpen herkennen aan de houding — de rekenkern, zonder model en zonder video.

Het model levert per speler zeventien gewrichten; wat je daarmee doet is gewone meetkunde, en
dát wordt hier nagerekend met verzonnen skeletten. Zo staat de beslislogica vast vóór er ook
maar één gewicht gedownload is.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import houding  # noqa: E402


def skelet(schouder_y=100.0, heup_y=200.0, pols_y=140.0, pols_x=300.0, schaal=1.0, zeker=0.9):
    """Een COCO-17-skelet met de gewrichten die er hier toe doen.

    `schaal` maakt de speler groter of kleiner in beeld (verder weg of dichterbij) zonder de
    verhoudingen te veranderen — precies waar de normalisatie op romphoogte tegen moet kunnen.
    """
    punten = [[0.0, 0.0] for _ in range(17)]
    scores = [zeker] * 17
    mid = 300.0
    punten[houding.L_SCHOUDER] = [mid - 20 * schaal, schouder_y * schaal]
    punten[houding.R_SCHOUDER] = [mid + 20 * schaal, schouder_y * schaal]
    punten[houding.L_HEUP] = [mid - 15 * schaal, heup_y * schaal]
    punten[houding.R_HEUP] = [mid + 15 * schaal, heup_y * schaal]
    punten[houding.L_POLS] = [pols_x * schaal, pols_y * schaal]
    punten[houding.R_POLS] = [(pols_x + 10) * schaal, pols_y * schaal]
    return punten, scores


class TestMaten(unittest.TestCase):
    def test_romphoogte_is_schouder_tot_heup(self):
        p, s = skelet(schouder_y=100.0, heup_y=200.0)
        self.assertAlmostEqual(houding.romphoogte(p, s), 100.0, places=6)

    def test_polshoogte_telt_boven_de_schouders_positief(self):
        boven = houding.polshoogte(*skelet(schouder_y=100.0, heup_y=200.0, pols_y=40.0))
        onder = houding.polshoogte(*skelet(schouder_y=100.0, heup_y=200.0, pols_y=160.0))
        self.assertAlmostEqual(boven, 0.6, places=6)     # 60 px boven, romp 100 px
        self.assertAlmostEqual(onder, -0.6, places=6)
        self.assertGreater(boven, 0)
        self.assertLess(onder, 0)

    def test_dezelfde_houding_meet_hetzelfde_veraf_en_dichtbij(self):
        # Dít is waarom er op romphoogte genormaliseerd wordt: een speler achteraan het veld
        # mag niet minder tellen dan eentje vlak voor de camera.
        dichtbij = houding.polshoogte(*skelet(schouder_y=100.0, heup_y=200.0, pols_y=40.0, schaal=1.0))
        veraf = houding.polshoogte(*skelet(schouder_y=100.0, heup_y=200.0, pols_y=40.0, schaal=0.35))
        self.assertAlmostEqual(dichtbij, veraf, places=6)

    def test_onzekere_gewrichten_tellen_niet_mee(self):
        p, s = skelet()
        s[houding.L_POLS] = s[houding.R_POLS] = 0.05
        self.assertIsNone(houding.polshoogte(p, s))
        self.assertIsNone(houding.polspositie(p, s))

    def test_zonder_heupen_geen_maatstok(self):
        p, s = skelet()
        s[houding.L_HEUP] = s[houding.R_HEUP] = 0.05
        self.assertIsNone(houding.romphoogte(p, s))


class TestWorpscore(unittest.TestCase):
    def _staat(self, pols_y, pols_x):
        p, s = skelet(pols_y=pols_y, pols_x=pols_x)
        return {'polshoogte': houding.polshoogte(p, s), 'romp': houding.romphoogte(p, s),
                'pols': houding.polspositie(p, s)}

    def test_hoog_en_ver_scoort(self):
        # De maat is de afgelegde weg × de polshoogte, niet de snelheid: 0,8 romp opzij met de
        # polsen ruim boven de schouders.
        vorige = self._staat(pols_y=40.0, pols_x=300.0)
        huidige = self._staat(pols_y=40.0, pols_x=380.0)   # 80 px = 0,8 romp opzij
        self.assertGreater(houding.worpscore(vorige, huidige), 0.4)

    def test_dezelfde_beweging_scoort_hetzelfde_op_elke_stand(self):
        # Dít is de reden dat de maat de weg is en niet de snelheid: hij mag niet afhangen van
        # hoe fijn er bemonsterd wordt, anders betekent een getrainde drempel op "ultra" iets
        # anders dan op "gewoon" en werkt meer rekenkracht tegen je.
        vorige = self._staat(pols_y=40.0, pols_x=300.0)
        huidige = self._staat(pols_y=40.0, pols_x=380.0)
        traag = houding.worpscore(vorige, huidige, 0.2)
        snel = houding.worpscore(vorige, huidige, 0.04)
        self.assertAlmostEqual(traag, snel)

    def test_hoog_maar_stil_scoort_niet(self):
        staat = self._staat(pols_y=40.0, pols_x=300.0)
        self.assertEqual(houding.worpscore(staat, staat, 0.2), 0.0)

    def test_snel_maar_laag_scoort_niet(self):
        # Sprinten met de armen laag is geen worp.
        vorige = self._staat(pols_y=180.0, pols_x=300.0)
        huidige = self._staat(pols_y=180.0, pols_x=400.0)
        self.assertEqual(houding.worpscore(vorige, huidige, 0.2), 0.0)

    def test_zonder_meting_geen_score(self):
        self.assertEqual(houding.worpscore({}, {}), 0.0)
        # Een ontbrekende pols of romp geeft geen score in plaats van een uitzondering.
        self.assertEqual(houding.worpscore({'pols': (1.0, 2.0)}, {'polshoogte': 0.5, 'romp': 100.0}), 0.0)


class TestWorpenVinden(unittest.TestCase):
    def _reeks(self, pieken, duur=60.0, stap=0.2, ruis=0.2):
        """Een rustige reeks met scherpe pieken op de opgegeven momenten."""
        reeks = []
        t = 0.0
        while t < duur:
            score = ruis
            for p in pieken:
                if abs(t - p) < 0.21:
                    score = 3.0 - 4 * abs(t - p)
            reeks.append({'t': round(t, 2), 'score': score, 'polshoogte': 0.1})
            t += stap
        return reeks

    def test_vindt_de_pieken_terug(self):
        echt = [8.0, 21.0, 35.0, 50.0]
        gevonden = houding.vind_worpmomenten(self._reeks(echt))
        self.assertEqual(len(gevonden), len(echt))
        for w, (t, _s) in zip(echt, gevonden):
            self.assertAlmostEqual(t, w, delta=0.3)

    def test_ruis_onder_de_drempel_telt_niet_mee(self):
        self.assertEqual(houding.vind_worpmomenten(self._reeks([], ruis=0.9)), [])

    def test_twee_pieken_vlak_na_elkaar_zijn_een_worp(self):
        # Aanloop en zwaai geven twee toppen; dat is één worp, geen twee.
        gevonden = houding.vind_worpmomenten(self._reeks([20.0, 21.0]), min_afstand_s=3.0)
        self.assertEqual(len(gevonden), 1)

    def test_de_eerste_piek_boven_de_drempel_wint_van_een_sterkere_vlak_erna(self):
        # De vangst — de vanger die vlak ná de worp snel de armen heft — scoort vaak hóger dan
        # de worp zelf. Won de sterkste piek, dan schoof het moment naar de vangst en kreeg het
        # event de werper en positie van de vánger. Het loslaten is de eerste piek van de groep.
        reeks = []
        t = 0.0
        while t < 40.0:
            score = 0.2
            if abs(t - 20.0) < 0.01:
                score = 0.9      # de worp
            if abs(t - 21.4) < 0.01:
                score = 1.4      # de vangst, sterker
            reeks.append({'t': round(t, 2), 'score': score, 'polshoogte': 0.1})
            t += 0.2
        gevonden = houding.vind_worpmomenten(reeks, drempel=0.45, min_afstand_s=3.0)
        self.assertEqual(gevonden, [(20.0, 0.9)])


class TestWorpType(unittest.TestCase):
    def _reeks(self, hoogtes, rond=10.0, stap=0.2):
        return [{'t': round(rond - 0.6 + i * stap, 2), 'score': 0.0, 'polshoogte': h}
                for i, h in enumerate(hoogtes)]

    def test_nekworp_als_de_polsen_eerst_hoog_zijn_en_dan_zakken(self):
        # Bal boven het hoofd, zwaai naar voren: hoog vóór het loslaten, laag erna.
        reeks = self._reeks([0.5, 0.6, 0.7, 0.3, 0.1, 0.0, -0.1])
        self.assertEqual(houding.worp_type(reeks, 10.0), 'nek')

    def test_rugworp_als_de_polsen_pas_erna_omhoog_komen(self):
        # Ruggelings over het hoofd: laag vóór, hoog erna.
        reeks = self._reeks([0.0, 0.05, 0.1, 0.4, 0.6, 0.7, 0.6])
        self.assertEqual(houding.worp_type(reeks, 10.0), 'rug')

    def test_bij_twijfel_wordt_er_niets_beweerd(self):
        reeks = self._reeks([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3])
        self.assertIsNone(houding.worp_type(reeks, 10.0))
        self.assertIsNone(houding.worp_type([], 10.0))

    def test_leest_de_hoogtes_van_de_werper_niet_die_van_de_vanger(self):
        # De vanger (speler 2) heft ná de worp zelf de armen: het frame-maximum blijft dan hoog
        # hangen en een zuivere nekworp wordt "geen van beide". Per speler bijgehouden hoogtes
        # laten het type over de reeks van de wérper (speler 1) beslissen.
        reeks = []
        for i, h in enumerate([0.5, 0.6, 0.7]):        # de werper vóór het loslaten: hoog
            reeks.append({'t': 9.4 + 0.2 * i, 'score': 0.2, 'polshoogte': h,
                          'hoogtes': {1: h, 2: -0.5}})
        reeks.append({'t': 10.0, 'score': 0.9, 'polshoogte': 0.7, 'werper': 1,
                      'hoogtes': {1: 0.7, 2: -0.5}})
        for i, h in enumerate([0.1, 0.0, -0.1]):       # de werper erna laag, de vanger hoog
            reeks.append({'t': 10.2 + 0.2 * i, 'score': 0.2, 'polshoogte': 0.8,
                          'hoogtes': {1: h, 2: 0.8}})
        self.assertEqual(houding.worp_type(reeks, 10.0), 'nek')
        # Na een JSON-rondgang (--reeks-uit, --hervat) zijn de sleutels tekst geworden.
        for r in reeks:
            r['hoogtes'] = {str(k): v for k, v in r['hoogtes'].items()}
        self.assertEqual(houding.worp_type(reeks, 10.0), 'nek')


class TestVertrouwen(unittest.TestCase):
    def test_blijft_onder_de_een(self):
        # Een voorstel voor de reviewlaan mag nooit als zekerheid binnenkomen.
        for score in (0.0, 1.2, 5.0, 50.0):
            self.assertLessEqual(houding.vertrouwen(score), 0.9)
            self.assertGreaterEqual(houding.vertrouwen(score), 0.05)

    def test_stijgt_met_de_score(self):
        self.assertLess(houding.vertrouwen(1.3), houding.vertrouwen(3.0))


class TestGedeeldeVerschuiving(unittest.TestCase):
    """Wat iedereen samen bewoog is de camera — en alleen dát mag van de polsweg af."""

    def test_mediaan_bij_drie_of_meer_stemt_de_werper_weg(self):
        # Twee omstanders schuiven 80 px mee met de pan; de derde (de werper) beweegt zelf.
        pan = houding.gedeelde_verschuiving([(80.0, 0.0), (78.0, 2.0), (0.0, 0.0)])
        self.assertEqual(pan, (78.0, 0.0))

    def test_een_speler_is_zijn_eigen_referentie(self):
        # Alleen in beeld: zijn heupverschuiving ís de beste schatting van de pan. Staat hij
        # stil terwijl de camera pant, dan schuift zijn heup precies mee; werpt hij echt, dan
        # staat zijn heup nagenoeg stil en verandert er niets (zie de test hieronder).
        self.assertEqual(houding.gedeelde_verschuiving([(80.0, 0.0)]), (80.0, 0.0))

    def test_twee_spelers_alleen_wat_beiden_minstens_deden(self):
        # Een mediaan over twee is een gemiddelde: één wandelaar zou dan de helft van zijn
        # eigen beweging bij de ander aftrekken. Alleen het gedeelde deel telt.
        self.assertEqual(houding.gedeelde_verschuiving([(80.0, 0.0), (60.0, 0.0)]), (60.0, 0.0))
        self.assertEqual(houding.gedeelde_verschuiving([(-80.0, 0.0), (-60.0, 0.0)]), (-60.0, 0.0))
        # Eén wandelaar naast een stilstaande speler: niets gedeeld, niets aftrekken.
        self.assertEqual(houding.gedeelde_verschuiving([(80.0, 0.0), (0.0, 0.0)]), (0.0, 0.0))

    def test_zonder_spelers_geen_verschuiving(self):
        self.assertEqual(houding.gedeelde_verschuiving([]), (0.0, 0.0))


class TestCamerapan(unittest.TestCase):
    """Camerabeweging telt niet als worp — en een meegepande zwiep telt wél."""

    def _staat(self, pols=(300.0, 40.0), heup=(300.0, 200.0)):
        return {'polshoogte': 0.6, 'romp': 100.0, 'pols': pols, 'heup': heup}

    def test_pan_gaat_van_de_polsweg_af(self):
        # Het recept uit de doorlichting: niets bewoog behalve de camera (80 px). Zonder
        # correctie scoort dat 0,48 — boven de drempel van 0,45, een spookworp.
        vorige = self._staat(pols=(300.0, 40.0))
        huidige = self._staat(pols=(380.0, 40.0))
        self.assertAlmostEqual(houding.worpscore(vorige, huidige), 0.48, places=6)
        self.assertEqual(houding.worpscore(vorige, huidige, pan=(80.0, 0.0)), 0.0)

    def test_meegepande_camera_geeft_de_zwiep_terug(self):
        # De camera volgt de zwaai: in beeld staat de pols stil, maar het beeld schoof −80 px.
        # Zonder correctie is deze worp voorgoed weg uit de zoekpassage.
        staat = self._staat(pols=(300.0, 40.0))
        self.assertEqual(houding.worpscore(staat, staat), 0.0)
        self.assertAlmostEqual(houding.worpscore(staat, staat, pan=(-80.0, 0.0)), 0.48, places=6)

    def test_camerapan_bij_ziet_de_gedeelde_heupverschuiving(self):
        geschiedenis = {
            1: [(0.0, self._staat(heup=(300.0, 200.0)))],
            2: [(0.0, self._staat(heup=(700.0, 200.0)))],
        }
        nu = {1: self._staat(heup=(380.0, 200.0)), 2: self._staat(heup=(780.0, 200.0))}
        self.assertEqual(houding.camerapan_bij(geschiedenis, nu), {0.0: (80.0, 0.0)})

    def test_wachtende_vanger_scoort_niet_bij_een_pan(self):
        # Armen omhoog en stilstaan terwijl de camera 80 px pant: pols én heup schuiven mee.
        toen = self._staat(pols=(300.0, 40.0), heup=(300.0, 200.0))
        nu_staat = self._staat(pols=(380.0, 40.0), heup=(380.0, 200.0))
        pan_bij = houding.camerapan_bij({1: [(0.0, toen)]}, {1: nu_staat})
        score, _venster = houding.beste_worpscore([(0.0, toen)], nu_staat, 0.2, pan_bij=pan_bij)
        self.assertEqual(score, 0.0)

    def test_een_enkele_werper_zonder_omstanders_behoudt_zijn_score(self):
        # Wérpt hij echt, dan blijft zijn heup staan en verandert de pan-correctie niets —
        # ook zonder omstanders om de camera aan te ijken.
        toen = self._staat(pols=(300.0, 40.0), heup=(300.0, 200.0))
        nu_staat = self._staat(pols=(380.0, 40.0), heup=(300.0, 200.0))
        pan_bij = houding.camerapan_bij({1: [(0.0, toen)]}, {1: nu_staat})
        score, _venster = houding.beste_worpscore([(0.0, toen)], nu_staat, 0.2, pan_bij=pan_bij)
        self.assertAlmostEqual(score, 0.48, places=6)


class TestHervatpunt(unittest.TestCase):
    """De naad van een onderbroken meting: geen dubbel tijdstip, geen koud venster, geen
    botsende werper-nummers."""

    def test_gooit_de_overlap_weg_en_hervat_een_venster_eerder(self):
        eerder = [{'t': round(0.2 * i, 3), 'score': 0.1, 'werper': i % 3} for i in range(1, 51)]
        behouden, vanaf, eerste = houding.hervatpunt(eerder)
        # De laatste meting (mogelijk afgekapt) gaat eraf; daarna een vol venster terug.
        self.assertAlmostEqual(vanaf, 9.8 - houding.VENSTER_HOOG_S, places=9)
        # De overlap wordt opnieuw gemeten en mag dus niet óók bewaard blijven: anders staat
        # het naadtijdstip er straks twee keer in, de oude score naast een verse 0,0.
        self.assertTrue(all(r['t'] < vanaf for r in behouden))
        self.assertTrue(behouden)
        # De werper-nummering telt verder boven wat al vergeven was (0, 1 en 2).
        self.assertEqual(eerste, 3)

    def test_telt_ook_de_ids_uit_hoogtes_mee(self):
        # Na een JSON-rondgang zijn de hoogtes-sleutels tekst; ook die nummers zijn vergeven.
        eerder = [{'t': 1.0, 'score': 0.1, 'hoogtes': {'7': 0.5}},
                  {'t': 2.0, 'score': 0.1, 'werper': 1},
                  {'t': 3.0, 'score': 0.1}]
        _behouden, _vanaf, eerste = houding.hervatpunt(eerder)
        self.assertEqual(eerste, 8)

    def test_lege_of_te_korte_reeks_begint_gewoon_opnieuw(self):
        self.assertEqual(houding.hervatpunt([]), ([], 0.0, 0))
        self.assertEqual(houding.hervatpunt([{'t': 0.1, 'score': 0.0}]), ([], 0.0, 0))



def _cv2_of_niets():
    try:
        import cv2  # noqa: PLC0415
        return cv2
    except ImportError:
        return None


@unittest.skipUnless(_cv2_of_niets(), 'opencv niet geïnstalleerd')
class TestVideolaag(unittest.TestCase):
    """De hele keten van video tot voorstellen, met een nagemaakt model.

    Alles behalve het model zelf: het bemonsteren van de beelden, de tijdstippen, het volgen
    van dezelfde speler tussen twee beelden, het vinden van de pieken en de events die eruit
    komen. Zo staat de keten vast zonder dat er één gewicht gedownload hoeft te zijn.
    """

    @classmethod
    def setUpClass(cls):
        import tempfile
        import numpy as np
        cv2 = _cv2_of_niets()
        cls.map = tempfile.mkdtemp()
        cls.video = Path(cls.map) / 'proef.mp4'
        schrijver = cv2.VideoWriter(str(cls.video), cv2.VideoWriter_fourcc(*'mp4v'), 25.0, (320, 180))
        for _ in range(25 * 20):                       # 20 seconden
            schrijver.write(np.zeros((180, 320, 3), np.uint8))
        schrijver.release()

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls.map, ignore_errors=True)

    def _model(self, worpen, fps=5.0):
        """Nagemaakt model: één speler die op de opgegeven momenten werpt."""
        teller = {'n': 0}

        def model(_frame):
            t = teller['n'] / fps
            teller['n'] += 1
            werpt = any(0.0 <= t - w < 0.45 for w in worpen)
            # Tijdens de worp: polsen hoog én ver opzij (snelle zwaai); anders laag en stil.
            pols_y, pols_x = (40.0, 300.0 + 90.0 * ((t * fps) % 2)) if werpt else (170.0, 300.0)
            punten, scores = skelet(schouder_y=100.0, heup_y=200.0, pols_y=pols_y, pols_x=pols_x)
            return [punten], [scores]

        return model

    def test_vindt_de_geschreven_worpen_terug(self):
        worpen = [4.0, 9.0, 15.0]
        reeks = houding.meet_video(self.video, self._model(worpen), analyse_fps=5.0)
        self.assertGreater(len(reeks), 50)
        gevonden = houding.vind_worpmomenten(reeks)
        self.assertEqual(len(gevonden), len(worpen))
        for w, (t, _s) in zip(worpen, gevonden):
            self.assertAlmostEqual(t, w, delta=0.6)

    def test_events_hebben_de_vorm_die_de_reviewlaan_verwacht(self):
        reeks = houding.meet_video(self.video, self._model([6.0]), analyse_fps=5.0)
        events = houding.maak_events(houding.vind_worpmomenten(reeks), reeks, 42, houding.DREMPEL_SCORE)
        self.assertEqual(len(events), 1)
        e = events[0]
        self.assertEqual(e['match_id'], 42)
        self.assertEqual(e['event_type'], 'worp')
        self.assertEqual(e['score_delta'], 0)
        self.assertLessEqual(e['confidence'], 0.9)
        self.assertEqual(e['provenance']['model'], houding.MODEL_NAAM)

    def test_een_stilstaande_speler_levert_geen_enkele_worp_op(self):
        stil = lambda _f: ([skelet(pols_y=170.0)[0]], [skelet(pols_y=170.0)[1]])  # noqa: E731
        reeks = houding.meet_video(self.video, stil, analyse_fps=5.0)
        self.assertEqual(houding.vind_worpmomenten(reeks), [])

    def test_stopt_bij_tot(self):
        reeks = houding.meet_video(self.video, self._model([]), analyse_fps=5.0, tot=5.0)
        self.assertLessEqual(reeks[-1]['t'], 5.1)

    def _teller(self):
        """Een model dat niets ziet, maar wél bijhoudt hoe vaak het gedraaid heeft."""
        gedraaid = []

        def model(_frame):
            gedraaid.append(len(gedraaid))
            punten, scores = skelet(pols_y=170.0)
            return [punten], [scores]

        return model, gedraaid

    def test_tweede_passage_meet_alleen_in_de_vensters(self):
        # Dít is de hele winst: het model — het dure deel — draait alleen nog rond de
        # kandidaten. Draait het toch over de rest van de video, dan is de tweede passage
        # duurder dan de eerste in plaats van goedkoper.
        model, gedraaid = self._teller()
        reeks = houding.meet_video(self.video, model, houding.ELK_BEELD,
                                   vensters=[(4.0, 5.0), (12.0, 13.0)])
        self.assertTrue(all(4.0 <= r['t'] <= 5.0 or 12.0 <= r['t'] <= 13.0 for r in reeks))
        # 20 seconden video op 25 beelden/s = 500 beelden; twee vensters van 1 s = ± 50.
        self.assertLessEqual(len(gedraaid), 60)
        self.assertGreaterEqual(len(gedraaid), 40)

    def test_elk_beeld_meet_fijner_dan_de_zoekpassage(self):
        # De reden van bestaan van de tweede passage: op de bronbeeldfrequentie meten in plaats
        # van te bemonsteren. Anders is "nakijken" hetzelfde als "nog eens hetzelfde doen".
        model, _ = self._teller()
        fijn = houding.meet_video(self.video, model, houding.ELK_BEELD, vensters=[(4.0, 6.0)])
        tijden = [r['t'] for r in fijn]
        stappen = [b - a for a, b in zip(tijden, tijden[1:])]
        self.assertAlmostEqual(min(stappen), 1 / 25, places=2)

    def test_de_werper_komt_uit_de_doorlopende_passage(self):
        # Het moment uit de fijne passage, de werper uit de grove. De fijne passage ziet alleen
        # losse stukken en begint na elk gat opnieuw tellen; haar werpernummers zeggen dus niets
        # over de wedstrijd als geheel.
        grof = [{'t': 6.0, 'score': 0.9, 'werper': 4, 'x': 120.0, 'y': 240.0, 'personen': 1}]
        fijn = [{'t': 5.9, 'score': 0.5, 'personen': 1},
                {'t': 6.08, 'score': 1.4, 'werper': 0, 'x': 121.0, 'y': 241.0, 'personen': 1},
                {'t': 6.2, 'score': 0.4, 'personen': 1}]
        events = houding.maak_events([(6.08, 1.4)], fijn, 42, 0.45,
                                     werperreeks=grof, werper_marge_s=1.0)
        self.assertEqual(events[0]['werper'], 4)
        self.assertEqual(events[0]['video_time_s'], 6.08)

    def test_een_camerapan_telt_niet_als_worp(self):
        # Het beoogde gebruik is een gsm in de hand: de camera volgt de bal. Iedereen die dan
        # stil staat met de armen omhoog — de wachtende vanger! — kreeg de volledige pan als
        # polsweg en scoorde 0,48: een spookworp boven de drempel. Zowel met omstanders (de
        # mediaan) als alleen in beeld (de eigen heup) moet de pan uit de score.
        for personen in (2, 1):
            teller = {'n': 0}

            def model(_frame, _personen=personen, _teller=teller):
                t = _teller['n'] / 5.0
                _teller['n'] += 1
                dx = 80.0 if t >= 9.0 else 0.0     # de camera pant 80 px op t=9,0
                alle_p, alle_s = [], []
                for i in range(_personen):
                    p, s = skelet(pols_y=40.0)     # armen omhoog, verder roerloos
                    alle_p.append([[x + dx + 400.0 * i, y] for x, y in p])
                    alle_s.append(s)
                return alle_p, alle_s

            reeks = houding.meet_video(self.video, model, analyse_fps=5.0)
            self.assertEqual(houding.vind_worpmomenten(reeks), [],
                             f'camerapan werd een worp bij {personen} speler(s) in beeld')

    def test_een_zwiep_die_de_camera_meevolgt_telt_wel(self):
        # De keerzijde: de werper staat klaar met de bal boven het hoofd en zwiept op t=9,0;
        # de camera pant exact mee. In beeld staat zijn pols dan stil — de oude maat zag nul
        # en de worp was voorgoed weg uit de zoekpassage. De heup (die wél meeschoof) verraadt
        # de pan, en die komt bij de polsweg terug.
        teller = {'n': 0}

        def model(_frame):
            t = teller['n'] / 5.0
            teller['n'] += 1
            p, s = skelet(pols_y=40.0)
            if t >= 9.0:
                p = [[x - 80.0, y] for x, y in p]
                p[houding.L_POLS] = [300.0, 40.0]
                p[houding.R_POLS] = [310.0, 40.0]
            return [p], [s]

        reeks = houding.meet_video(self.video, model, analyse_fps=5.0)
        gevonden = houding.vind_worpmomenten(reeks)
        self.assertEqual(len(gevonden), 1)
        self.assertAlmostEqual(gevonden[0][0], 9.0, delta=0.05)

    def test_een_onzekere_heup_wist_de_worp_niet(self):
        # De heup-zekerheid dipt juist bij de romprotatie van een worp. Eén onzeker heupframe
        # op t=9,0 gaf de speler vroeger een nieuw nummer met lege geschiedenis — alle scores
        # rond het loslaten exact 0, de worp voorgoed weg. De laatst bekende heup blijft nu
        # even staan, zodat de volgende meting hem gewoon terugvindt.
        teller = {'n': 0}

        def model(_frame):
            t = teller['n'] / 5.0
            teller['n'] += 1
            werpt = 0.0 <= t - 9.0 < 0.3
            pols_y, pols_x = (40.0, 300.0 + 90.0 * ((t * 5.0) % 2)) if werpt else (170.0, 300.0)
            punten, scores = skelet(pols_y=pols_y, pols_x=pols_x)
            if abs(t - 9.0) < 1e-9:
                scores[houding.L_HEUP] = scores[houding.R_HEUP] = 0.1
            return [punten], [scores]

        reeks = houding.meet_video(self.video, model, analyse_fps=5.0)
        gevonden = houding.vind_worpmomenten(reeks)
        self.assertEqual(len(gevonden), 1)
        self.assertAlmostEqual(gevonden[0][0], 9.2, delta=0.05)

    def test_de_vanger_neemt_werper_moment_en_type_niet_over(self):
        # Speler A werpt (nekworp) op t=9,0; speler B heft op t=9,4 snel de armen om te
        # vangen en scoort daarbij hóger dan de worp zelf. Vroeger won de sterkste piek:
        # het event schoof naar de vangst, met werper-id en positie van de vánger, en het
        # frame-maximum van de polshoogtes maakte van de nekworp None.
        teller = {'n': 0}

        def model(_frame):
            t = teller['n'] / 5.0
            teller['n'] += 1
            # A: armen geleidelijk omhoog vanaf 8,4, de zwiep op 9,0, daarna laag.
            if t < 8.4:
                a_y, a_x = 170.0, 300.0
            elif t < 8.6:
                a_y, a_x = 130.0, 300.0
            elif t < 8.8:
                a_y, a_x = 90.0, 300.0
            elif t < 9.0:
                a_y, a_x = 40.0, 300.0
            elif t < 9.2:
                a_y, a_x = 40.0, 380.0             # het loslaten: hoog én ver
            else:
                a_y, a_x = 170.0, 300.0
            # B (400 px verder): heft op 9,4 in één keer de armen — hoog én ver — en houdt ze zo.
            b_y, b_x = (40.0, 430.0) if t >= 9.4 else (170.0, 300.0)
            pa, sa = skelet(pols_y=a_y, pols_x=a_x)
            pb, sb = skelet(pols_y=b_y, pols_x=b_x)
            pb = [[x + 400.0, y] for x, y in pb]
            return [pa, pb], [sa, sb]

        reeks = houding.meet_video(self.video, model, analyse_fps=5.0)
        momenten = houding.vind_worpmomenten(reeks)
        self.assertEqual(len(momenten), 1)
        self.assertAlmostEqual(momenten[0][0], 9.0, delta=0.05)   # de worp, niet de vangst
        events = houding.maak_events(momenten, reeks, 42, houding.DREMPEL_SCORE)
        self.assertEqual(events[0]['werper'], 0)                  # speler A, niet de vanger
        self.assertEqual(events[0]['worp_type'], 'nek')           # aan Á's polshoogtes gelezen

    def test_een_grove_analysestand_vindt_de_worpen_nog(self):
        # Op analyse-fps 1 is de meetstap (1,0 s) groter dan de oude vaste gat-grens van
        # 0,66 s: de geschiedenis werd bij élke meting gewist en elke score was exact 0 —
        # stil nul worpen, juist op de trage servers waarvoor die stand bestaat.
        worpen = [4.0, 9.0, 15.0]
        reeks = houding.meet_video(self.video, self._model(worpen, fps=1.0), analyse_fps=1.0)
        gevonden = houding.vind_worpmomenten(reeks)
        self.assertEqual(len(gevonden), len(worpen))
        for w, (t, _s) in zip(worpen, gevonden):
            self.assertAlmostEqual(t, w, delta=0.1)

if __name__ == '__main__':
    unittest.main()


class TestSchatDuur(unittest.TestCase):
    """Weten hoelang het gaat duren, vóór je een uur zit te wachten."""

    def test_rekent_beelden_maal_tijd_per_beeld(self):
        # 3000 beelden aan 0,8 s = 40 minuten.
        self.assertAlmostEqual(houding.schat_duur(0.8, 3000), 2400.0)

    def test_geen_negatieve_of_onzinnige_schatting(self):
        self.assertEqual(houding.schat_duur(-1.0, 100), 0.0)
        self.assertEqual(houding.schat_duur(0.5, 0), 0.0)


class TestKoppelPersonen(unittest.TestCase):
    """Wie is wie tussen twee metingen.

    Het model levert per beeld een LIJST personen, en die volgorde verandert zodra er iemand
    bijkomt of wegvalt. Wie de lijstindex als identiteit gebruikt, vergelijkt de polsen van
    speler A met die van speler B en meet een polssnelheid die niemand maakte — en kan achteraf
    niet zeggen wie er wierp.
    """

    def staat(self, x, y, romp=100.0):
        return {'heup': (x, y), 'romp': romp, 'polshoogte': 0.3, 'pols': (x, y - 60)}

    def test_volgt_dezelfde_persoon_ondanks_een_andere_volgorde(self):
        vorige = {7: self.staat(100, 500), 9: self.staat(400, 500)}
        # Nu staan ze omgekeerd in de lijst, en elk een stukje verschoven.
        huidige = [self.staat(410, 505), self.staat(112, 498)]
        koppeling = houding.koppel_personen(vorige, huidige)
        self.assertEqual(koppeling[0], 9)
        self.assertEqual(koppeling[1], 7)

    def test_weigert_een_sprong_die_geen_speler_kan_maken(self):
        # Anderhalve romphoogte is de grens: verder is het een verwisseling, geen wandeling.
        vorige = {1: self.staat(100, 500)}
        huidige = [self.staat(600, 500)]
        self.assertEqual(houding.koppel_personen(vorige, huidige), {})

    def test_koppelt_elke_persoon_hoogstens_een_keer(self):
        # Twee spelers vlak bij elkaar mogen niet allebei aan dezelfde vorige gekoppeld worden.
        vorige = {3: self.staat(200, 500)}
        huidige = [self.staat(205, 500), self.staat(210, 500)]
        koppeling = houding.koppel_personen(vorige, huidige)
        self.assertEqual(len(koppeling), 1)
        self.assertEqual(koppeling.get(0), 3)

    def test_laat_iemand_zonder_heupen_met_rust(self):
        vorige = {1: self.staat(100, 500)}
        huidige = [{'heup': None, 'romp': 100.0, 'polshoogte': None, 'pols': None}]
        self.assertEqual(houding.koppel_personen(vorige, huidige), {})


class TestBesteWorpscore(unittest.TestCase):
    """De sterkste beweging over één loslaatfase, ongeacht hoe fijn er bemonsterd is."""

    def _staat(self, pols_x):
        p, s = skelet(pols_y=40.0, pols_x=pols_x)
        return {'polshoogte': houding.polshoogte(p, s), 'romp': houding.romphoogte(p, s),
                'pols': houding.polspositie(p, s)}

    def test_neemt_de_sterkste_beweging_in_de_band(self):
        # Een geschiedenis waarin de hand pas in de laatste 0,12 s echt versnelt.
        geschiedenis = [(0.0, self._staat(300.0)), (0.10, self._staat(305.0)), (0.20, self._staat(310.0))]
        score, venster = houding.beste_worpscore(geschiedenis, self._staat(400.0), 0.28)
        self.assertGreater(score, 0.4)
        self.assertGreaterEqual(venster, houding.VENSTER_LAAG_S)
        self.assertLessEqual(venster, houding.VENSTER_HOOG_S)

    def test_valt_terug_op_de_dichtstbijzijnde_meting_bij_een_grove_stand(self):
        # Op 3 metingen per seconde valt er niets binnen de band; dan liever een minder scherpe
        # meting dan helemaal geen.
        geschiedenis = [(0.0, self._staat(300.0))]
        score, venster = houding.beste_worpscore(geschiedenis, self._staat(400.0), 0.35)
        self.assertGreater(score, 0.0)
        self.assertAlmostEqual(venster, 0.35)

    def test_zonder_geschiedenis_geen_score(self):
        score, _venster = houding.beste_worpscore([], self._staat(400.0), 1.0)
        self.assertEqual(score, 0.0)


class TestZoekvensters(unittest.TestCase):
    """Welke stukken video de tweede passage nog eens grondig bekijkt."""

    def test_een_venster_rond_elke_kandidaat(self):
        v = houding.zoekvensters([(10.0, 1.0), (30.0, 2.0)], marge_s=0.5)
        self.assertEqual(v, [(9.5, 10.5), (29.5, 30.5)])

    def test_voegt_overlappende_stukken_samen(self):
        # Twee kandidaten vlak bij elkaar: één keer nakijken volstaat. Twee vensters zouden
        # dezelfde beelden twee keer door het model duwen, en dáár zit de rekentijd.
        v = houding.zoekvensters([(10.0, 1.0), (10.6, 1.0), (10.9, 1.0)], marge_s=0.5)
        self.assertEqual(v, [(9.5, 11.4)])

    def test_begint_nooit_voor_het_begin_en_stopt_op_tot(self):
        v = houding.zoekvensters([(0.2, 1.0), (99.7, 1.0)], marge_s=0.8, tot=100.0)
        self.assertEqual(v[0][0], 0.0)
        self.assertEqual(v[-1][1], 100.0)

    def test_houdt_het_nakijkwerk_binnen_de_begroting(self):
        # Een lage zoekdrempel op een rommelig beeld kan honderden kandidaten opleveren. Zonder
        # grens groeit "even nakijken" uit tot de hele video op volle beeldfrequentie — precies
        # het uur wachten dat de stand "snel" moet vermijden.
        kandidaten = [(float(i), 1.0 - i * 0.001) for i in range(5, 105)]
        zonder = houding.zoekvensters(kandidaten, 0.8, 120.0)
        met = houding.zoekvensters(kandidaten, 0.8, 120.0, max_deel=0.25, duur=120.0)
        self.assertGreater(sum(b - a for a, b in zonder), 100.0)
        self.assertLessEqual(sum(b - a for a, b in met), 30.0)

    def test_laat_de_sterkste_kandidaten_over_als_er_gesnoeid_wordt(self):
        # Moet er iets sneuvelen, dan de twijfelgevallen — niet de duidelijke worpen.
        kandidaten = [(10.0, 0.2), (20.0, 0.9), (30.0, 0.3)]
        v = houding.zoekvensters(kandidaten, 0.8, 100.0, max_deel=0.02, duur=100.0)
        self.assertTrue(houding.in_venster(20.0, v))
        self.assertFalse(houding.in_venster(10.0, v))

    def test_kijkt_altijd_minstens_de_sterkste_kandidaat_na(self):
        # Een begroting van nul mag niet betekenen dat er niets gebeurt: dan zou de tweede
        # passage stilletjes uitgezet zijn zonder dat iemand het merkt.
        v = houding.zoekvensters([(50.0, 0.9)], 0.8, 100.0, max_deel=0.0, duur=100.0)
        self.assertTrue(houding.in_venster(50.0, v))

    def test_zonder_kandidaten_valt_er_niets_na_te_kijken(self):
        self.assertEqual(houding.zoekvensters([]), [])

    def test_in_venster_laat_zonder_vensters_alles_door(self):
        self.assertTrue(houding.in_venster(123.0, None))
        self.assertTrue(houding.in_venster(10.0, [(9.0, 11.0)]))
        self.assertFalse(houding.in_venster(12.0, [(9.0, 11.0)]))


class TestWerperOp(unittest.TestCase):
    """De werper bij een moment — desnoods van de dichtstbijzijnde meting."""

    reeks = [
        {'t': 9.0, 'werper': 3, 'x': 100.0, 'y': 200.0},
        {'t': 10.0, 'werper': 7, 'x': 110.0, 'y': 210.0},
        {'t': 11.0, 'werper': 9},
    ]

    def test_neemt_exact_dat_moment_zonder_marge(self):
        self.assertEqual(houding.werper_op(self.reeks, 10.0)['werper'], 7)
        self.assertIsNone(houding.werper_op(self.reeks, 10.4))

    def test_neemt_de_dichtstbijzijnde_binnen_de_marge(self):
        # De twee passages meten op verschillende tijdstippen: het moment komt uit de fijne
        # passage, de werper uit de grove. Zonder marge zou er nooit één samenvallen.
        self.assertEqual(houding.werper_op(self.reeks, 10.4, marge_s=1.0)['werper'], 7)
        self.assertEqual(houding.werper_op(self.reeks, 10.6, marge_s=1.0)['werper'], 9)

    def test_slaat_metingen_zonder_werper_over(self):
        self.assertIsNone(houding.werper_op([{'t': 10.0, 'score': 1.0}], 10.0, marge_s=1.0))


class TestHervatten(unittest.TestCase):
    """Verdergaan waar een onderbroken analyse gebleven was.

    Een analyse van drie uur is een kind van de webserver: bij een herstart verdwijnt ze. Dat is
    bij een bewuste uitrol te aanvaarden — maar dan opnieuw beginnen niet, want dan kost elke
    uitrol drie uur. Wat al gemeten was, staat regel voor regel op schijf.
    """

    def setUp(self):
        import tempfile
        self.map = Path(tempfile.mkdtemp())

    def tearDown(self):
        import shutil
        shutil.rmtree(self.map, ignore_errors=True)

    def _schrijf(self, regels):
        pad = self.map / 'reeks.jsonl'
        pad.write_text(''.join(regels), encoding='utf-8')
        return pad

    def test_leest_een_eerdere_reeks_terug(self):
        pad = self._schrijf([
            '{"t": 1.0, "score": 0.1, "personen": 1}\n',
            '{"t": 2.0, "score": 0.2, "personen": 1}\n',
        ])
        r = houding.lees_reeks(pad)
        self.assertEqual([x['t'] for x in r], [1.0, 2.0])

    def test_gooit_een_halve_laatste_regel_weg(self):
        # Precies wat er gebeurt als de stroom er middenin uitvalt: de laatste regel is
        # afgekapt. Eén meting kwijt is beter dan de hele reeks weigeren.
        pad = self._schrijf([
            '{"t": 1.0, "score": 0.1, "personen": 1}\n',
            '{"t": 2.0, "score": 0.2, "pers',
        ])
        r = houding.lees_reeks(pad)
        self.assertEqual([x['t'] for x in r], [1.0])

    def test_sorteert_op_tijd_en_negeert_lege_regels(self):
        pad = self._schrijf([
            '{"t": 2.0, "score": 0.2}\n', '\n', '{"t": 1.0, "score": 0.1}\n',
        ])
        self.assertEqual([x['t'] for x in houding.lees_reeks(pad)], [1.0, 2.0])

    def test_zonder_bestand_gewoon_niets(self):
        self.assertEqual(houding.lees_reeks(self.map / 'bestaat-niet.jsonl'), [])

    def test_hervat_na_een_voltooide_run_hergebruikt_de_uitkomst(self):
        # Een reeks mét passage-2-regels is de definitieve, herschreven vorm van een voltooide
        # twee-passages-run: binnen de nakijkvensters bestaan alleen nog fijne metingen. De
        # oude hervat-filter gooide juist die weg en mat verder met gaten van ± 1,6 s rond
        # elke gevonden worp — alle worpen stil kwijt (2/2 → 0/2). En dit is geen randgeval:
        # de server zet --hervat óók als een látere stap struikelde, waarna deze voltooide
        # stap gewoon opnieuw draait. Zo'n reeks wordt nu herkend en de bestaande uitkomst
        # geleverd, zonder iets te meten (en dus ook zonder model of video nodig te hebben).
        vensters = [(29.2, 30.8), (79.2, 80.8)]
        regels = []
        t = 0.125
        while t < 120.0:
            tr = round(t, 3)
            if not any(a <= tr <= b for a, b in vensters):
                regels.append({'t': tr, 'score': 0.2, 'polshoogte': 0.1, 'personen': 2,
                               'werper': 2, 'passage': 1})
            t += 0.125
        for midden in (30.0, 80.0):
            tt = midden - 0.8
            while tt <= midden + 0.8 + 1e-9:
                tr = round(tt, 3)
                regels.append({'t': tr, 'score': round(max(0.0, 0.9 - abs(tr - midden)), 4),
                               'polshoogte': 0.1, 'personen': 2, 'passage': 2})
                tt += 0.04
        regels.sort(key=lambda r: r['t'])
        reeks_pad = self._schrijf([json.dumps(r) + '\n' for r in regels])
        inhoud_voor = reeks_pad.read_text(encoding='utf-8')
        video = self.map / 'wedstrijd.mp4'
        video.write_bytes(b'niet nodig: er wordt niets gemeten')
        uit = self.map / 'detecties.jsonl'
        houding.main([str(video), '--uit', str(uit), '--reeks-uit', str(reeks_pad), '--hervat',
                      '--twee-passages', '--drempel', '0.45', '--min-afstand', '3.0'])
        events = [json.loads(r) for r in uit.read_text(encoding='utf-8').splitlines()]
        self.assertEqual([round(e['video_time_s'], 1) for e in events], [30.0, 80.0])
        self.assertEqual(events[0]['werper'], 2)   # uit de doorlopende passage
        # De definitieve reeks blijft onaangeroerd, en het rapport zegt wat er gebeurd is.
        self.assertEqual(reeks_pad.read_text(encoding='utf-8'), inhoud_voor)
        rapport = json.loads(uit.with_suffix(uit.suffix + '.rapport.json')
                             .read_text(encoding='utf-8'))
        self.assertTrue(rapport.get('hergebruikt'))
        self.assertEqual(rapport.get('kandidaten'), 2)


@unittest.skipUnless(_cv2_of_niets(), 'opencv niet geïnstalleerd')
class TestHervattenInDeVideo(unittest.TestCase):
    """Het meten zelf: overslaan wat al gemeten was, en meteen wegschrijven."""

    @classmethod
    def setUpClass(cls):
        import tempfile
        import numpy as np
        cv2 = _cv2_of_niets()
        cls.map = tempfile.mkdtemp()
        cls.video = Path(cls.map) / 'proef.mp4'
        schrijver = cv2.VideoWriter(str(cls.video), cv2.VideoWriter_fourcc(*'mp4v'), 25.0, (320, 180))
        for _ in range(25 * 20):
            schrijver.write(np.zeros((180, 320, 3), np.uint8))
        schrijver.release()

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls.map, ignore_errors=True)

    def _model(self):
        gedraaid = []

        def model(_frame):
            gedraaid.append(len(gedraaid))
            punten, scores = skelet(pols_y=170.0)
            return [punten], [scores]

        return model, gedraaid

    def test_meet_niets_voor_het_hervatpunt(self):
        # Dít is de winst: het model — het dure deel — draait alleen nog over het stuk dat nog
        # niet gemeten was. De beelden ervoor worden wel ingelezen (in een video kun je niet
        # betrouwbaar springen), maar dat kost een fractie.
        model, gedraaid = self._model()
        reeks = houding.meet_video(self.video, model, analyse_fps=5.0, vanaf=15.0)
        self.assertTrue(all(r['t'] >= 15.0 for r in reeks))
        # 5 seconden aan 5 metingen/s = ± 25, niet de 100 van de hele video.
        self.assertLess(len(gedraaid), 40)

    def test_schrijft_elke_meting_meteen_weg(self):
        # Wat in het geheugen zit overleeft geen herstart; wat op schijf staat wel.
        model, _ = self._model()
        weggeschreven = []
        reeks = houding.meet_video(self.video, model, analyse_fps=5.0, tot=3.0,
                                   schrijf=weggeschreven.append)
        self.assertEqual(len(weggeschreven), len(reeks))
        self.assertEqual(weggeschreven[0]['t'], reeks[0]['t'])

    def _worpmodel(self, worpen, fps=5.0):
        """Als in TestVideolaag: één speler die op de opgegeven momenten (modeltijd!) werpt."""
        teller = {'n': 0}

        def model(_frame):
            t = teller['n'] / fps
            teller['n'] += 1
            werpt = any(0.0 <= t - w < 0.45 for w in worpen)
            pols_y, pols_x = (40.0, 300.0 + 90.0 * ((t * fps) % 2)) if werpt else (170.0, 300.0)
            punten, scores = skelet(schouder_y=100.0, heup_y=200.0, pols_y=pols_y, pols_x=pols_x)
            return [punten], [scores]

        return model

    def test_hervatten_meet_de_naad_opnieuw_zonder_dubbel_tijdstip(self):
        # De oude naad: t==vanaf werd opnieuw gemeten met lege geschiedenis, zodat dat
        # tijdstip twee keer in de reeks stond — de oude score naast een verse 0,0 (een vals
        # lokaal maximum op elke stijgende flank) — en de eerste ± 0,22 s na de naad te laag
        # scoorden. Nu vervalt de overlap en wordt de naad warm opnieuw gemeten.
        vol = houding.meet_video(self.video, self._worpmodel([]), analyse_fps=5.0)
        eerder = [r for r in vol if r['t'] <= 10.0]   # tot hier stond de onderbroken poging
        behouden, vanaf, eerste = houding.hervatpunt(eerder)
        self.assertAlmostEqual(vanaf, 9.8 - houding.VENSTER_HOOG_S, places=6)
        tweede = houding.meet_video(self.video, self._worpmodel([]), analyse_fps=5.0,
                                    vanaf=vanaf, eerste_werper=eerste)
        tijden = [r['t'] for r in behouden] + [r['t'] for r in tweede]
        self.assertEqual(len(tijden), len(set(tijden)))   # elk tijdstip precies één keer
        self.assertLess(tweede[0]['t'], 9.8)              # de naad zelf wordt hermeten

    def test_hervatten_nummert_de_werpers_verder(self):
        # Het nieuwe proces begon vroeger opnieuw bij werper 0, terwijl de eerdere metingen
        # dat nummer al aan iemand gaven: verschillende spelers onder één naam, en de
        # groepering "één keer per speler zeggen wie het is" voegt dan vreemden samen.
        vol = houding.meet_video(self.video, self._worpmodel([5.0]), analyse_fps=5.0)
        eerder = [r for r in vol if r['t'] <= 10.0]
        _behouden, vanaf, eerste = houding.hervatpunt(eerder)
        ids_eerder = {r['werper'] for r in eerder if 'werper' in r}
        self.assertIn(0, ids_eerder)
        # De tweede poging ziet (in haar eigen klok, die pas op `vanaf` begint te lopen)
        # een worp op 15,0 s echte tijd.
        tweede = houding.meet_video(self.video, self._worpmodel([15.0 - 9.6]), analyse_fps=5.0,
                                    vanaf=vanaf, eerste_werper=eerste)
        ids_tweede = {r['werper'] for r in tweede if 'werper' in r}
        self.assertTrue(ids_tweede)
        self.assertFalse(ids_eerder & ids_tweede)
