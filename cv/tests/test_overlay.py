"""Controle-overlay: klopt wat er getekend wordt?

De overlay is het gereedschap waarmee je met eigen ogen beoordeelt of de meting klopt.
Tekent hij op de verkeerde plek, dan keur je een goede meting af (of omgekeerd) — dus de
geometrie eronder wordt hier zonder video en zonder opencv nagerekend.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import overlay  # noqa: E402
import volg_veld as vv  # noqa: E402


def _camera() -> tuple[list[list[float]], list[list[float]]]:
    """Camera recht boven het veld: 12 px per meter, veld gecentreerd in 1280×720."""
    naar_beeld = [[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]]
    return vv.inverteer(naar_beeld), naar_beeld


class TestKnippenOpBeeld(unittest.TestCase):
    def test_segment_binnen_beeld_blijft_heel(self):
        geknipt = overlay.knip_op_beeld((100.0, 100.0), (900.0, 400.0), 1280, 720)
        self.assertEqual(geknipt, ((100.0, 100.0), (900.0, 400.0)))

    def test_segment_dat_uitsteekt_wordt_afgesneden(self):
        # Een veldlijn loopt vaak ver buiten beeld door; die punten mogen niet meegaan.
        geknipt = overlay.knip_op_beeld((-5000.0, 300.0), (5000.0, 300.0), 1280, 720, marge=0)
        self.assertIsNotNone(geknipt)
        (x0, _y0), (x1, _y1) = geknipt
        self.assertAlmostEqual(x0, 0.0)
        self.assertAlmostEqual(x1, 1280.0)

    def test_segment_volledig_buiten_beeld_valt_weg(self):
        self.assertIsNone(overlay.knip_op_beeld((-900.0, -900.0), (-800.0, -800.0), 1280, 720, marge=0))

    def test_evenwijdig_net_buiten_de_rand_valt_weg(self):
        self.assertIsNone(overlay.knip_op_beeld((100.0, 900.0), (1000.0, 900.0), 1280, 720, marge=0))


class TestVeldmodel(unittest.TestCase):
    def test_tekent_de_veldlijnen_op_hun_echte_plek(self):
        m, naar_beeld = _camera()
        model = overlay.veldmodel_in_beeld(m, 1280, 720)
        namen = {naam for naam, _, _ in model}
        self.assertIn('middellijn', namen)
        # De middellijn ligt op y = 23 m → 23 × 12 + 60 = 336 px.
        for naam, p0, p1 in model:
            if naam == 'middellijn':
                self.assertAlmostEqual(p0[1], 336.0, places=1)
                self.assertAlmostEqual(p1[1], 336.0, places=1)

    def test_lijnen_schuiven_mee_met_de_opgemeten_maten(self):
        m, _ = _camera()
        kort = dict((n, (a, b)) for n, a, b in overlay.veldmodel_in_beeld(
            m, 1280, 720, diepte_m=10.0, breedte_m=12.0, speelveld_m=20.0))
        # Totale lengte 40 m → middellijn op 20 m → 20 × 12 + 60 = 300 px.
        self.assertAlmostEqual(kort['middellijn'][0][1], 300.0, places=1)

    def test_onbruikbare_matrix_geeft_gewoon_niets(self):
        singulier = [[1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [0.0, 0.0, 1.0]]
        self.assertEqual(overlay.veldmodel_in_beeld(singulier, 1280, 720), [])


class TestBalspoor(unittest.TestCase):
    def _worp(self) -> dict:
        return {
            'video_time_s': 10.0,
            'spoor': [[10.0, 100.0, 400.0], [10.4, 200.0, 300.0], [10.8, 320.0, 380.0]],
            'los_px': [100.0, 400.0],
            'landing_px': [320.0, 380.0],
            'landing_t': 10.8,
        }

    def test_toont_het_spoor_tot_op_dit_moment(self):
        punten, los, landing = overlay.balspoor_op_moment([self._worp()], 10.5)
        self.assertEqual(len(punten), 2)  # het derde punt komt pas op 10,8
        self.assertEqual(los, (100.0, 400.0))
        self.assertIsNone(landing)  # de bal ligt nog niet op de grond

    def test_markeert_de_landing_pas_wanneer_de_bal_neerkomt(self):
        _punten, _los, landing = overlay.balspoor_op_moment([self._worp()], 11.0)
        self.assertEqual(landing, (320.0, 380.0))

    def test_een_oude_worp_hangt_niet_in_beeld(self):
        punten, los, landing = overlay.balspoor_op_moment([self._worp()], 40.0)
        self.assertEqual(punten, [])
        self.assertIsNone(los)
        self.assertIsNone(landing)

    def test_voor_de_worp_is_er_nog_niets(self):
        self.assertEqual(overlay.balspoor_op_moment([self._worp()], 5.0)[0], [])


class TestSpelerposities(unittest.TestCase):
    def test_zet_veldmeters_terug_op_hun_plek_in_beeld(self):
        m, _ = _camera()
        posities = [{'t': 12.0, 'track': 3, 'x_m': 7.0, 'y_m': 23.0}]
        gevonden = overlay.posities_op_moment(posities, m, 12.0)
        self.assertEqual(len(gevonden), 1)
        track, (px, py) = gevonden[0]
        self.assertEqual(track, 3)
        self.assertAlmostEqual(px, 7.0 * 12 + 260, places=1)
        self.assertAlmostEqual(py, 23.0 * 12 + 60, places=1)

    def test_posities_van_een_ander_moment_tellen_niet_mee(self):
        m, _ = _camera()
        posities = [{'t': 12.0, 'track': 3, 'x_m': 7.0, 'y_m': 23.0}]
        self.assertEqual(overlay.posities_op_moment(posities, m, 30.0), [])


class TestStatusregel(unittest.TestCase):
    def test_toont_tijd_en_herkomst_van_de_veldstand(self):
        regel = overlay.statusregel(75.5, {'bron': 'lijnen', 'fout_m': 0.04})
        self.assertIn('1:15.5', regel)
        self.assertIn('herankerd', regel)
        self.assertIn('0.04 m', regel)

    def test_waarschuwt_wanneer_er_geen_veldstand_is(self):
        # Zonder matrix mag er niets gemeten worden — dat moet in beeld staan, niet stil
        # gebeuren, anders denk je dat de meting doorloopt.
        self.assertIn('GEEN VELDSTAND', overlay.statusregel(12.0, None))

    def test_gevolgd_zonder_fout_leest_ook_netjes(self):
        regel = overlay.statusregel(3.0, {'bron': 'flow', 'fout_m': None})
        self.assertIn('gevolgd', regel)
        self.assertNotIn('afwijking', regel)

    def test_alles_wat_in_beeld_gebrand_wordt_is_ascii(self):
        # Het lettertype van opencv kent geen '·' of '—' en tekent er '??' voor in de plaats —
        # dat stond zo in de eerste controlevideo. Vandaar deze grens, niet alleen een fix.
        teksten = [
            overlay.LEGENDE,
            overlay.statusregel(75.5, {'bron': 'lijnen', 'fout_m': 0.04}),
            overlay.statusregel(12.0, None),
            overlay.statusregel(3.0, {'bron': 'flow', 'fout_m': None}),
        ]
        for tekst in teksten:
            self.assertTrue(tekst.isascii(), f'niet-tekenbaar teken in: {tekst}')


class TestStanden(unittest.TestCase):
    """De ruil rekentijd ↔ precisie moet een echte ruil zijn, geen etiket."""

    def test_nauwkeurig_meet_dichter_en_herankert_vaker(self):
        snel, gewoon, nauwkeurig = (vv.STANDEN[n] for n in ('snel', 'gewoon', 'nauwkeurig'))
        self.assertLess(snel['fps'], gewoon['fps'])
        self.assertLess(gewoon['fps'], nauwkeurig['fps'])
        self.assertGreater(snel['heranker'], nauwkeurig['heranker'])
        self.assertGreater(nauwkeurig['rondes'], gewoon['rondes'])
        self.assertGreater(nauwkeurig['punten_per_segment'], gewoon['punten_per_segment'])

    def test_nauwkeurig_haalt_meer_uit_een_onrustige_camera(self):
        # Bij een camera die snel pant loopt de drift tussen twee ankers op; dan is vaker
        # herankeren écht beter. (Bij een rustige opname schelen de standen nauwelijks —
        # daarom staat 'gewoon' als standaard.)
        origineel = vv.demo_camerabeweging
        vv.demo_camerabeweging = lambda t, amplitude_px=140.0, zoom=0.06: origineel(t * 4.0, amplitude_px * 2, zoom * 2)
        try:
            start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
            resultaten = {}
            for naam in ('gewoon', 'nauwkeurig'):
                st = vv.STANDEN[naam]
                _spoor, rapport = vv.demo_spoor(
                    7, 120.0, start, stap_s=1.0 / st['fps'], heranker_interval_s=st['heranker'],
                    rondes=st['rondes'], punten_per_segment=st['punten_per_segment'],
                )
                resultaten[naam] = rapport['fout_mediaan_m']
        finally:
            vv.demo_camerabeweging = origineel
        self.assertLess(resultaten['nauwkeurig'], resultaten['gewoon'])


if __name__ == '__main__':
    unittest.main()
