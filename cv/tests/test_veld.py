"""Unit-tests voor cv/veld.py — puur stdlib (unittest), geen cv2/numpy nodig.

Draai vanuit de repo-root:
    python3 -m unittest discover -s cv/tests

De verwachte waarden spiegelen src/lib/field.ts en het KVKBF-reglement:
veld 14 m breed, 26 m tussen de doellijnen, vrijeworplijn = doellijn + 4 m,
doelgebied-diepte 10 m (standaard) of 15 m (nieuwe terreinen).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

# cv/ op het pad zetten zodat `import veld` werkt, ongeacht vanwaar de tests draaien
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import veld  # noqa: E402


class TestConstanten(unittest.TestCase):
    def test_reglematen(self):
        self.assertEqual(veld.BREEDTE_M, 14.0)
        self.assertEqual(veld.SPEELVELD_LENGTE_M, 26.0)
        self.assertEqual(veld.VRIJEWORP_OFFSET_M, 4.0)
        self.assertEqual(veld.STANDAARD_DOELGEBIED_DIEPTE_M, 10.0)

    def test_totale_lengte(self):
        self.assertEqual(veld.totale_lengte_m(10), 46.0)
        self.assertEqual(veld.totale_lengte_m(15), 56.0)
        # standaardargument = diepte 10
        self.assertEqual(veld.totale_lengte_m(), 46.0)


class TestGenormaliseerdeLijnen(unittest.TestCase):
    """Identiek aan de field.ts-conventie: goalLineNorm / freeThrowNorm."""

    def test_doellijn_norm(self):
        self.assertAlmostEqual(veld.doellijn_norm(10), 10 / 46)
        self.assertAlmostEqual(veld.doellijn_norm(15), 15 / 56)

    def test_vrijeworplijn_norm(self):
        # field.ts-voorbeeld: vrijeworplijn bij diepte 10 → y = 14/46
        self.assertAlmostEqual(veld.vrijeworplijn_norm(10), 14 / 46)
        self.assertAlmostEqual(veld.vrijeworplijn_norm(15), 19 / 56)

    def test_middellijn_diepte_onafhankelijk(self):
        # de middellijn ligt altijd op y=0.5, welke diepte ook
        for diepte in (10, 12, 15):
            lengte = veld.totale_lengte_m(diepte)
            _, y_norm = veld.naar_norm(0, lengte / 2, diepte)
            self.assertAlmostEqual(y_norm, 0.5)


class TestConversies(unittest.TestCase):
    def test_naar_meters_spiegelt_to_meters(self):
        # toMeters({x:1, y:1}) → (14, totale lengte)
        self.assertEqual(veld.naar_meters(1.0, 1.0, 10), (14.0, 46.0))
        self.assertEqual(veld.naar_meters(1.0, 1.0, 15), (14.0, 56.0))
        self.assertEqual(veld.naar_meters(0.5, 0.5, 10), (7.0, 23.0))

    def test_heen_en_terug(self):
        for diepte in (10.0, 15.0):
            for x_norm, y_norm in ((0.0, 0.0), (1.0, 1.0), (0.25, 0.8), (0.5, 14 / 46)):
                x_m, y_m = veld.naar_meters(x_norm, y_norm, diepte)
                tx, ty = veld.naar_norm(x_m, y_m, diepte)
                self.assertAlmostEqual(tx, x_norm, places=12)
                self.assertAlmostEqual(ty, y_norm, places=12)

    def test_afstand_schaalt_met_veldlengte(self):
        # over de volle breedte: 14 m, onafhankelijk van de diepte
        self.assertAlmostEqual(veld.afstand_m((0, 0.5), (1, 0.5), 10), 14.0)
        self.assertAlmostEqual(veld.afstand_m((0, 0.5), (1, 0.5), 15), 14.0)
        # over de volle lengte: totale lengte, wél diepte-afhankelijk (zoals distanceM)
        self.assertAlmostEqual(veld.afstand_m((0.5, 0), (0.5, 1), 10), 46.0)
        self.assertAlmostEqual(veld.afstand_m((0.5, 0), (0.5, 1), 15), 56.0)


class TestInDoelgebied(unittest.TestCase):
    def test_beide_doelgebieden(self):
        g = veld.doellijn_norm(10)
        self.assertTrue(veld.in_doelgebied(g / 2, 10))  # thuis-doelgebied
        self.assertTrue(veld.in_doelgebied(1 - g / 2, 10))  # uit-doelgebied
        self.assertFalse(veld.in_doelgebied(0.5, 10))  # middellijn
        # exact óp de doellijn = niet in het doelgebied (strikte ongelijkheid, cf. field.ts)
        self.assertFalse(veld.in_doelgebied(g, 10))
        self.assertFalse(veld.in_doelgebied(1 - g, 10))


class TestKruispunten(unittest.TestCase):
    def _als_dict(self, diepte):
        return {k.label: k for k in veld.kruispunten(diepte)}

    def test_aantal_en_nummering(self):
        punten = veld.kruispunten(10)
        # 7 dwarslijnen (achterlijn/doellijn/vrijeworplijn ×2 + middellijn) × 2 zijlijnen
        self.assertEqual(len(punten), 14)
        self.assertEqual([k.nummer for k in punten], list(range(1, 15)))
        self.assertEqual(len({k.label for k in punten}), 14)

    def test_coordinaten_diepte_10(self):
        p = self._als_dict(10)
        self.assertEqual((p['achterlijn_thuis_links'].x_m, p['achterlijn_thuis_links'].y_m), (0.0, 0.0))
        self.assertEqual((p['achterlijn_thuis_rechts'].x_m, p['achterlijn_thuis_rechts'].y_m), (14.0, 0.0))
        self.assertEqual(p['doellijn_thuis_links'].y_m, 10.0)
        self.assertEqual(p['vrijeworplijn_thuis_links'].y_m, 14.0)
        self.assertEqual(p['middellijn_links'].y_m, 23.0)
        self.assertEqual(p['vrijeworplijn_uit_links'].y_m, 32.0)
        self.assertEqual(p['doellijn_uit_links'].y_m, 36.0)
        self.assertEqual((p['achterlijn_uit_rechts'].x_m, p['achterlijn_uit_rechts'].y_m), (14.0, 46.0))
        # 26 m tussen de doellijnen, vrijeworplijn = doellijn + 4 m
        self.assertEqual(p['doellijn_uit_links'].y_m - p['doellijn_thuis_links'].y_m, 26.0)
        self.assertEqual(p['vrijeworplijn_thuis_links'].y_m - p['doellijn_thuis_links'].y_m, 4.0)

    def test_coordinaten_diepte_15(self):
        p = self._als_dict(15)
        self.assertEqual(p['doellijn_thuis_links'].y_m, 15.0)
        self.assertEqual(p['vrijeworplijn_thuis_links'].y_m, 19.0)
        self.assertEqual(p['middellijn_links'].y_m, 28.0)
        self.assertEqual(p['vrijeworplijn_uit_links'].y_m, 37.0)
        self.assertEqual(p['doellijn_uit_links'].y_m, 41.0)
        self.assertEqual(p['achterlijn_uit_links'].y_m, 56.0)
        self.assertEqual(p['doellijn_uit_links'].y_m - p['doellijn_thuis_links'].y_m, 26.0)

    def test_genormaliseerd_consistent_met_meters(self):
        for diepte in (10, 15):
            for k in veld.kruispunten(diepte):
                x_m, y_m = veld.naar_meters(k.x_norm, k.y_norm, diepte)
                self.assertAlmostEqual(x_m, k.x_m, places=9, msg=k.label)
                self.assertAlmostEqual(y_m, k.y_m, places=9, msg=k.label)

    def test_vrijeworplijn_voorbeeld_field_ts(self):
        # het gedocumenteerde field.ts-voorbeeld: diepte 10 → vrijeworplijn thuis op y = 14/46
        p = self._als_dict(10)
        self.assertAlmostEqual(p['vrijeworplijn_thuis_links'].y_norm, 14 / 46)
        self.assertAlmostEqual(p['vrijeworplijn_uit_links'].y_norm, 1 - 14 / 46)

    def test_kruispunt_per_label(self):
        labels = veld.kruispunt_per_label(10)
        self.assertEqual(len(labels), 14)
        self.assertIn('doellijn_thuis_links', labels)
        self.assertEqual(labels['middellijn_rechts'].x_m, 14.0)


if __name__ == '__main__':
    unittest.main()
