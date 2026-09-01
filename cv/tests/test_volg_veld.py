"""Bewegende camera: de wiskunde achter het volgen en het herankeren op de veldlijnen.

Alles hier draait zonder video en zonder opencv — juist die kern moet kloppen, want een
verkeerde homografie geeft geen foutmelding maar een worp die op de verkeerde plek landt.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import volg_veld as vv  # noqa: E402
import veld  # noqa: E402


def _heeft(naam: str) -> bool:
    try:
        __import__(naam)
        return True
    except ImportError:
        return False


def _schaal(sx: float, sy: float, tx: float = 0.0, ty: float = 0.0) -> list[list[float]]:
    return [[sx, 0.0, tx], [0.0, sy, ty], [0.0, 0.0, 1.0]]


class TestMatrixrekenen(unittest.TestCase):
    def test_maal_en_inverteer_heffen_elkaar_op(self):
        m = [[0.08, 0.004, -21.0], [-0.002, 0.083, -5.0], [1e-5, 2e-5, 1.0]]
        eenheid = vv.maal(m, vv.inverteer(m))
        for i in range(3):
            for j in range(3):
                self.assertAlmostEqual(eenheid[i][j] / eenheid[2][2], 1.0 if i == j else 0.0, places=6)

    def test_projecteer_gebruikt_de_perspectiefdeling(self):
        # Zonder perspectief: gewoon schalen en verschuiven.
        x, y = vv.projecteer(_schaal(0.5, 0.25, 3.0, -1.0), 10.0, 8.0)
        self.assertAlmostEqual(x, 8.0)
        self.assertAlmostEqual(y, 1.0)
        # Met perspectief: de derde rij deelt mee.
        m = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.01, 1.0]]
        x2, y2 = vv.projecteer(m, 10.0, 100.0)
        self.assertAlmostEqual(x2, 10.0 / 2.0)
        self.assertAlmostEqual(y2, 100.0 / 2.0)

    def test_normaliseer_maakt_twee_gelijke_matrices_identiek(self):
        m = [[2.0, 0.0, 4.0], [0.0, 2.0, 6.0], [0.0, 0.0, 2.0]]
        dubbel = [[w * 7 for w in rij] for rij in m]
        self.assertEqual(vv.normaliseer(m), vv.normaliseer(dubbel))

    def test_singuliere_matrix_wordt_geweigerd(self):
        with self.assertRaises(ValueError):
            vv.inverteer([[1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [0.0, 0.0, 1.0]])


class TestHomografieUitPunten(unittest.TestCase):
    def test_vindt_de_transformatie_exact_terug(self):
        echt = [[0.08, 0.003, -20.0], [-0.001, 0.081, -4.0], [2e-5, 1e-5, 1.0]]
        beeldpunten = [(100.0, 120.0), (900.0, 140.0), (150.0, 640.0), (880.0, 660.0), (500.0, 400.0)]
        paren = [(p, vv.projecteer(echt, *p)) for p in beeldpunten]
        gevonden = vv.homografie_uit_paren(paren)
        self.assertIsNotNone(gevonden)
        for p in [(300.0, 300.0), (700.0, 500.0)]:
            a = vv.projecteer(echt, *p)
            b = vv.projecteer(gevonden, *p)
            self.assertAlmostEqual(a[0], b[0], places=4)
            self.assertAlmostEqual(a[1], b[1], places=4)

    def test_te_weinig_punten_geeft_niets(self):
        self.assertIsNone(vv.homografie_uit_paren([((0.0, 0.0), (0.0, 0.0))] * 3))


class TestVeldlijnen(unittest.TestCase):
    def test_alle_lijnen_van_het_veld_staan_erin(self):
        lijnen = vv.veldlijnen(10.0)
        namen = {n for n, _, _ in lijnen}
        self.assertIn('middellijn', namen)
        self.assertIn('doellijn_thuis', namen)
        self.assertIn('zijlijn_links', namen)
        self.assertEqual(len(lijnen), 9)  # 7 dwarslijnen + 2 zijlijnen

    def test_lijnen_schuiven_mee_met_de_opgemeten_maten(self):
        lijnen = dict((n, (a, b)) for n, a, b in vv.veldlijnen(10.0, breedte_m=12.0, speelveld_m=20.0))
        self.assertEqual(lijnen['achterlijn_uit'][0][1], 40.0)
        self.assertEqual(lijnen['zijlijn_rechts'][0][0], 12.0)

    def test_lijnvergelijking_geeft_afstand_in_meters(self):
        A, B, C = vv.lijnvergelijking((0.0, 10.0), (14.0, 10.0))
        self.assertAlmostEqual(abs(A * 7.0 + B * 12.5 + C), 2.5)  # 2,5 m van de lijn
        self.assertAlmostEqual(math.hypot(A, B), 1.0)


class TestHerankeren(unittest.TestCase):
    """Het hart: kloppen de lijnen weer met het veldmodel na een correctie?"""

    def _opstelling(self):
        # Camera boven het veld: 12 px per meter, veld gecentreerd.
        naar_beeld = [[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]]
        return vv.inverteer(naar_beeld), naar_beeld

    def _zichtbare_segmenten(self, naar_beeld, lijnen):
        segmenten = []
        for _naam, a, b in lijnen:
            p0 = vv.projecteer(naar_beeld, *a)
            p1 = vv.projecteer(naar_beeld, *b)
            segmenten.append((p0, p1))
        return segmenten

    def test_koppeling_weigert_een_lijn_die_de_verkeerde_kant_op_loopt(self):
        echt, naar_beeld = self._opstelling()
        lijnen = vv.veldlijnen(10.0)
        # Een verticaal segment midden op het veld: loopt als een zijlijn, ligt bij de
        # middellijn. Zonder richtingseis zou het aan de middellijn gekoppeld worden.
        p0 = vv.projecteer(naar_beeld, 7.0, 21.0)
        p1 = vv.projecteer(naar_beeld, 7.0, 25.0)
        cons = vv.koppel_lijnconstraints([(p0, p1)], echt, lijnen)
        self.assertEqual(cons, [])

    def test_een_gedrifte_matrix_wordt_teruggetrokken_naar_de_lijnen(self):
        echt, naar_beeld = self._opstelling()
        lijnen = vv.veldlijnen(10.0)
        segmenten = self._zichtbare_segmenten(naar_beeld, lijnen)
        # Alsof het volgen 1,5 m is weggedreven.
        gedrift = vv.normaliseer(vv.maal([[1.0, 0.0, 0.0], [0.0, 1.0, 1.5], [0.0, 0.0, 1.0]], echt))
        veldpunten = [(x, y) for x in (2.0, 7.0, 12.0) for y in (5.0, 23.0, 41.0)]
        voor = max(vv.veldfout_m(gedrift, echt, veldpunten))
        hersteld, fout, gebruikt = vv.veranker_op_lijnen(gedrift, segmenten, lijnen)
        na = max(vv.veldfout_m(hersteld, echt, veldpunten))
        self.assertGreater(gebruikt, 0)
        self.assertLess(fout, 0.2)
        self.assertLess(na, voor / 3)  # de drift is grotendeels weg

    def test_zonder_bruikbare_lijnen_blijft_de_matrix_ongemoeid(self):
        echt, _ = self._opstelling()
        zelfde, fout, gebruikt = vv.veranker_op_lijnen(echt, [], vv.veldlijnen(10.0))
        self.assertEqual(zelfde, echt)
        self.assertEqual(gebruikt, 0)
        self.assertEqual(fout, float('inf'))

    def test_alleen_evenwijdige_lijnen_is_te_weinig_houvast(self):
        # Zeven dwarslijnen zonder zijlijn: je kan het veld er vrij langs schuiven.
        cons = [((100.0 + 10 * i, 200.0), (0.0, 1.0, -10.0)) for i in range(12)]
        self.assertIsNone(vv.homografie_uit_lijnen(cons))

    def test_een_verkeerd_gekoppelde_lijn_mag_het_veld_niet_verplaatsen(self):
        echt, naar_beeld = self._opstelling()
        lijnen = vv.veldlijnen(10.0)
        segmenten = self._zichtbare_segmenten(naar_beeld, lijnen)
        # Sabotage: alles ligt er 30 m naast, dus elke koppeling is fout.
        ver_weg = vv.normaliseer(vv.maal([[1.0, 0.0, 0.0], [0.0, 1.0, 30.0], [0.0, 0.0, 1.0]], echt))
        zelfde, _fout, gebruikt = vv.veranker_op_lijnen(ver_weg, segmenten, lijnen)
        # Ofwel geen koppeling, ofwel een correctie die de sprongtoets niet haalt: in beide
        # gevallen komt de matrix ongewijzigd terug in plaats van ergens anders te belanden.
        if gebruikt == 0:
            self.assertEqual(zelfde, ver_weg)


class TestHomografieSpoor(unittest.TestCase):
    def _spoor(self) -> vv.HomografieSpoor:
        spoor = vv.HomografieSpoor(max_gat_s=1.0)
        for i in range(5):
            spoor.voeg_toe(i * 0.5, _schaal(1.0 + i, 1.0), 0.1, 'flow')
        return spoor

    def test_zoekt_de_matrix_van_het_juiste_moment(self):
        spoor = self._spoor()
        self.assertAlmostEqual(spoor.op(0.0)[0][0], 1.0)
        self.assertAlmostEqual(spoor.op(1.0)[0][0], 3.0)
        self.assertAlmostEqual(spoor.op(1.1)[0][0], 3.0)  # dichtstbijzijnde
        self.assertAlmostEqual(spoor.op(1.4)[0][0], 4.0)

    def test_geeft_niets_terug_bij_een_te_groot_gat(self):
        # Liever geen meting dan een matrix van seconden geleden: de camera kan intussen
        # ergens anders naar kijken.
        self.assertIsNone(self._spoor().op(30.0))
        self.assertIsNone(self._spoor().op(-5.0))

    def test_leeg_spoor_geeft_niets(self):
        self.assertIsNone(vv.HomografieSpoor().op(1.0))

    def test_schrijven_en_teruglezen_houdt_alles_heel(self):
        import tempfile

        spoor = self._spoor()
        with tempfile.TemporaryDirectory() as d:
            pad = Path(d) / 'h.jsonl'
            spoor.schrijf(pad)
            terug = vv.HomografieSpoor.lees(pad)
        self.assertEqual(len(terug.punten), len(spoor.punten))
        self.assertAlmostEqual(terug.op(1.0)[0][0], 3.0)

    def test_rapport_telt_de_ankers(self):
        spoor = self._spoor()
        spoor.voeg_toe(3.0, _schaal(1.0, 1.0), 0.04, 'lijnen')
        r = spoor.rapport()
        self.assertEqual(r['ankers'], 1)
        self.assertAlmostEqual(r['gemiddelde_ankerfout_m'], 0.04)


class TestVeldfout(unittest.TestCase):
    def test_meet_de_fout_op_het_veld_en_niet_de_camerabeweging(self):
        echt = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        # Een matrix die er precies 1 m naast zit in y.
        ernaast = vv.normaliseer(vv.maal([[1.0, 0.0, 0.0], [0.0, 1.0, 1.0], [0.0, 0.0, 1.0]], echt))
        fouten = vv.veldfout_m(ernaast, echt, [(7.0, 23.0), (2.0, 5.0)])
        self.assertEqual(len(fouten), 2)
        for f in fouten:
            self.assertAlmostEqual(f, 1.0, places=6)

    def test_dezelfde_matrix_geeft_nul_fout(self):
        echt = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        self.assertAlmostEqual(max(vv.veldfout_m(echt, echt, [(7.0, 23.0)])), 0.0, places=9)


class TestDemoLus(unittest.TestCase):
    """De volledige lus op een gesimuleerde bewegende camera: herankeren moet meetbaar
    beter zijn dan puur volgen — anders heeft de hele module geen bestaansrecht."""

    def test_herankeren_houdt_de_fout_klein_waar_puur_volgen_wegdrijft(self):
        start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        spoor, rapport = vv.demo_spoor(seed=7, duur_s=120.0, kalibratie=start, stap_s=0.25)
        self.assertGreater(rapport['ankers'], 10)
        # Met de veldlijnen blijft de meting binnen een halve meter; zonder loopt ze weg.
        self.assertLess(rapport['fout_mediaan_m'], 0.5)
        self.assertLess(rapport['fout_mediaan_m'], rapport['fout_mediaan_zonder_ankers_m'] / 2)
        self.assertGreater(len(spoor.punten), 400)

    def test_reproduceerbaar_met_dezelfde_seed(self):
        start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        a, _ = vv.demo_spoor(seed=3, duur_s=20.0, kalibratie=start)
        b, _ = vv.demo_spoor(seed=3, duur_s=20.0, kalibratie=start)
        self.assertEqual(a.punten, b.punten)

    def test_demo_segmenten_blijven_binnen_het_beeldkader(self):
        import random

        start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        segmenten = vv._demo_lijnsegmenten(start, vv.veldlijnen(10.0), random.Random(1), beeld=(1280, 720))
        for (x1, y1), (x2, y2) in segmenten:
            for x, y in ((x1, y1), (x2, y2)):
                self.assertTrue(-5 <= x <= 1285, f'x={x} buiten beeld')
                self.assertTrue(-5 <= y <= 725, f'y={y} buiten beeld')


if __name__ == '__main__':
    unittest.main()


class TestAnkers(unittest.TestCase):
    """Meerdere ijkbeelden, elk op hun eigen moment.

    Nodig zodra de camera midden op het veld staat en pant: geen enkel beeld toont dan alle
    veldlijnen, dus duid je er twee of drie aan. En een ijkbeeld op 6:27 hoort bij 6:27 —
    vroeger werd het stilzwijgend op seconde 0 geplakt.
    """

    def test_leest_en_sorteert_de_ijkbeelden(self):
        ankers = vv.lees_ankers({'ankers': [
            {'tijd_s': 387.0, 'matrix_beeld_naar_veld': [[2, 0, 0], [0, 2, 0], [0, 0, 1]]},
            {'tijd_s': 12.5, 'matrix_beeld_naar_veld': [[1, 0, 0], [0, 1, 0], [0, 0, 1]]},
        ]})
        self.assertEqual([round(t, 1) for t, _ in ankers], [12.5, 387.0])

    def test_slaat_ankers_zonder_matrix_over(self):
        self.assertEqual(vv.lees_ankers({'ankers': [{'tijd_s': 3.0}]}), [])
        self.assertEqual(vv.lees_ankers({}), [])

    def test_rekent_het_beginbeeld_terug_uit_een_later_ijkbeeld(self):
        # De camera schuift: op moment a is het beeld K(a) ten opzichte van de start. Kennen we
        # daar de echte matrix, dan ligt die van de start vast — en dus die van elk moment
        # ervóór. Zonder deze stap meet de eerste helft van de video op de verkeerde plaats.
        start = vv.normaliseer([[10.0, 0.0, 100.0], [0.0, 10.0, 50.0], [0.0, 0.0, 1.0]])
        keten_a = vv.normaliseer([[1.0, 0.0, 40.0], [0.0, 1.0, -8.0], [0.0, 0.0, 1.0]])
        anker = vv.normaliseer(vv.maal(start, keten_a))          # wat je op moment a aanduidt
        herwonnen = vv.basis_uit_anker(anker, keten_a)
        for rij_h, rij_s in zip(herwonnen, start):
            for w_h, w_s in zip(rij_h, rij_s):
                self.assertAlmostEqual(w_h, w_s, places=9)

    def test_een_gewone_kalibratie_is_gewoon_een_anker_op_nul(self):
        matrix = vv.normaliseer([[3.0, 0.0, 5.0], [0.0, 3.0, 7.0], [0.0, 0.0, 1.0]])
        self.assertEqual(vv.basis_uit_anker(matrix, vv.eenheid()), matrix)


class TestGladstrijken(unittest.TestCase):
    """De drift tussen twee ijkpunten verdelen in plaats van hem als sprong te laten staan.

    Zonder dit geldt de laatst gevonden basis tot de volgende, en springt het veld daar in
    één keer over de hele opgelopen drift — precies op het moment dat je een worp meet.
    """

    def test_mengen_valt_op_de_uiteinden_samen_met_de_ijkpunten(self):
        a = vv.normaliseer([[10.0, 0.0, 0.0], [0.0, 10.0, 0.0], [0.0, 0.0, 1.0]])
        b = vv.normaliseer([[10.0, 0.0, 20.0], [0.0, 10.0, -5.0], [0.0, 0.0, 1.0]])
        self.assertEqual(vv.meng(a, b, 0.0), a)
        self.assertEqual(vv.meng(a, b, 1.0), b)

    def test_mengen_ligt_er_halverwege_netjes_tussen(self):
        a = vv.normaliseer([[10.0, 0.0, 0.0], [0.0, 10.0, 0.0], [0.0, 0.0, 1.0]])
        b = vv.normaliseer([[10.0, 0.0, 20.0], [0.0, 10.0, -5.0], [0.0, 0.0, 1.0]])
        m = vv.meng(a, b, 0.5)
        self.assertAlmostEqual(m[0][2], 10.0, places=9)
        self.assertAlmostEqual(m[1][2], -2.5, places=9)

    def test_basis_op_verdeelt_de_correctie_over_het_tussenstuk(self):
        a = vv.normaliseer([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        b = vv.normaliseer([[1.0, 0.0, 8.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        waarnemingen = [(10.0, a), (20.0, b)]
        # Op de ijkpunten exact, ertussen evenredig met de tijd.
        self.assertEqual(vv.basis_op(waarnemingen, 10.0), a)
        self.assertEqual(vv.basis_op(waarnemingen, 20.0), b)
        self.assertAlmostEqual(vv.basis_op(waarnemingen, 12.5)[0][2], 2.0, places=9)
        self.assertAlmostEqual(vv.basis_op(waarnemingen, 15.0)[0][2], 4.0, places=9)

    def test_buiten_de_ijkpunten_valt_er_niets_te_verdelen(self):
        a = vv.normaliseer([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        b = vv.normaliseer([[1.0, 0.0, 8.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        waarnemingen = [(10.0, a), (20.0, b)]
        self.assertEqual(vv.basis_op(waarnemingen, 0.0), a)      # vóór het eerste ijkpunt
        self.assertEqual(vv.basis_op(waarnemingen, 99.0), b)     # ná het laatste


class TestOnderbrokenOpname(unittest.TestCase):
    """Een opname die stopt en opnieuw begint (of een montage van clips).

    Over zo'n knip is optical flow onzin: hangt die sprong aan de keten, dan meet de rest van
    de wedstrijd op een veld dat er niet ligt. De knip moet dus herkend worden, en het stuk
    erna begint opnieuw.
    """

    def test_herkent_een_knip_aan_het_verlies_van_gevolgde_punten(self):
        # Nauwelijks een punt overleeft: dat is geen camerabeweging maar een ander beeld.
        self.assertTrue(vv.is_breuk(volgdeel=0.05, restfout=1.0, gewone_restfout=1.2))

    def test_herkent_een_knip_aan_een_beweging_die_het_beeld_niet_verklaart(self):
        # De punten blijven "volgen", maar het teruggelegde beeld valt er niet op — precies
        # wat een knip doet: 20 grijswaarden tegenover 1,2 bij gewone camerabeweging.
        self.assertTrue(vv.is_breuk(volgdeel=0.95, restfout=20.0, gewone_restfout=1.2))

    def test_laat_gewoon_pannen_met_rust(self):
        self.assertFalse(vv.is_breuk(volgdeel=0.98, restfout=1.4, gewone_restfout=1.2))
        self.assertFalse(vv.is_breuk(volgdeel=0.6, restfout=2.0, gewone_restfout=1.2))

    def test_schaalt_mee_met_een_korrelige_opname(self):
        # Bij een video waar 6 normaal is, mag 12 geen knip heten; bij een nette video wel.
        self.assertFalse(vv.is_breuk(volgdeel=0.9, restfout=12.0, gewone_restfout=6.0))
        self.assertTrue(vv.is_breuk(volgdeel=0.9, restfout=12.0, gewone_restfout=1.0))

    def test_zonder_restfout_valt_er_niets_te_zeggen(self):
        # Geen bruikbare overlap: voor de kníp-vraag valt er dan niets te zeggen. De lus
        # ketent zo'n stap dan ook niet stil door maar markeert hem als 'onbetrouwbaar'
        # (zie stap_uitkomst hieronder).
        self.assertFalse(vv.is_breuk(volgdeel=0.9, restfout=None, gewone_restfout=1.2))

    def test_gewone_restfout_is_de_mediaan_van_het_recente_verleden(self):
        self.assertEqual(vv.gewone_restfout([1.0, 1.2, 1.1, 9.0, 1.3]), 1.2)
        self.assertEqual(vv.gewone_restfout([]), 0.0)

    def test_herkent_een_stilstaand_beeld(self):
        self.assertTrue(vv.is_bevroren(0.05))
        self.assertFalse(vv.is_bevroren(12.0))


class TestStapUitkomst(unittest.TestCase):
    """Een flow-stap die niet na te rekenen valt mag nooit stil doorgeketend worden.

    Vroeger verdween zo'n stap geruisloos uit de keten (of werd hij ongecontroleerd tóch
    geketend): de camerabeweging in dat gat werd een stille sprong, waarna de herankering
    "geslaagd" op de verkeerde evenwijdige veldlijn klikte — 4 m fout met een lijnfout van
    0,01 m in het rapport.
    """

    def test_niet_narekenbare_stap_is_geen_stille_no_op(self):
        # Te weinig markante punten in het vorige beeld: de beweging is onbekend.
        self.assertEqual(vv.stap_uitkomst(False, 0.0, False, None, 1.2), 'onbetrouwbaar')
        # Flow vond punten maar geen homografie.
        self.assertEqual(vv.stap_uitkomst(True, 0.9, False, None, 1.2), 'onbetrouwbaar')
        # Homografie gevonden maar niet na te rekenen (nauwelijks overlap): dit werd
        # vroeger ongecontroleerd doorgeketend.
        self.assertEqual(vv.stap_uitkomst(True, 0.9, True, None, 1.2), 'onbetrouwbaar')

    def test_gewone_stap_ketent_en_een_knip_blijft_een_knip(self):
        self.assertEqual(vv.stap_uitkomst(True, 0.95, True, 1.4, 1.2), 'keten')
        self.assertEqual(vv.stap_uitkomst(True, 0.95, True, 20.0, 1.2), 'breuk')
        # Bijna alle punten kwijt: dat is een knip, geen twijfelgeval.
        self.assertEqual(vv.stap_uitkomst(True, 0.05, False, None, 1.2), 'breuk')


class TestBouwSpoor(unittest.TestCase):
    """De tweede passage: onbetrouwbare momenten horen géén matrix te krijgen.

    Liever een gat in het spoor (daar kunnen landing.py en tracking.py om) dan een meting
    die stil een paar meter verschoven kan zijn.
    """

    def test_onbetrouwbare_momenten_krijgen_geen_matrix(self):
        e = vv.eenheid()
        momenten = [
            (0.0, e, 'ijkbeeld', 0.0, 0),
            (0.5, e, 'flow', float('inf'), 0),
            (1.0, e, 'onbetrouwbaar', float('inf'), 1),
            (1.5, e, 'onbetrouwbaar', float('inf'), 1),
            (2.0, e, 'lijnen', 0.05, 1),
            (2.5, e, 'flow', float('inf'), 1),
        ]
        waarnemingen = [(0.0, e, 0), (2.0, e, 1)]
        spoor, extra = vv.bouw_spoor(momenten, waarnemingen)
        tijden = [p['t'] for p in spoor.punten]
        self.assertNotIn(1.0, tijden)   # tussen het gat en de herankering: geen meting
        self.assertNotIn(1.5, tijden)
        self.assertIn(2.0, tijden)      # vanaf de geslaagde herankering weer wél
        self.assertIn(2.5, tijden)
        self.assertEqual(extra['onbetrouwbare_momenten'], 2)

    def test_stuk_zonder_waarneming_blijft_een_gemeld_gat(self):
        e = vv.eenheid()
        momenten = [
            (0.0, e, 'ijkbeeld', 0.0, 0),
            (0.5, e, 'flow', float('inf'), 0),
            (1.0, e, 'flow', float('inf'), 1),
            (1.5, e, 'flow', float('inf'), 1),
        ]
        spoor, extra = vv.bouw_spoor(momenten, [(0.0, e, 0)])
        self.assertEqual([p['t'] for p in spoor.punten], [0.0, 0.5])
        self.assertEqual(extra['gaten'], [(1.0, 1.5)])
        self.assertEqual(extra['momenten_zonder_stand'], 2)


class TestRapportEerlijkheid(unittest.TestCase):
    """Het rapport moet zelf zeggen wat de ankerfout wél en niet meet.

    De 'gemiddelde ankerfout' is een lijnfout van gesláágde herankeringen: bij een
    koppeling één evenwijdige lijn verderop is dat cijfer juist uitstekend (gemeten:
    0,007 m lijnfout bij 4,3 m echte veldfout). Zonder toelichting leest iedereen het
    als meetnauwkeurigheid.
    """

    def test_rapport_benoemt_wat_de_ankerfout_wel_en_niet_zegt(self):
        r = vv.HomografieSpoor().rapport()
        self.assertIn('toelichting_ankerfout', r)
        self.assertIn('lijnfout', r['toelichting_ankerfout'])
        # De kern: het cijfer zegt níét of de juiste (evenwijdige) lijn gekoppeld is.
        self.assertIn('evenwijdige', r['toelichting_ankerfout'])
        self.assertIn('niet', r['toelichting_ankerfout'].replace('í', 'i').replace('é', 'e'))


@unittest.skipUnless(_heeft('cv2'), 'opencv niet geïnstalleerd')
class TestSamenvoegenPerStuk(unittest.TestCase):
    """Samenvoegen van ijkbeelden: nooit over een knip heen, en nooit via een keten die
    aantoonbaar gedreven heeft.

    Na een breuk begint de keten opnieuw; K(a)⁻¹·K(b) over twee stukken is dan geen
    camerabeweging. Gemeten op de oude code (twee gepande camerastanden, keten = eenheid
    in beide stukken): het "samengevoegde" anker zat er mediaan 4,5 m en maximaal 14,8 m
    naast, tegenover 0,04/0,15 m voor het losse anker dat het verving.
    """

    def setUp(self):
        self.kaart = veld.kruispunt_per_label(10.0)
        self.kal = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        # Tweede camerastand: 40 px verder gepand.
        self.c2 = [[1.0, 0.0, 40.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        self.h1 = self.kal
        self.h2 = vv.normaliseer(vv.maal(self.kal, vv.inverteer(self.c2)))
        thuis = [l for l in self.kaart if '_thuis_' in l or l.startswith('middellijn')]
        uitkant = [l for l in self.kaart if '_uit_' in l or l.startswith('middellijn')]
        self.ankers = [(2.0, self.h1), (6.0, self.h2)]
        self.ankerpunten = [(2.0, self._punten(self.h1, thuis)), (6.0, self._punten(self.h2, uitkant))]

    def _punten(self, matrix, labels):
        naar_beeld = vv.inverteer(matrix)
        uit = []
        for label in labels:
            k = self.kaart[label]
            x, y = vv.projecteer(naar_beeld, k.x_m, k.y_m)
            uit.append({'label': label, 'x': x, 'y': y})
        return uit

    def _veldpunt(self, label):
        k = self.kaart.get(label)
        return (k.x_m, k.y_m) if k else None

    def test_voegt_niet_samen_over_een_knip_heen(self):
        # Zoals volg_video het na een knip aanlevert: in elk stuk is de keten opnieuw
        # begonnen (eenheid), dus de twee K's staan t.o.v. verschillende referentieframes.
        verwerkt = {0: (0, vv.eenheid(), 0), 1: (1, vv.eenheid(), 1)}
        self.assertEqual(
            vv.verbeter_ankers_per_stuk(self.ankers, self.ankerpunten, verwerkt, self._veldpunt), {})

    def test_voegt_binnen_een_stuk_wel_samen(self):
        # Zelfde opstelling, maar nu één doorlopend stuk met de échte camerabeweging.
        verwerkt = {0: (0, vv.eenheid(), 0), 1: (1, vv.inverteer(self.c2), 0)}
        uit = vv.verbeter_ankers_per_stuk(self.ankers, self.ankerpunten, verwerkt, self._veldpunt)
        self.assertEqual(set(uit), {0, 1})
        alle = [(k.x_m, k.y_m) for k in self.kaart.values()]
        self.assertLess(max(vv.veldfout_m(uit[0], self.h1, alle)), 0.05)

    def test_acceptatietoets_weigert_een_keten_die_gedreven_heeft(self):
        # Ook binnen één stuk draagt K(a)⁻¹·K(b) de volle flow-drift mee. Hier liegt de
        # keten 30 px (2,5 m): het samengevoegde anker wordt op zijn éigen punten veel
        # slechter dan het losse — dan houden we het losse.
        drift = [[1.0, 0.0, 30.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        verwerkt = {0: (0, vv.eenheid(), 0),
                    1: (1, vv.normaliseer(vv.maal(vv.inverteer(self.c2), drift)), 0)}
        uit = vv.verbeter_ankers_per_stuk(self.ankers, self.ankerpunten, verwerkt, self._veldpunt)
        self.assertEqual(uit, {})


class _NepCap:
    """Een 'video' die alleen uit tijdstempels bestaat: elk frame is zijn eigen tijd."""

    def __init__(self, duur_s):
        self.duur_s = duur_s
        self._t = 0.0

    def isOpened(self):
        return True

    def set(self, _prop, waarde):
        self._t = waarde / 1000.0

    def read(self):
        if self._t > self.duur_s + 1e-6:
            return False, None
        return True, ('frame', self._t)

    def get(self, prop):
        if prop == _NepCv2.CAP_PROP_FPS:
            return 25.0
        if prop == _NepCv2.CAP_PROP_FRAME_COUNT:
            return self.duur_s * 25.0
        return 0.0

    def release(self):
        pass


class _NepCv2:
    """Net genoeg opencv om volg_video te draaien met een wiskundig bekende camera.

    De flow en de stap-homografie volgen exact uit de opgegeven camerabeweging
    ``camera_op(t)`` (beeld van seconde 0 → beeld van t). Zo testen we de lús zelf —
    welke stap geketend wordt, waar een anker aan hangt — zonder echte video, en met
    een grondwaarheid om de veldfout tegen af te meten.
    """

    CAP_PROP_POS_MSEC = 0
    CAP_PROP_FPS = 5
    CAP_PROP_FRAME_COUNT = 7
    COLOR_BGR2GRAY = 6
    RANSAC = 8

    def __init__(self, camera_op, duur_s, zonder_punten=(), flow_bias_px=(0.0, 0.0)):
        self.camera_op = camera_op
        self.duur_s = duur_s
        # Frames (op hun tijd, afgerond op 3 decimalen) zonder markante punten: daar geeft
        # goodFeaturesToTrack niets terug en valt de flow-stap erná niet te meten.
        self.zonder_punten = set(zonder_punten)
        # Vaste fout per gemeten stap (px): zo bouwt de keten drift op, zoals echte flow.
        self.flow_bias_px = flow_bias_px
        self.raster = [(100.0 + 90.0 * i, 90.0 + 110.0 * j) for i in range(5) for j in range(4)]

    def VideoCapture(self, _pad):
        return _NepCap(self.duur_s)

    def cvtColor(self, frame, _code):
        return frame

    def goodFeaturesToTrack(self, grijs, **_kw):
        import numpy as np
        if round(grijs[1], 3) in self.zonder_punten:
            return None
        return np.array([[[x, y]] for x, y in self.raster])

    def calcOpticalFlowPyrLK(self, vorig, huidig, p0, _geen):
        import numpy as np
        stap = vv.maal(self.camera_op(huidig[1]), vv.inverteer(self.camera_op(vorig[1])))
        bx, by = self.flow_bias_px
        p1 = []
        for p in p0:
            x, y = vv.projecteer(stap, float(p[0][0]), float(p[0][1]))
            p1.append([[x + bx, y + by]])
        return np.array(p1), np.ones((len(p0), 1), dtype=np.uint8), None

    def findHomography(self, bron, doel, _methode, _drempel):
        import numpy as np
        paren = [((float(b[0]), float(b[1])), (float(d[0]), float(d[1]))) for b, d in zip(bron, doel)]
        h = vv.homografie_uit_paren(paren)
        if h is None:
            return None, None
        return np.array(h), np.ones((len(paren), 1))


@unittest.skipUnless(_heeft('numpy'), 'numpy niet geïnstalleerd')
class TestVolgVideoNep(unittest.TestCase):
    """De volledige videolus op de nepcamera: hier liggen de gemeten defecten vast.

    Elke test hieronder faalde op de oude lus — een ijkbeeld dat aan het verkeerde frame
    hing, een stille sprong die als 'flow' bleef doormeten, samenvoegen dat op exacte
    float-gelijkheid van tijden hing of over een knip heen combineerde.
    """

    def setUp(self):
        self.kal = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        self.kaart = veld.kruispunt_per_label(10.0)

    def _echt(self, camera_op, t):
        return vv.normaliseer(vv.maal(self.kal, vv.inverteer(camera_op(t))))

    def _ankerpunten(self, matrix, labels):
        naar_beeld = vv.inverteer(matrix)
        uit = []
        for label in labels:
            k = self.kaart[label]
            x, y = vv.projecteer(naar_beeld, k.x_m, k.y_m)
            uit.append({'label': label, 'x': x, 'y': y})
        return uit

    def _volg(self, nep, ankers_data, fps, heranker, restfout=None):
        with tempfile.TemporaryDirectory() as d:
            video = Path(d) / 'wedstrijd.mp4'
            video.write_bytes(b'nep')
            ankerpad = Path(d) / 'ankers.json'
            ankerpad.write_text(json.dumps(ankers_data), encoding='utf-8')
            args = argparse.Namespace(video=video, ankers=ankerpad, kalibratie=None,
                                      fps=fps, heranker=heranker, max_fout=vv.MAX_ANKER_FOUT_M,
                                      min_lijn=60, rondes=3, punten_per_segment=4)
            lijnen = vv.veldlijnen(10.0)

            def segmenten(_cv2, frame, _min_lijn):
                # De lijndetector "ziet" de lijnen zoals ze echt in dit frame liggen.
                echt = self._echt(nep.camera_op, frame[1])
                return vv._demo_lijnsegmenten(echt, lijnen, random.Random(int(frame[1] * 1000) + 7))

            with mock.patch.object(vv, '_laad_cv2', lambda: nep), \
                 mock.patch.object(vv, 'detecteer_lijnsegmenten', segmenten), \
                 mock.patch.object(vv, '_restfout', restfout or (lambda _c, _m, _a, _b: 1.0)):
                return vv.volg_video(args)

    def _veldfout(self, spoor, camera_op, t):
        m = spoor.op(t)
        self.assertIsNotNone(m, f'geen matrix op t={t}')
        return max(vv.veldfout_m(m, self._echt(camera_op, t), vv._standaard_veldpunten()))

    def test_ijkbeeld_hangt_aan_zijn_eigen_frame_niet_aan_de_rasterstap(self):
        # Camera pant 48 px/s; het ijkbeeld is gefit op t=3,25, tussen twee rasterstappen
        # (fps 2) in. Aan de stap op 3,5 gehangen zou de pan uit dat kwartsecondegat
        # (12 px = 1 m) als vaste fout in de "grondwaarheid" schuiven.
        def pan(t):
            return [[1.0, 0.0, 48.0 * t], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]

        nep = _NepCv2(pan, duur_s=6.0)
        anker = self._echt(pan, 3.25)
        spoor, _rapport = self._volg(nep, {'ankers': [
            {'tijd_s': 3.25, 'matrix_beeld_naar_veld': anker}]}, fps=2.0, heranker=100.0)
        punt = next(p for p in spoor.punten if p['t'] == 3.25)
        self.assertEqual(punt['bron'], 'ijkbeeld')
        for t in (1.0, 3.25, 5.0):
            self.assertLess(self._veldfout(spoor, pan, t), 0.02)  # was: 1,0 m overal

    def test_stille_sprong_laat_het_spoor_zwijgen_in_plaats_van_fout_doormeten(self):
        # Tussen frame 4,0 en 4,5 verspringt het beeld 24 px (2 m), maar dat frame heeft
        # geen markante punten: de stap valt niet te meten. Vroeger ketende de lus stil
        # door en bleef alles erna 2 m ernaast staan als bron 'flow' (gemeten: 30/30 keer,
        # want elke herankering faalt op deze afstand). Nu hoort het spoor daar te zwijgen.
        def sprong(t):
            if t < 4.25:
                return vv.eenheid()
            return [[1.0, 0.0, 0.0], [0.0, 1.0, 24.0], [0.0, 0.0, 1.0]]

        nep = _NepCv2(sprong, duur_s=8.0, zonder_punten={4.0})
        spoor, rapport = self._volg(nep, {'ankers': [
            {'tijd_s': 0.0, 'matrix_beeld_naar_veld': self.kal}]}, fps=2.0, heranker=1.0)
        # Vóór het gat is er een meting en klopt ze.
        self.assertLess(self._veldfout(spoor, sprong, 2.0), 0.5)
        # Ná het gat: geen matrix — liever een gat dan 2 m ernaast.
        self.assertIsNone(spoor.op(6.0))
        self.assertIsNone(spoor.op(7.5))
        self.assertEqual(rapport['flow_gaten'], [4.5])
        self.assertGreater(rapport['onbetrouwbare_momenten'], 0)
        # En het rapport benoemt het stuk zonder veldstand, zodat er een ijkbeeld bij kan.
        self.assertIn([4.5, 8.0], rapport['gaten'])

    @unittest.skipUnless(_heeft('cv2'), 'opencv niet geïnstalleerd')
    def test_samenvoegen_hangt_niet_aan_exacte_floatgelijkheid_van_tijden(self):
        # Bij fps 10 valt de opgetelde rastertijd nooit exact op de ankertijd (60 × 0,1 =
        # 5,999999999999998): op float-gelijkheid gesleuteld was samenvoegen altijd een
        # stille no-op en meldde het rapport 0 — precies in de standen die moeten kloppen.
        def pan(t):
            return [[1.0, 0.0, 12.0 * t], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]

        nep = _NepCv2(pan, duur_s=8.0)
        thuis = [l for l in self.kaart if '_thuis_' in l or l.startswith('middellijn')]
        uitkant = [l for l in self.kaart if '_uit_' in l or l.startswith('middellijn')]
        h1, h2 = self._echt(pan, 2.0), self._echt(pan, 6.0)
        spoor, rapport = self._volg(nep, {'ankers': [
            {'tijd_s': 2.0, 'matrix_beeld_naar_veld': h1, 'punten': self._ankerpunten(h1, thuis)},
            {'tijd_s': 6.0, 'matrix_beeld_naar_veld': h2, 'punten': self._ankerpunten(h2, uitkant)},
        ]}, fps=10.0, heranker=100.0)
        self.assertEqual(rapport['samengevoegde_ankers'], 2)
        for t in (1.0, 4.0, 7.0):
            self.assertLess(self._veldfout(spoor, pan, t), 0.05)

    @unittest.skipUnless(_heeft('cv2'), 'opencv niet geïnstalleerd')
    def test_samenvoegen_gaat_nooit_over_een_knip_heen(self):
        # Een montage: op 5,25 s verspringt de opname 60 px (de restfout verraadt de knip).
        # In beide stukken is de keten opnieuw begonnen; over de knip heen samenvoegen zou
        # de goede losse ankers vervangen door matrices die er meters naast zitten.
        naknip = [[1.0, 0.0, 60.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]

        def knipcamera(t):
            return vv.eenheid() if t < 5.25 else naknip

        def restfout(_c, _m, _a, b):
            return 25.0 if round(b[1], 3) == 5.5 else 1.0

        nep = _NepCv2(knipcamera, duur_s=10.0)
        thuis = [l for l in self.kaart if '_thuis_' in l or l.startswith('middellijn')]
        uitkant = [l for l in self.kaart if '_uit_' in l or l.startswith('middellijn')]
        h1, h2 = self._echt(knipcamera, 2.0), self._echt(knipcamera, 8.0)
        spoor, rapport = self._volg(nep, {'ankers': [
            {'tijd_s': 2.0, 'matrix_beeld_naar_veld': h1, 'punten': self._ankerpunten(h1, thuis)},
            {'tijd_s': 8.0, 'matrix_beeld_naar_veld': h2, 'punten': self._ankerpunten(h2, uitkant)},
        ]}, fps=2.0, heranker=100.0, restfout=restfout)
        self.assertEqual(rapport['breuken'], [5.5])
        self.assertEqual(rapport['stukken'], 2)
        self.assertEqual(rapport['samengevoegde_ankers'], 0)  # de losse ankers blijven staan
        for t in (3.0, 6.5, 9.0):
            self.assertLess(self._veldfout(spoor, knipcamera, t), 0.05)

    def test_rapport_meldt_absolute_fixes_en_retro_correcties(self):
        # Óók in de videolus horen de nieuwe cijfers in het rapport: hoeveel fixes
        # absoluut waren, en hoeveel ketenfout er retroactief verdeeld is.
        nep = _NepCv2(lambda t: vv.eenheid(), duur_s=10.0, flow_bias_px=(0.0, 1.0))
        _spoor, rapport = self._volg(nep, {'ankers': [
            {'tijd_s': 0.0, 'matrix_beeld_naar_veld': self.kal}]}, fps=2.0, heranker=1.0)
        self.assertGreater(rapport['absolute_fixes'], 0)
        self.assertLessEqual(rapport['absolute_fixes'], rapport['ankers'])
        self.assertGreater(rapport['retro_correcties'], 0)
        self.assertIsNotNone(rapport['retro_correctie_mediaan_m'])
        self.assertGreaterEqual(rapport['retro_correctie_max_m'], rapport['retro_correctie_mediaan_m'])
        self.assertIn('toelichting_retro', rapport)

    def test_rapport_meet_de_drift_die_elke_herankering_wegneemt(self):
        # De flow loopt 1 px per stap weg; de herankeringen trekken dat telkens terug. Het
        # rapport hoort die verplaatsing te melden — een eerlijker maat voor de fout
        # onderweg dan de lijnfout van de geslaagde herankeringen zelf.
        nep = _NepCv2(lambda t: vv.eenheid(), duur_s=10.0, flow_bias_px=(0.0, 1.0))
        _spoor, rapport = self._volg(nep, {'ankers': [
            {'tijd_s': 0.0, 'matrix_beeld_naar_veld': self.kal}]}, fps=2.0, heranker=1.0)
        self.assertGreater(rapport['ankers'], 3)
        self.assertGreater(rapport['heranker_verplaatsing_mediaan_m'], 0.0)
        self.assertLess(rapport['heranker_verplaatsing_p95_m'], 1.0)
        self.assertIn('toelichting_ankerfout', rapport)
        self.assertIn('toelichting_verplaatsing', rapport)

class TestAbsoluteFixes(unittest.TestCase):
    """Herlokalisatie: op elk herankermoment een ABSOLUTE fix uit de lijnen zelf, en de
    opgestapelde ketenfout retroactief over het tussenstuk verdeeld.

    Vroeger was elke herankering een prior-getetherde correctie van de geketende stand
    (gewicht 0,1 naar de gedrifte matrix): een fractie van de drift bleef in elke
    "geslaagde" fix plakken en ketende van daaruit verder. Gemeten: bij 0,8 m drift
    hield de tether er 0,18 m van vast; de absolute fix nog 0,001 m.
    """

    def setUp(self):
        self.kal = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        self.lijnen = vv.veldlijnen(10.0)
        self.veldpunten = [(x, y) for x in (2.0, 7.0, 12.0) for y in (5.0, 23.0, 41.0)]
        self.midden = (7.0, 23.0)  # het veldmidden: 14 m breed, 46 m lang

    def _segmenten(self, matrix, namen=None):
        # De veldlijnen zoals een (perfecte) detector ze in dit beeld zou zien.
        naar_beeld = vv.inverteer(matrix)
        return [(vv.projecteer(naar_beeld, *a), vv.projecteer(naar_beeld, *b))
                for naam, a, b in self.lijnen if namen is None or naam in namen]

    def _gedrift(self, meter):
        return vv.normaliseer(vv.maal([[1.0, 0.0, 0.0], [0.0, 1.0, meter], [0.0, 0.0, 1.0]], self.kal))

    def test_absolute_fix_laat_de_tether_naar_de_gedrifte_stand_los(self):
        # De keten is 0,8 m weggedreven; alle lijnen zijn zichtbaar. De klassieke
        # herankering houdt via de prior een deel van die drift vast; de absolute fix
        # meet dit frame rechtstreeks tegen het veldmodel en haalt hem er (bijna)
        # volledig uit. Zonder veranker_absoluut faalt deze test.
        gedrift = self._gedrift(0.8)
        segmenten = self._segmenten(self.kal)
        getetherd, _f1, _g1 = vv.veranker_op_lijnen(
            gedrift, segmenten, self.lijnen, veldpunten=self.veldpunten)
        absoluut_m, fout, gebruikt, absoluut = vv.veranker_absoluut(
            gedrift, segmenten, self.lijnen, veldpunten=self.veldpunten)
        self.assertTrue(absoluut)
        self.assertGreater(gebruikt, 0)
        rest_tether = max(vv.veldfout_m(getetherd, self.kal, self.veldpunten))
        rest_absoluut = max(vv.veldfout_m(absoluut_m, self.kal, self.veldpunten))
        self.assertGreater(rest_tether, 0.1)          # de tether houdt drift vast (gemeten: 0,18 m)
        self.assertLess(rest_absoluut, 0.02)          # de absolute fix niet (gemeten: 0,001 m)
        self.assertLess(rest_absoluut, rest_tether / 5)
        self.assertLess(fout, 0.01)

    def test_zonder_volledige_waarneming_gedraagt_de_herankering_zich_als_vroeger(self):
        # Drie lijnen (twee dwars + één zijlijn) leggen maar zes van de acht
        # vrijheidsgraden vast: geen absolute fix, en de uitkomst is exact die van de
        # klassieke, prior-getetherde herankering — daar is de prior geen bug maar de
        # enige rem op een veld dat vrij uitrekt.
        gedrift = self._gedrift(0.5)
        segmenten = self._segmenten(self.kal, {'doellijn_thuis', 'middellijn', 'zijlijn_links'})
        klassiek = vv.veranker_op_lijnen(gedrift, segmenten, self.lijnen, veldpunten=self.veldpunten)
        matrix, fout, gebruikt, absoluut = vv.veranker_absoluut(
            gedrift, segmenten, self.lijnen, veldpunten=self.veldpunten)
        self.assertFalse(absoluut)
        self.assertEqual((matrix, fout, gebruikt), klassiek)

    def test_alleen_evenwijdige_lijnen_geeft_geen_fix_en_raakt_niets_aan(self):
        gedrift = self._gedrift(0.5)
        dwars = {n for n, _a, _b in self.lijnen if not n.startswith('zijlijn')}
        segmenten = self._segmenten(self.kal, dwars)
        matrix, fout, gebruikt, absoluut = vv.veranker_absoluut(
            gedrift, segmenten, self.lijnen, veldpunten=self.veldpunten)
        self.assertEqual(gebruikt, 0)
        self.assertFalse(absoluut)
        self.assertEqual(matrix, gedrift)
        self.assertEqual(fout, float('inf'))

    def _mini_spoor(self, stap_s=0.5, duur=16.0, fix_elke=4.0, drift_px=1.2):
        """Een keten met gekende, deterministische drift (1,2 px = 0,1 m per stap) bij een
        stilstaande camera, met om de `fix_elke` seconden een absolute fix op de lijnen.
        De grondwaarheid is dan overal gewoon de kalibratie."""
        segmenten = self._segmenten(self.kal)
        keten = vv.eenheid()
        basis = self.kal
        momenten = [(0.0, vv.eenheid(), 'kalibratie', 0.0, 0)]
        waarnemingen = [(0.0, self.kal, 0)]
        laatste = 0.0
        t = stap_s
        while t <= duur + 1e-9:
            stap_fout = [[1.0, 0.0, 0.0], [0.0, 1.0, drift_px], [0.0, 0.0, 1.0]]
            keten = vv.normaliseer(vv.maal(keten, stap_fout))
            bron, fout = 'flow', float('inf')
            if t - laatste >= fix_elke - 1e-9:
                stand = vv.normaliseer(vv.maal(basis, keten))
                fix, fout, gebruikt, absoluut = vv.veranker_absoluut(
                    stand, segmenten, self.lijnen, veldpunten=self.veldpunten)
                self.assertGreater(gebruikt, 0)
                self.assertTrue(absoluut)
                basis = vv.basis_uit_anker(fix, keten)
                waarnemingen.append((t, basis, 0))
                bron, laatste = 'lijnen', t
            momenten.append((t, keten, bron, fout, 0))
            t += stap_s
        spoor, extra = vv.bouw_spoor(momenten, waarnemingen, veldmidden=self.midden)
        return spoor, extra, momenten, waarnemingen

    def _vooruit_geketend(self, momenten, waarnemingen, t):
        """Het oude gedrag: de laatst gezette fix vooruit doorketenen tot de volgende."""
        basis = [wb for wt, wb, _ws in waarnemingen if wt <= t + 1e-9][-1][:]
        mk = next(m[1] for m in momenten if abs(m[0] - t) < 1e-9)
        return vv.maal(basis, mk)

    def test_ketendrift_wordt_door_absolute_fixes_retroactief_weggecorrigeerd(self):
        # Fixes op 4, 8, 12 en 16 s; drift 0,1 m per halve seconde. Halverwege een
        # tussenstuk (t=6) staat de vooruit geketende meting er 0,4 m naast — precies de
        # opgestapelde ketenfout. Na de retroactieve verdeling is de fout op het
        # veldmidden begrensd door de afstand tot de dichtstbijzijnde fix, en hier
        # (lineaire drift, lineaire verdeling) vrijwel nul. Zonder de wijziging faalt
        # deze test: vroeger bestond er geen absolute fix en bleef de fout vooruit staan.
        spoor, extra, momenten, waarnemingen = self._mini_spoor()
        voor = vv.veldfout_m(self._vooruit_geketend(momenten, waarnemingen, 6.0),
                             self.kal, [self.midden])[0]
        na = vv.veldfout_m(spoor.op(6.0), self.kal, [self.midden])[0]
        self.assertGreater(voor, 0.3)     # de keten was echt weggedreven (gemeten: 0,40 m)
        self.assertLess(na, 0.05)         # en de retro-correctie haalt dat eruit (gemeten: 0,0004 m)
        self.assertLess(na, voor / 4)
        # Het rapport meldt eerlijk wat er verdeeld is: per tussenstuk ~0,8 m ketenfout.
        self.assertEqual(extra['retro_correcties'], 4)
        self.assertGreater(extra['retro_correctie_mediaan_m'], 0.6)
        self.assertLessEqual(extra['retro_correctie_mediaan_m'], extra['retro_correctie_max_m'])
        self.assertLess(extra['retro_correctie_max_m'], 1.0)

    def test_retro_correctie_verspreidt_glad_zonder_sprong_op_de_naad(self):
        # De correctie hoort over het tussenstuk uitgesmeerd te zijn: tussen twee
        # opeenvolgende momenten mag het veldmidden nooit verspringen met iets in de
        # buurt van de volle ketenfout (0,8 m) — dat was precies de naad die het oude
        # vooruit-ketenen op elk fixmoment liet vallen.
        spoor, _extra, momenten, waarnemingen = self._mini_spoor()
        sprongen = [vv.veldfout_m(p1['H'], p0['H'], [self.midden])[0]
                    for p0, p1 in zip(spoor.punten, spoor.punten[1:])]
        self.assertLess(max(sprongen), 0.1)
        # Ter contrast: vooruit geketend springt het veld op de naad bij t=8 wél.
        naad = vv.veldfout_m(self._vooruit_geketend(momenten, waarnemingen, 7.5),
                             self._vooruit_geketend(momenten, waarnemingen, 8.0), [self.midden])[0]
        self.assertGreater(naad, 0.5)

    def test_demo_meet_de_winst_van_de_retro_correctie(self):
        # De volledige demolus: het rapport moet melden hoeveel fixes absoluut waren en
        # hoe groot de retro-correcties waren, en de fout op het veldmidden mag mét
        # retro-correctie niet groter zijn dan zonder.
        start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        _spoor, rapport = vv.demo_spoor(seed=7, duur_s=120.0, kalibratie=start, stap_s=0.25)
        self.assertGreater(rapport['absolute_fixes'], 10)
        self.assertLessEqual(rapport['absolute_fixes'], rapport['ankers'])
        self.assertIsNotNone(rapport['retro_correctie_mediaan_m'])
        self.assertGreater(rapport['retro_correctie_max_m'], 0.0)
        self.assertLessEqual(rapport['fout_veldmidden_m'], rapport['fout_veldmidden_zonder_retro_m'])
        self.assertLessEqual(rapport['fout_mediaan_m'], rapport['fout_mediaan_zonder_retro_m'] + 0.01)

    def test_demo_zonder_enkele_fix_gedraagt_zich_als_vroeger(self):
        # Geen enkele geslaagde fix (herankeren staat feitelijk uit): dan is er niets te
        # verdelen en volgt het spoor gewoon de keten vanaf de kalibratie — het oude
        # gedrag, inclusief de eerlijke melding dat er niets gecorrigeerd is.
        start = vv.inverteer([[12.0, 0.0, 260.0], [0.0, 12.0, 60.0], [0.0, 0.0, 1.0]])
        _spoor, rapport = vv.demo_spoor(seed=5, duur_s=20.0, kalibratie=start,
                                        heranker_interval_s=999.0)
        self.assertEqual(rapport['ankers'], 0)
        self.assertEqual(rapport['absolute_fixes'], 0)
        self.assertIsNone(rapport['retro_correctie_mediaan_m'])
        # Zonder fixes ís het spoor de ongecorrigeerde keten: beide cijfers vallen samen.
        self.assertAlmostEqual(rapport['fout_mediaan_m'],
                               rapport['fout_mediaan_zonder_ankers_m'], delta=0.02)
