#!/usr/bin/env python3
"""Regressietests voor calibrate.py (doorlichting 2026-09, as uitlijning-vast).

Drie vondsten, elk met het meetrecept van de verificatie als test:

1. Ontaarding: een puntenset waarvan alle punten op één na op één rechte liggen
   (één zijlijn afgedekt door spelers → drie punten links, één rechts) werd stil
   aanvaard. De homografie heeft dan oneindig veel exact passende oplossingen en
   cv2 kiest er willekeurig één: het rapport toont 0,00 px terwijl de andere
   veldhelft er tientallen meters naast zit. Het kalibratiepad moet zo'n set
   weigeren met uitleg.
2. Rapportbreedte: het CLI-rapport gaf de speelveldlengte positioneel door als
   bréédte van de precisiekaart, en bemonsterde zo naast het veld — het rapport
   sprak de JSON van hetzelfde bestand tegen (zijlijncamera: ~65-70% te ruw).
3. --draai-180: matrix en punten draaiden mee, maar precisie_m_per_px,
   camerapositie en camerastandpunt bleven staan — het gedraaide bestand beweerde
   het spiegelbeeld van waar de opstelling scherp meet.
"""

from __future__ import annotations

import contextlib
import io
import json
import math
import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import calibrate  # noqa: E402
import veld  # noqa: E402

DIEPTE, BREED, SPEEL = 10.0, 14.0, 26.0
LENGTE = veld.totale_lengte_m(DIEPTE, SPEEL)
B, H = 1920, 1080


def _camera(pos, kijk, f=1400.0):
    """Pinhole-camera zoals in de andere testbestanden: veldpunt (z=0) → beeldpunt."""
    vw = [k - p for k, p in zip(kijk, pos)]
    n = math.dist((0, 0, 0), vw); vw = [c / n for c in vw]
    op = [0, 0, 1]
    r = [vw[1] * op[2] - vw[2] * op[1], vw[2] * op[0] - vw[0] * op[2], vw[0] * op[1] - vw[1] * op[0]]
    n = math.dist((0, 0, 0), r); r = [c / n for c in r]
    u = [r[1] * vw[2] - r[2] * vw[1], r[2] * vw[0] - r[0] * vw[2], r[0] * vw[1] - r[1] * vw[0]]

    def naar_beeld(x, y):
        d = [x - pos[0], y - pos[1], -pos[2]]
        xc = sum(a * q for a, q in zip(d, r))
        yc = sum(a * q for a, q in zip(d, u))
        zc = sum(a * q for a, q in zip(d, vw))
        if zc <= 0.1:
            return None
        return (B / 2 + f * xc / zc, H / 2 - f * yc / zc)

    return naar_beeld


def _klikpunten(naar_beeld, labels=None):
    """Zichtbare kruispunten als klikpunt-records, optioneel beperkt tot een labellijst."""
    kaart = veld.kruispunt_per_label(DIEPTE, BREED, SPEEL)
    gekozen = [kaart[l] for l in labels] if labels is not None else list(kaart.values())
    uit = []
    for k in gekozen:
        p = naar_beeld(k.x_m, k.y_m)
        if p and 0 <= p[0] <= B and 0 <= p[1] <= H:
            uit.append({'label': k.label, 'beeld_px': [p[0], p[1]], 'veld_m': [k.x_m, k.y_m]})
    return uit


# Het doorlichtingsscenario: één zijlijn afgedekt (positie achter-thuis, 's' gedrukt),
# gekalibreerd met het toegestane minimum van vier punten — drie links, één rechts.
ONTAARD = ['achterlijn_thuis_links', 'doellijn_thuis_links', 'vrijeworplijn_thuis_links',
           'achterlijn_thuis_rechts']
# Twee punten op élke zijlijn bevatten altijd een viertal in algemene positie.
GEZOND = ['achterlijn_thuis_links', 'achterlijn_thuis_rechts',
          'doellijn_thuis_links', 'doellijn_thuis_rechts']

# Camera midden achter de thuislijn — ziet alle veertien kruispunten in beeld.
ACHTER_THUIS = ((BREED / 2, -14.0, 8.0), (BREED / 2, LENGTE / 2, 0.0))


def _punt_args(labels, ruis_seed=None):
    """--punt argumenten voor de headless CLI, met optioneel de ruis uit de doorlichting.

    Seed 0 met gauss(0, 0,3 px) is het gemeten geval dat vóór de fix álle controles
    passeerde (exitcode 0, rapport 0,00 px) — vandaar vastgepind, niet willekeurig.
    """
    nb = _camera(*ACHTER_THUIS)
    rng = random.Random(ruis_seed) if ruis_seed is not None else None
    argv = []
    for p in _klikpunten(nb, labels):
        px, py = p['beeld_px']
        if rng is not None:
            px += rng.gauss(0, 0.3)
            py += rng.gauss(0, 0.3)
        argv += ['--punt', f'{px:.2f},{py:.2f}={p["label"]}']
    return argv


def _veldpunten(labels):
    """Puntrecords zonder camera: voor de zuivere ontaardingstoets telt enkel veld_m."""
    kaart = veld.kruispunt_per_label(DIEPTE, BREED, SPEEL)
    return [{'label': l, 'beeld_px': [0.0, 0.0], 'veld_m': [kaart[l].x_m, kaart[l].y_m]}
            for l in labels]


class TestOntaarding(unittest.TestCase):
    def test_alle_punten_op_een_na_collineair_wordt_geweigerd(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err), self.assertRaises(SystemExit) as ctx:
            calibrate.controleer_ontaarding(_veldpunten(ONTAARD))
        self.assertNotEqual(ctx.exception.code, 0)
        self.assertIn('rechte', err.getvalue())
        self.assertIn('zijlijn', err.getvalue())

    def test_volledig_collineair_wordt_ook_geweigerd(self):
        # Vier punten op dezelfde zijlijn: nog steeds ontaard (cv2 ving dit al, maar de
        # controle hoort het vóór de fit te zeggen, met dezelfde uitleg).
        labels = ['achterlijn_thuis_links', 'doellijn_thuis_links',
                  'vrijeworplijn_thuis_links', 'middellijn_links']
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            calibrate.controleer_ontaarding(_veldpunten(labels))

    def test_twee_punten_per_zijlijn_is_geen_ontaarding(self):
        calibrate.controleer_ontaarding(_veldpunten(GEZOND))  # geen fout

    def test_drie_op_een_lijn_plus_twee_ernaast_mag(self):
        # De grens: mét een tweede punt op de andere zijlijn is de set wél bepaald.
        labels = ONTAARD + ['doellijn_thuis_rechts']
        calibrate.controleer_ontaarding(_veldpunten(labels))  # geen fout

    def test_cli_weigert_de_afgedekte_zijlijn_met_uitleg(self):
        # Vóór de fix: exitcode 0, bestand geschreven en een rapport van 0,00 px —
        # terwijl doellijn_thuis_rechts door de gefitte matrix 63 m ernaast landde.
        with tempfile.TemporaryDirectory() as d:
            uitpad = Path(d) / 'kalibratie.json'
            argv = ['--diepte', '10', '--uit', str(uitpad)] + _punt_args(ONTAARD, ruis_seed=0)
            err = io.StringIO()
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit) as ctx:
                    calibrate.main(argv)
            self.assertNotEqual(ctx.exception.code, 0)
            self.assertIn('rechte', err.getvalue())
            self.assertFalse(uitpad.exists())

    def test_cli_aanvaardt_twee_punten_per_zijlijn(self):
        # De tegenproef: een minimale maar gezonde set blijft gewoon werken.
        with tempfile.TemporaryDirectory() as d:
            uitpad = Path(d) / 'kalibratie.json'
            argv = ['--diepte', '10', '--uit', str(uitpad)] + _punt_args(GEZOND)
            with contextlib.redirect_stdout(io.StringIO()):
                calibrate.main(argv)
            data = json.loads(uitpad.read_text(encoding='utf-8'))
            self.assertIn('precisie_m_per_px', data)


class TestRapportbreedte(unittest.TestCase):
    def test_rapport_en_json_melden_dezelfde_scherpte(self):
        # Zijlijncamera uit de doorlichting: vóór de fix bemonsterde het rapport x tot 26 m
        # op een veld van 14 m breed en meldde het stelselmatig ruwere cijfers dan de JSON
        # van hetzelfde bestand (0,26 m/px waar 0,15 hoort — vals alarm boven de drempel).
        nb = _camera((-16.0, LENGTE / 2, 6.0), (BREED / 2, LENGTE / 2, 0.0))
        punten = _klikpunten(nb)
        matrix = calibrate.fit_homografie(punten)
        kaart = calibrate.precisiekaart(matrix, DIEPTE, BREED, SPEEL)

        with tempfile.TemporaryDirectory() as d:
            pad = Path(d) / 'kalibratie.json'
            with contextlib.redirect_stdout(io.StringIO()):
                calibrate.schrijf_kalibratie(pad, matrix, punten, DIEPTE, None,
                                             breedte=BREED, speelveld=SPEEL)
            data = json.loads(pad.read_text(encoding='utf-8'))
        # De JSON schreef de kaart altijd al met de juiste maten.
        self.assertEqual(data['precisie_m_per_px'], kaart)

        # Het rapport moet nu exact dezelfde kaart afdrukken.
        uit = io.StringIO()
        with contextlib.redirect_stdout(uit):
            calibrate.druk_reprojectierapport(matrix, punten, DIEPTE, SPEEL, BREED)
        verwacht = ' · '.join(f'{naam} {kaart[naam]:.2f}'
                              for naam in ('thuis', 'midden', 'uit') if naam in kaart)
        self.assertIn(f'Meters per pixel: {verwacht}', uit.getvalue())


class TestDraaiMetadata(unittest.TestCase):
    def _bestand(self):
        """Een kalibratiebestand zoals schrijf_kalibratie het maakt, camera achter thuis."""
        punten = _klikpunten(_camera(*ACHTER_THUIS))
        matrix = calibrate.fit_homografie(punten)
        return {
            'veld': {'doelgebied_diepte_m': DIEPTE, 'breedte_m': BREED, 'speelveld_m': SPEEL},
            'matrix_beeld_naar_veld': matrix,
            'punten': punten,
            'precisie_m_per_px': calibrate.precisiekaart(matrix, DIEPTE, BREED, SPEEL),
            'camerapositie': 'achter-thuis-links',
            'camerastandpunt': {'oordeel': 'klopt', 'stabiliteit_m': 0.05,
                                'gemeten': {'x_m': 3.0, 'y_m': -6.0, 'hoogte_m': 5.0,
                                            'brandpunt_px': 1400.0}},
        }

    def test_precisiekaart_wisselt_thuis_en_uit(self):
        data = self._bestand()
        gedraaid = calibrate.draai_kalibratie_180(data)
        # Wat het gedraaide bestand beweert moet zijn wat de gedraaide matrix écht meet…
        self.assertEqual(gedraaid['precisie_m_per_px'],
                         calibrate.precisiekaart(gedraaid['matrix_beeld_naar_veld'],
                                                 DIEPTE, BREED, SPEEL))
        # …en dat is het omgekeerde van vóór de draai: scherp thuis wordt scherp uit.
        # (Vóór de fix bleef bv. 'thuis 0,03 · uit 0,26' letterlijk staan.)
        self.assertAlmostEqual(gedraaid['precisie_m_per_px']['thuis'],
                               data['precisie_m_per_px']['uit'], delta=0.002)
        self.assertAlmostEqual(gedraaid['precisie_m_per_px']['uit'],
                               data['precisie_m_per_px']['thuis'], delta=0.002)

    def test_camerapositie_en_standpunt_verhuizen_mee(self):
        gedraaid = calibrate.draai_kalibratie_180(self._bestand())
        # De camera zelf blijft staan, maar in de gedraaide veldcoördinaten staat ze aan
        # de overkant: (x, y) → (B−x, L−y), en het positie-etiket wisselt mee.
        self.assertEqual(gedraaid['camerapositie'], 'achter-uit-rechts')
        gemeten = gedraaid['camerastandpunt']['gemeten']
        self.assertAlmostEqual(gemeten['x_m'], BREED - 3.0)
        self.assertAlmostEqual(gemeten['y_m'], LENGTE - (-6.0))
        self.assertAlmostEqual(gemeten['hoogte_m'], 5.0)  # hoogte draait niet mee
        self.assertAlmostEqual(gemeten['brandpunt_px'], 1400.0)
        # Keuze én meting draaien samen, dus het oordeel blijft consistent.
        self.assertEqual(gedraaid['camerastandpunt']['oordeel'], 'klopt')

    def test_draai_positie_180_wisselt_per_naamdeel(self):
        self.assertEqual(calibrate.draai_positie_180('zijlijn-links-midden'), 'zijlijn-rechts-midden')
        self.assertEqual(calibrate.draai_positie_180('hoek-uit-links'), 'hoek-thuis-rechts')
        self.assertEqual(calibrate.draai_positie_180('achter-thuis'), 'achter-uit')  # oude korte vorm

    def test_bestand_zonder_metadata_blijft_zonder(self):
        # Oudere bestanden hebben die velden niet — de draai mag ze niet verzinnen.
        data = {'doelgebied_diepte_m': DIEPTE,
                'matrix_beeld_naar_veld': [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
                'punten': []}
        gedraaid = calibrate.draai_kalibratie_180(data)
        self.assertNotIn('precisie_m_per_px', gedraaid)
        self.assertNotIn('camerastandpunt', gedraaid)
        self.assertNotIn('camerapositie', gedraaid)


if __name__ == '__main__':
    unittest.main()
