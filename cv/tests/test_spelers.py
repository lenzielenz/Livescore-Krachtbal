"""Tests voor spelers.py (fase 3) en de fase 2/3-metrieken van evaluate.py."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import evaluate  # noqa: E402
import spelers  # noqa: E402


def _det(t: float, **extra) -> dict:
    basis = {
        'match_id': 1, 'video_time_s': t, 'frame': None, 'event_type': 'worp',
        'worp_type': 'nekworp', 'zone': None, 'afstand_m': None, 'speler': None,
        'score_delta': 0, 'confidence': 0.7, 'provenance': {'model': 'test', 'model_version': '0'},
    }
    basis.update(extra)
    return basis


def _label(t: float, team: str = 'home', rugnummer: int | None = 7, **extra) -> dict:
    basis = {
        'video_time_s': t, 'event_type': 'worp', 'worp_type': 'nekworp',
        'zone': None, 'speler': {'team': team, 'rugnummer': rugnummer},
    }
    basis.update(extra)
    return basis


class TestDemoSpelers(unittest.TestCase):
    def test_zonder_fouten_neemt_de_demo_het_label_over(self):
        verrijkt, rapport = spelers.demo_spelers(
            [_det(10.1)], [_label(10.0, 'away', 12)], seed=1,
            team_fout=0.0, nummer_leeg=0.0, nummer_fout=0.0,
        )
        self.assertEqual(rapport['met_label'], 1)
        self.assertEqual(verrijkt[0]['speler'], {'team': 'away', 'rugnummer': 12})

    def test_team_fout_1_klapt_altijd_om(self):
        verrijkt, _ = spelers.demo_spelers(
            [_det(10.1)], [_label(10.0, 'home', 7)], seed=1,
            team_fout=1.0, nummer_leeg=0.0, nummer_fout=0.0,
        )
        self.assertEqual(verrijkt[0]['speler']['team'], 'away')

    def test_nummer_leeg_1_laat_altijd_leeg(self):
        verrijkt, _ = spelers.demo_spelers(
            [_det(10.1)], [_label(10.0, 'home', 7)], seed=1,
            team_fout=0.0, nummer_leeg=1.0, nummer_fout=0.0,
        )
        self.assertIsNone(verrijkt[0]['speler']['rugnummer'])

    def test_nummer_fout_wordt_nooit_het_juiste_nummer(self):
        for seed in range(25):
            verrijkt, _ = spelers.demo_spelers(
                [_det(10.1)], [_label(10.0, 'home', 7)], seed=seed,
                team_fout=0.0, nummer_leeg=0.0, nummer_fout=1.0,
            )
            self.assertNotEqual(verrijkt[0]['speler']['rugnummer'], 7)

    def test_valse_positief_krijgt_gok_zonder_nummer(self):
        verrijkt, rapport = spelers.demo_spelers(
            [_det(500.0)], [_label(10.0)], seed=2,
            team_fout=0.0, nummer_leeg=0.0, nummer_fout=0.0,
        )
        self.assertEqual(rapport['zonder_label'], 1)
        self.assertIn(verrijkt[0]['speler']['team'], ('home', 'away'))
        self.assertIsNone(verrijkt[0]['speler']['rugnummer'])

    def test_reproduceerbaar_met_seed(self):
        labels = [_label(10.0), _label(40.0, 'away', 3)]
        detecties = [_det(10.2), _det(40.4), _det(300.0)]
        a, _ = spelers.demo_spelers(detecties, labels, seed=9, team_fout=0.3, nummer_leeg=0.3, nummer_fout=0.3)
        b, _ = spelers.demo_spelers(detecties, labels, seed=9, team_fout=0.3, nummer_leeg=0.3, nummer_fout=0.3)
        self.assertEqual(a, b)


class TestCirculaireTint(unittest.TestCase):
    """Vondst uit de doorlichting: OpenCV-hue is circulair (rood ligt op ~0 én
    ~179). De lineaire mediaan en 2-means splitsten een rood truitje rond de
    wrap, waardoor het team per belichtingsmoment kon omklappen."""

    def test_torso_tint_middelt_rood_rond_de_wrap_circulair(self):
        import cv2
        import numpy as np
        # Rood truitje met hue-pixels aan beide kanten van de wrap; het patroon
        # herhaalt per kolom zodat de torso-crop dezelfde verdeling bevat.
        hues = [1, 2, 3, 2, 1, 176, 177, 178, 176, 175]
        patroon = np.array(hues * 6, dtype=np.uint8)
        hsv = np.zeros((40, 60, 3), dtype=np.uint8)
        hsv[:, :, 0] = patroon[np.newaxis, :]
        hsv[:, :, 1] = 200
        hsv[:, :, 2] = 200
        frame = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        tint = spelers.torso_tint(cv2, frame, (0, 0, 60, 40))
        self.assertIsNotNone(tint)
        # Vóór de fix: mediaan ≈ 89 (cyaan/groen); circulair blijft rood rood.
        self.assertLess(spelers.circulaire_afstand(tint, 0.0), 10.0)

    def test_rood_rond_de_wrap_blijft_een_team(self):
        # Rood gemeten als 6× hue 3 en 6× hue 176 (belichting), blauw 11× hue 110.
        # Vóór de fix werden de centra ~3 en ~132, waardoor rood@176 bij blauw
        # belandde; circulair blijven alle twaalf rode metingen één team.
        tinten: list[float | None] = [3.0] * 6 + [176.0] * 6 + [110.0] * 11
        teams = spelers.wijs_teams_toe(tinten)
        self.assertEqual(set(teams[:12]), {'home'})  # rood is de grootste cluster
        self.assertEqual(set(teams[12:]), {'away'})

    def test_wissel_draait_om_en_zonder_tint_blijft_zonder_team(self):
        tinten: list[float | None] = [3.0, 176.0, None, 110.0, 110.0, 110.0]
        self.assertEqual(spelers.wijs_teams_toe(tinten),
                         ['away', 'away', None, 'home', 'home', 'home'])
        self.assertEqual(spelers.wijs_teams_toe(tinten, wissel=True),
                         ['home', 'home', None, 'away', 'away', 'away'])

    def test_circulaire_afstand_en_gemiddelde(self):
        self.assertAlmostEqual(spelers.circulaire_afstand(3.0, 176.0), 7.0)
        self.assertAlmostEqual(spelers.circulaire_afstand(3.0, 110.0), 73.0)
        # Gemiddelde van tinten rond de wrap blijft bij de wrap, niet in het midden.
        gem = spelers.circulair_gemiddelde([1, 2, 3, 2, 1, 176, 177, 178, 176, 175])
        self.assertLess(spelers.circulaire_afstand(gem, 0.0), 5.0)


class TestFase23Metrieken(unittest.TestCase):
    """De zone-/speler-secties die fase 2 en 3 aan evaluate.py toevoegden."""

    def test_zone_accuraatheid_en_landing_mae(self):
        labels = [
            _label(10.0, zone={'in_doelgebied': True, 'x_m': 7.0, 'y_m': 2.0}),
            _label(40.0, zone={'in_doelgebied': False, 'x_m': 7.0, 'y_m': 23.0}),
        ]
        detecties = [
            _det(10.2, zone={'in_doelgebied': True, 'x_m': 7.0, 'y_m': 3.0}),   # juist, fout 1 m
            _det(40.1, zone={'in_doelgebied': True, 'x_m': 7.0, 'y_m': 25.0}),  # zone fout, fout 2 m
        ]
        m = evaluate.evalueer(labels, detecties, venster=2.0)
        self.assertEqual(m['zone']['paren'], 2)
        self.assertAlmostEqual(m['zone']['accuraatheid'], 0.5)
        self.assertAlmostEqual(m['zone']['landing_mae_m'], 1.5)

    def test_zone_sectie_blijft_leeg_zonder_zone_data(self):
        m = evaluate.evalueer([_label(10.0)], [_det(10.2)], venster=2.0)
        self.assertEqual(m['zone']['paren'], 0)
        self.assertIsNone(m['zone']['accuraatheid'])
        self.assertNotIn('Zone en landing', evaluate.formatteer_rapport(m))

    def test_team_en_rugnummer_accuraatheid(self):
        labels = [_label(10.0, 'home', 7), _label(40.0, 'away', 12), _label(70.0, 'home', 5)]
        detecties = [
            _det(10.1, speler={'team': 'home', 'rugnummer': 7}),   # alles juist
            _det(40.2, speler={'team': 'home', 'rugnummer': None}),  # team fout, nummer leeg
            _det(70.1, speler={'team': 'home', 'rugnummer': 9}),   # team juist, nummer fout
        ]
        m = evaluate.evalueer(labels, detecties, venster=2.0)
        sp = m['speler']
        self.assertEqual(sp['team_paren'], 3)
        self.assertAlmostEqual(sp['team_accuraatheid'], 2 / 3)
        # Leeg rugnummer telt niet als fout, enkel als niet ingevuld.
        self.assertEqual(sp['rugnummer_labels'], 3)
        self.assertEqual(sp['rugnummer_ingevuld'], 2)
        self.assertAlmostEqual(sp['rugnummer_accuraatheid'], 0.5)
        rapport = evaluate.formatteer_rapport(m)
        self.assertIn('Spelersidentificatie', rapport)
        self.assertIn('2 van 3 ingevuld', rapport)


if __name__ == '__main__':
    unittest.main()
