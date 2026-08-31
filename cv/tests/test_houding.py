#!/usr/bin/env python3
"""Worpen herkennen aan de houding — de rekenkern, zonder model en zonder video.

Het model levert per speler zeventien gewrichten; wat je daarmee doet is gewone meetkunde, en
dát wordt hier nagerekend met verzonnen skeletten. Zo staat de beslislogica vast vóór er ook
maar één gewicht gedownload is.
"""

from __future__ import annotations

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


class TestVertrouwen(unittest.TestCase):
    def test_blijft_onder_de_een(self):
        # Een voorstel voor de reviewlaan mag nooit als zekerheid binnenkomen.
        for score in (0.0, 1.2, 5.0, 50.0):
            self.assertLessEqual(houding.vertrouwen(score), 0.9)
            self.assertGreaterEqual(houding.vertrouwen(score), 0.05)

    def test_stijgt_met_de_score(self):
        self.assertLess(houding.vertrouwen(1.3), houding.vertrouwen(3.0))



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
