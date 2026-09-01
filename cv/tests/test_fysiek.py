"""Tests voor fysiek.py: loopafstand, sprintjes en topsnelheid per spoor/speler."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fysiek  # noqa: E402


def _spoor(track: int, stappen: list[tuple[float, float, float]]) -> list[dict]:
    return [{'t': t, 'track': track, 'x_m': x, 'y_m': y} for t, x, y in stappen]


class TestGladstrijken(unittest.TestCase):
    """Zonder gladstrijken telt elke meetruis mee als gelopen weg: dan meet dezelfde
    wedstrijd op 4 metingen/s vér​der dan op 2/s, en zijn wedstrijden onvergelijkbaar."""

    def _kronkelpad(self, stap_s: float, ruis: float = 0.25) -> list[dict]:
        # Rechte lijn van 1 m/s met meetruis erop, 60 s lang.
        import random
        rng = random.Random(7)
        rijen, t = [], 0.0
        while t <= 60.0:
            rijen.append({'t': round(t, 3), 'track': 1,
                          'x_m': 5.0 + rng.gauss(0.0, ruis), 'y_m': t * 1.0 + rng.gauss(0.0, ruis)})
            t += stap_s
        return rijen

    def test_meters_blijven_vergelijkbaar_bij_dichtere_bemonstering(self):
        traag = fysiek.fysiek_per_spoor(self._kronkelpad(0.5))[1]['afstand_m']
        dicht = fysiek.fysiek_per_spoor(self._kronkelpad(0.25))[1]['afstand_m']
        # De speler legde 60 m af; beide metingen moeten daar dicht bij liggen en bij elkaar.
        self.assertLess(abs(dicht - traag) / traag, 0.25)
        for gemeten in (traag, dicht):
            self.assertGreater(gemeten, 50.0)
            self.assertLess(gemeten, 85.0)

    def test_zonder_gladstrijken_blaast_dichter_bemonsteren_de_meters_op(self):
        traag = fysiek.fysiek_per_spoor(self._kronkelpad(0.5), glad_venster=0)[1]['afstand_m']
        dicht = fysiek.fysiek_per_spoor(self._kronkelpad(0.25), glad_venster=0)[1]['afstand_m']
        # Precies de fout die het venster voorkomt: ruwe telling groeit mee met de frequentie.
        self.assertGreater(dicht, traag * 1.3)

    def test_glad_spoor_houdt_de_tijdstempels_en_middelt_alleen_de_plaats(self):
        punten = [(0.0, 0.0, 0.0), (0.25, 2.0, 0.0), (0.5, 0.0, 0.0), (0.75, 2.0, 0.0)]
        glad = fysiek.glad_spoor(punten, venster_s=0.75)
        self.assertEqual([p[0] for p in glad], [p[0] for p in punten])
        # De zigzag van 0↔2 m wordt afgevlakt naar iets rond 1 m.
        for _, x, _ in glad[1:-1]:
            self.assertGreater(x, 0.4)
            self.assertLess(x, 1.6)

    def test_kort_spoor_of_venster_nul_blijft_ongemoeid(self):
        punten = [(0.0, 1.0, 2.0), (1.0, 3.0, 4.0)]
        self.assertEqual(fysiek.glad_spoor(punten), punten)
        self.assertEqual(fysiek.glad_spoor(punten * 3, venster_s=0), punten * 3)

    def test_een_echte_sprint_overleeft_het_gladstrijken(self):
        # 2 s aan 6 m/s tussen wandelen door: moet als sprint geteld blijven worden.
        rijen = []
        for i in range(9):  # 0–2 s wandelen
            rijen.append({'t': i * 0.25, 'track': 1, 'x_m': 5.0, 'y_m': i * 0.25})
        for i in range(1, 9):  # 2–4 s sprinten
            rijen.append({'t': 2.0 + i * 0.25, 'track': 1, 'x_m': 5.0, 'y_m': 2.0 + i * 1.5})
        for i in range(1, 9):  # 4–6 s uitlopen
            rijen.append({'t': 4.0 + i * 0.25, 'track': 1, 'x_m': 5.0, 'y_m': 14.0 + i * 0.25})
        f = fysiek.fysiek_per_spoor(rijen)[1]
        self.assertEqual(f['sprints'], 1)
        self.assertGreater(f['topsnelheid_m_s'], 4.0)


class TestDodeBand(unittest.TestCase):
    """Vondst uit de doorlichting: loopafstand integreerde positiejitter — een
    stilstaande speler 'liep' bij een voetpunt-jitter van 0,15 m sigma 210,8 m
    per tien minuten. De dode band telt meters pas bij echte verplaatsing."""

    def test_stilstaande_speler_loopt_vrijwel_niets_ondanks_jitter(self):
        import random
        rng = random.Random(42)
        # Tien minuten stilstaan op (7, 20) bij 4 metingen/s, realistische jitter.
        posities = [{'t': i * 0.25, 'track': 1,
                     'x_m': 7.0 + rng.gauss(0.0, 0.15), 'y_m': 20.0 + rng.gauss(0.0, 0.15)}
                    for i in range(2401)]
        f = fysiek.fysiek_per_spoor(posities)[1]
        # Minder dan enkele meters per minuut — vóór de fix was dit 210,8 m.
        self.assertLess(f['afstand_m'], 20.0)
        # De sprintdrempel blijft buiten bereik: stilstaan levert geen spooksprints.
        self.assertEqual(f['sprints'], 0)

    def test_echte_sprint_behoudt_zijn_afstand_ondanks_de_dode_band(self):
        import random
        rng = random.Random(7)
        # Vijf seconden aan 6 m/s (30 m), met dezelfde realistische jitter erop.
        rijen = [{'t': i * 0.25, 'track': 1,
                  'x_m': 5.0 + rng.gauss(0.0, 0.15),
                  'y_m': 6.0 * (i * 0.25) + rng.gauss(0.0, 0.15)} for i in range(21)]
        f = fysiek.fysiek_per_spoor(rijen)[1]
        self.assertGreater(f['afstand_m'], 27.0)
        self.assertLess(f['afstand_m'], 33.0)
        self.assertEqual(f['sprints'], 1)

    def test_ruis_drempel_nul_telt_rauw(self):
        # Het ontsnappingsluik voor wie de oude telling wil: band 0 = elke stap telt.
        posities = _spoor(1, [(0.0, 0.0, 0.0), (0.5, 0.0, 0.15), (1.0, 0.0, 0.3)])
        met = fysiek.fysiek_per_spoor(posities)[1]['afstand_m']
        zonder = fysiek.fysiek_per_spoor(posities, ruis_drempel=0.0)[1]['afstand_m']
        self.assertAlmostEqual(zonder, 0.3)
        # Onder de dode band blijft de teller op nul staan.
        self.assertEqual(met, 0.0)


class TestFysiekPerSpoor(unittest.TestCase):
    def test_afstand_en_topsnelheid(self):
        # 4 stappen van 2 m per 0,5 s = 8 m gelopen aan constant 4 m/s.
        posities = _spoor(1, [(0.0, 0.0, 0.0), (0.5, 0.0, 2.0), (1.0, 0.0, 4.0), (1.5, 0.0, 6.0), (2.0, 0.0, 8.0)])
        f = fysiek.fysiek_per_spoor(posities)[1]
        self.assertAlmostEqual(f['afstand_m'], 8.0)
        self.assertAlmostEqual(f['topsnelheid_m_s'], 4.0)
        self.assertAlmostEqual(f['actieve_s'], 2.0)

    def test_een_lange_sprint_telt_een_keer(self):
        # 3 s aan 5 m/s zonder onderbreking: één sprint, niet drie.
        stappen = [(i * 0.5, 0.0, i * 2.5) for i in range(7)]
        f = fysiek.fysiek_per_spoor(_spoor(1, stappen))[1]
        self.assertEqual(f['sprints'], 1)

    def test_twee_sprints_met_rust_ertussen(self):
        stappen = (
            [(i * 0.5, 0.0, i * 2.5) for i in range(4)]                      # sprint 1: 0–1,5 s aan 5 m/s
            + [(2.0 + i * 0.5, 0.0, 7.5 + 0.1 * i) for i in range(4)]        # wandelen
            + [(4.0 + i * 0.5, 0.0, 8.0 + i * 2.5) for i in range(4)]        # sprint 2
        )
        f = fysiek.fysiek_per_spoor(_spoor(1, stappen))[1]
        self.assertEqual(f['sprints'], 2)

    def test_korte_versnelling_is_geen_sprint(self):
        # Eén snelle stap van 0,5 s haalt de minimale sprintduur (1 s) niet.
        posities = _spoor(1, [(0.0, 0.0, 0.0), (0.5, 0.0, 2.5), (1.0, 0.0, 2.6)])
        f = fysiek.fysiek_per_spoor(posities)[1]
        self.assertEqual(f['sprints'], 0)

    def test_gaten_en_teleportaties_tellen_niet_mee(self):
        posities = _spoor(1, [
            (0.0, 0.0, 0.0), (0.5, 0.0, 1.0),
            (5.0, 0.0, 30.0),   # gat van 4,5 s: spoor was zoek
            (5.5, 0.0, 36.0),   # 12 m/s: identiteitswissel, geen menselijke stap
            (6.0, 0.0, 37.0),
        ])
        f = fysiek.fysiek_per_spoor(posities)[1]
        self.assertAlmostEqual(f['afstand_m'], 2.0)  # enkel de twee gewone stappen
        self.assertEqual(f['sprints'], 0)

    def test_demo_toewijzing_bundelt_acht_sporen_tot_acht_spelers(self):
        posities = []
        for track in range(1, 9):
            posities += _spoor(track, [(0.0, 1.0 * track, 0.0), (1.0, 1.0 * track, 3.0)])
        per_spoor = fysiek.fysiek_per_spoor(posities)
        spelers, anoniem = fysiek.bundel_per_speler(per_spoor, fysiek.demo_toewijzing())
        self.assertEqual(len(spelers), 8)
        self.assertEqual(anoniem, [])
        thuis = [s for s in spelers if s['team'] == 'thuis']
        self.assertEqual(sorted(s['rugnummer'] for s in thuis), [1, 2, 3, 4])

    def test_idwissel_twee_sporen_zelfde_rugnummer_tellen_op(self):
        posities = _spoor(1, [(0.0, 0.0, 0.0), (1.0, 0.0, 2.0)]) + _spoor(9, [(10.0, 0.0, 2.0), (11.0, 0.0, 5.0)])
        per_spoor = fysiek.fysiek_per_spoor(posities)
        spelers, anoniem = fysiek.bundel_per_speler(per_spoor, {
            '1': {'team': 'thuis', 'rugnummer': 7},
            '9': {'team': 'thuis', 'rugnummer': 7},
        })
        self.assertEqual(len(spelers), 1)
        self.assertAlmostEqual(spelers[0]['afstand_m'], 5.0)
        self.assertEqual(anoniem, [])

    def test_sjabloon_is_invulklaar_en_direct_bruikbaar(self):
        posities = _spoor(1, [(0.0, 3.0, 5.0), (65.0, 3.0, 7.0)]) + _spoor(2, [(0.0, 10.0, 40.0), (10.0, 10.0, 41.0)])
        per_spoor = fysiek.fysiek_per_spoor(posities)
        sjabloon = fysiek.sjabloon_toewijzing(posities, per_spoor)
        self.assertIn('_uitleg', sjabloon)
        self.assertEqual(sjabloon['1']['team'], None)
        self.assertIn('0:00–1:05', sjabloon['1']['hint'])
        self.assertIn('(3.0, 6.0) m', sjabloon['1']['hint'])
        # Ingevuld sjabloon (hint en _uitleg blijven staan) werkt direct als toewijzing.
        sjabloon['1']['team'] = 'thuis'
        sjabloon['1']['rugnummer'] = 9
        spelers, anoniem = fysiek.bundel_per_speler(per_spoor, sjabloon)  # type: ignore[arg-type]
        self.assertEqual(len(spelers), 1)
        self.assertEqual(spelers[0]['rugnummer'], 9)
        self.assertEqual(anoniem, [2])

    def test_spoor_zonder_toewijzing_blijft_anoniem(self):
        per_spoor = fysiek.fysiek_per_spoor(_spoor(3, [(0.0, 0.0, 0.0), (1.0, 0.0, 1.0)]))
        spelers, anoniem = fysiek.bundel_per_speler(per_spoor, {})
        self.assertEqual(spelers, [])
        self.assertEqual(anoniem, [3])


if __name__ == '__main__':
    unittest.main()
