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

Plus de lens-upgrade (divisiemodel, één parameter λ): een synthetische camera mét
gekende vervorming laat zien dat de fit zonder lensmodel decimeters fout zit aan de
veldranden, en dat de fit mét lensmodel λ terugvindt en die fout naar (mili)meters
brengt. Oude kalibratiebestanden zonder 'lens'-veld gedragen zich exact als λ = 0.
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


CENTRUM = (B / 2.0, H / 2.0)
DIAG = math.hypot(B, H)


class TestLensWiskunde(unittest.TestCase):
    """Het divisiemodel zelf: conventie, inverse en het λ=0-pad."""

    def test_conventie_exact_in_de_beeldhoek(self):
        # De beeldhoek (1920, 1080) ligt op r = ½ diagonaal / diagonaal = 0,5, dus
        # r² = 0,25 en de vector krimpt met factor 1/(1 + 0,25·λ). Met λ = 0,2:
        # (960, 540)/1,05 vanaf het centrum — de conventie exact nagerekend.
        ox, oy = calibrate.ontkrom((B, H), 0.2, CENTRUM, DIAG)
        self.assertAlmostEqual(ox, CENTRUM[0] + 960.0 / 1.05, places=9)
        self.assertAlmostEqual(oy, CENTRUM[1] + 540.0 / 1.05, places=9)

    def test_verkrom_is_de_exacte_inverse(self):
        # De inverse is gesloten opgelost (kwadratische vergelijking, geen iteratie):
        # de rondgang moet dus tot machineprecisie kloppen, ook bij negatieve λ.
        for lam in (0.25, 0.08, -0.2, 0.0):
            for punt in ((100.0, 80.0), (1800.0, 1000.0), (960.0, 540.0), (0.0, 1080.0)):
                terug = calibrate.verkrom(calibrate.ontkrom(punt, lam, CENTRUM, DIAG),
                                          lam, CENTRUM, DIAG)
                self.assertAlmostEqual(terug[0], punt[0], places=6)
                self.assertAlmostEqual(terug[1], punt[1], places=6)
                heen = calibrate.ontkrom(calibrate.verkrom(punt, lam, CENTRUM, DIAG),
                                         lam, CENTRUM, DIAG)
                self.assertAlmostEqual(heen[0], punt[0], places=6)

    def test_lambda_nul_is_de_identiteit(self):
        self.assertEqual(calibrate.ontkrom((123.4, 567.8), 0.0, CENTRUM, DIAG), (123.4, 567.8))
        self.assertEqual(calibrate.verkrom((123.4, 567.8), 0.0, CENTRUM, DIAG), (123.4, 567.8))

    def test_lens_uit_oude_bestanden_geeft_lambda_nul(self):
        # Achterwaartse compatibiliteit, vastgelegd: geen 'lens'-veld → None (λ = 0),
        # en een expliciete λ = 0 óók — ontkrommen is dan de identiteit.
        self.assertIsNone(calibrate.lens_uit({}))
        self.assertIsNone(calibrate.lens_uit({'matrix_beeld_naar_veld': [[1, 0, 0]]}))
        self.assertIsNone(calibrate.lens_uit(
            {'lens': {'lambda': 0.0, 'centrum': [960, 540], 'diagonaal': DIAG}}))
        lens = calibrate.lens_uit(
            {'lens': {'lambda': 0.08, 'centrum': [960, 540], 'diagonaal': DIAG}})
        self.assertEqual(lens, (0.08, (960.0, 540.0), DIAG))


def _verkromde_klikpunten(nb, lam, ruis=0.0, seed=0):
    """De kruispunten zoals een vervormende lens ze zou tonen: projecteer, verkrom,
    en (optioneel) klikruis erbovenop — de synthetische camera uit de opdracht."""
    rng = random.Random(seed)
    punten = []
    for k in veld.kruispunten(DIEPTE, BREED, SPEEL):
        p = nb(k.x_m, k.y_m)
        if p is None:
            continue
        pd = calibrate.verkrom(p, lam, CENTRUM, DIAG)
        if 0 <= pd[0] <= B and 0 <= pd[1] <= H:
            punten.append({'label': k.label,
                           'beeld_px': [pd[0] + rng.gauss(0.0, ruis), pd[1] + rng.gauss(0.0, ruis)],
                           'veld_m': [k.x_m, k.y_m]})
    return punten


def _achterlijnfouten(nb, matrix, lam_model, lam_echt):
    """Veldfout (m) op een fijn raster langs achterlijnen en doellijnen — de randen
    waar de vervorming het hardst aankomt en waar de doelpunten vallen."""
    fouten = []
    for y in (0.0, DIEPTE, LENGTE - DIEPTE, LENGTE):
        for i in range(29):
            x = BREED * i / 28
            p = nb(x, y)
            if p is None:
                continue
            pd = calibrate.verkrom(p, lam_echt, CENTRUM, DIAG)
            if not (0 <= pd[0] <= B and 0 <= pd[1] <= H):
                continue
            q = calibrate.ontkrom(pd, lam_model, CENTRUM, DIAG) if lam_model else pd
            vx, vy = calibrate._projecteer(matrix, q[0], q[1])
            fouten.append(math.hypot(vx - x, vy - y))
    return fouten


# Gsm-groothoek laag op de zijlijn (f = 560 px op 1920 breed ≈ 120° beeldhoek): de
# opstelling waar de zijlijnen zichtbaar krombuigen en de vervorming het meeste kost.
def _groothoek_camera():
    return _camera((-5.0, LENGTE / 2, 3.0), (BREED / 2, LENGTE / 2, 0.0), f=560.0)


class TestLensSchatting(unittest.TestCase):
    """De winst van de upgrade, gemeten op de synthetische camera met gekende λ."""

    def test_zonder_lensmodel_decimeters_met_lensmodel_millimeters(self):
        # λ = 0,08 (typische gsm-groothoek), exacte kliks. Zonder lensmodel zit de
        # kalibratie aan de achter-/doellijnen tot ruim 0,2 m ernaast (gemeten 0,20 m
        # max) — systematisch, op élke meting. Mét lensmodel wordt λ exact
        # teruggevonden en zakt de fout naar < 1 cm.
        nb = _groothoek_camera()
        punten = _verkromde_klikpunten(nb, 0.08)
        self.assertGreaterEqual(len(punten), calibrate.LENS_MIN_PUNTEN)

        zonder = calibrate.fit_homografie(punten)
        fout_zonder = _achterlijnfouten(nb, zonder, 0.0, 0.08)
        self.assertGreater(max(fout_zonder), 0.15)

        lam, matrix, _fout_px, _fout_nul_px = calibrate.schat_lens(punten, CENTRUM, DIAG)
        self.assertLess(abs(lam - 0.08), 0.3 * 0.08)  # ±30% uit de opdracht (hier: exact)
        fout_met = _achterlijnfouten(nb, matrix, lam, 0.08)
        self.assertLess(max(fout_met), 0.01)

    def test_ultragroothoek_van_meer_dan_halve_meter_naar_millimeters(self):
        # λ = 0,25 (actiecam / gsm-ultragroothoek, rand van het zoekbereik): zonder
        # lensmodel 0,61 m fout op het slechtste randpunt, mét < 1 cm.
        nb = _groothoek_camera()
        punten = _verkromde_klikpunten(nb, 0.25)
        zonder = calibrate.fit_homografie(punten)
        self.assertGreater(max(_achterlijnfouten(nb, zonder, 0.0, 0.25)), 0.5)
        lam, matrix, _f, _f0 = calibrate.schat_lens(punten, CENTRUM, DIAG)
        self.assertLess(abs(lam - 0.25), 0.3 * 0.25)
        self.assertLess(max(_achterlijnfouten(nb, matrix, lam, 0.25)), 0.01)

    def test_met_klikruis_blijft_lambda_binnen_30_procent(self):
        # 0,3 px gaussische klikruis (het gemeten niveau uit de doorlichting): λ komt
        # binnen ±30% terug en de randfout blijft ruim onder die van de fit zonder
        # lensmodel. De zoektocht weegt in píxels — in meters gemeten verzoop het
        # krommingssignaal (dat bij de dichtbijgelegen, fijnbemonsterde punten leeft)
        # in de ruis van de verre punten.
        nb = _groothoek_camera()
        punten = _verkromde_klikpunten(nb, 0.08, ruis=0.3, seed=9)
        zonder = calibrate.fit_homografie(punten)
        lam, matrix, fout_px, fout_nul_px = calibrate.schat_lens(punten, CENTRUM, DIAG)
        self.assertLess(abs(lam - 0.08), 0.3 * 0.08)
        self.assertLess(fout_px, fout_nul_px)
        self.assertGreater(max(_achterlijnfouten(nb, zonder, 0.0, 0.08)), 0.15)
        self.assertLess(max(_achterlijnfouten(nb, matrix, lam, 0.08)), 0.10)

    def test_cli_schrijft_lens_en_ruwe_klikken(self):
        # De headless CLI met beeldmaat: het bestand krijgt het lens-veld (λ ≈ echt,
        # centrum, diagonaal) en de punten blijven de RUWE klikcoördinaten.
        punten = _verkromde_klikpunten(_groothoek_camera(), 0.08)
        argv = ['--diepte', '10', '--beeldbreedte', str(B), '--beeldhoogte', str(H)]
        for p in punten:
            argv += ['--punt', f'{p["beeld_px"][0]:.4f},{p["beeld_px"][1]:.4f}={p["label"]}']
        with tempfile.TemporaryDirectory() as d:
            uitpad = Path(d) / 'kalibratie.json'
            uit = io.StringIO()
            with contextlib.redirect_stdout(uit):
                calibrate.main(argv + ['--uit', str(uitpad)])
            data = json.loads(uitpad.read_text(encoding='utf-8'))
        self.assertIn('lens', data)
        self.assertLess(abs(data['lens']['lambda'] - 0.08), 0.3 * 0.08)
        self.assertEqual(data['lens']['centrum'], [B / 2.0, H / 2.0])
        self.assertAlmostEqual(data['lens']['diagonaal'], DIAG, places=1)
        # De ruwe kliks staan in het bestand (op de --punt-afronding na).
        for geschreven, echt in zip(data['punten'], punten):
            self.assertAlmostEqual(geschreven['beeld_px'][0], echt['beeld_px'][0], places=3)
        self.assertIn('Lensvervorming meegeschat', uit.getvalue())
        # En het rapport zegt erbij dat er ontkromd wordt.
        self.assertIn('ontkromd', uit.getvalue())

    def test_cli_met_te_weinig_punten_zegt_lambda_nul(self):
        # Minder dan 6 punten: één extra parameter dáárop is overfitten, dus λ = 0 —
        # en dat stáát in het rapport in plaats van stil te gebeuren.
        argv = (['--diepte', '10', '--beeldbreedte', str(B), '--beeldhoogte', str(H)]
                + _punt_args(GEZOND))
        with tempfile.TemporaryDirectory() as d:
            uitpad = Path(d) / 'kalibratie.json'
            uit = io.StringIO()
            with contextlib.redirect_stdout(uit):
                calibrate.main(argv + ['--uit', str(uitpad)])
            data = json.loads(uitpad.read_text(encoding='utf-8'))
        self.assertEqual(data['lens']['lambda'], 0.0)
        self.assertIn('te weinig', uit.getvalue())

    def test_draai_180_neemt_de_lens_ongewijzigd_mee(self):
        # De lens leeft in beeldcoördinaten en draait dus niet mee met het veld.
        lens = {'lambda': 0.08, 'centrum': [B / 2.0, H / 2.0], 'diagonaal': DIAG}
        punten = _klikpunten(_camera(*ACHTER_THUIS))
        data = {'veld': {'doelgebied_diepte_m': DIEPTE, 'breedte_m': BREED, 'speelveld_m': SPEEL},
                'matrix_beeld_naar_veld': calibrate.fit_homografie(punten),
                'punten': punten, 'lens': lens}
        self.assertEqual(calibrate.draai_kalibratie_180(data)['lens'], lens)


class AnkerpuntenTest(unittest.TestCase):
    """Vrije ankerpunten: vaste punten búiten het veldmodel, met coördinaten van een luchtfoto.

    Waarvoor ze bestaan: de kalibratie hangt aan de witte lijnen, en die zijn niet altijd de
    waarheid — een terrein dat geen nette rechthoek is, lijnen die half onder spelers liggen, of
    een camera die zo pant dat ze uit beeld gaan. Een hoek van de omheining blijft dan wél staan.
    """

    def test_parse_geeft_hetzelfde_recordformaat_als_een_kruispunt(self):
        # Precies het punt: alles ná de kalibratie (fit, rapport, lens, standpunt) hoeft niets
        # van ankers te weten omdat het record dezelfde vorm heeft.
        a = calibrate.parse_anker_argument('812,1013=5.5,-3.25', 1)
        self.assertEqual(a['beeld_px'], [812.0, 1013.0])
        self.assertEqual(a['veld_m'], [5.5, -3.25])
        self.assertEqual(a['label'], 'anker-1')
        self.assertTrue(a['anker'])

    def test_eigen_naam_blijft_staan(self):
        a = calibrate.parse_anker_argument('10,20=1,2:hoek omheining', 3)
        self.assertEqual(a['label'], 'hoek omheining')

    def test_onzin_wordt_geweigerd_met_uitleg(self):
        for tekst in ['812,1013', '812=5,5', '812,1013=5', 'a,b=1,2', '812,1013=x,y']:
            with self.subTest(tekst=tekst):
                with self.assertRaises(SystemExit):
                    with contextlib.redirect_stderr(io.StringIO()):
                        calibrate.parse_anker_argument(tekst, 1)

    def test_ankers_doen_mee_in_de_fit_en_staan_in_het_bestand(self):
        # Een kalibratie die enkel op ankerpunten steunt: het geval van een terrein waarvan de
        # lijnen onbruikbaar zijn, maar waarvan je de hoeken wél op een luchtfoto ziet.
        nb = _camera(*ACHTER_THUIS)
        hoeken = [(0.0, 0.0), (BREED, 0.0), (0.0, LENGTE), (BREED, LENGTE)]
        argv = ['--diepte', str(int(DIEPTE)), '--breedte', str(BREED), '--speelveld', str(SPEEL)]
        for i, (x, y) in enumerate(hoeken):
            px, py = nb(x, y)
            argv += ['--anker', f'{px},{py}={x},{y}:hoek{i}']

        with tempfile.TemporaryDirectory() as d:
            uitpad = Path(d) / 'kalibratie.json'
            uit = io.StringIO()
            with contextlib.redirect_stdout(uit):
                calibrate.main(argv + ['--uit', str(uitpad)])
            data = json.loads(uitpad.read_text(encoding='utf-8'))

        self.assertEqual(len(data['punten']), 4)
        self.assertTrue(all(p.get('anker') for p in data['punten']))
        # De matrix moet de hoeken terugvinden — anders deden de ankers niet mee in de fit.
        h = data['matrix_beeld_naar_veld']
        for x, y in hoeken:
            px, py = nb(x, y)
            w = h[2][0] * px + h[2][1] * py + h[2][2]
            self.assertAlmostEqual((h[0][0] * px + h[0][1] * py + h[0][2]) / w, x, places=3)
            self.assertAlmostEqual((h[1][0] * px + h[1][1] * py + h[1][2]) / w, y, places=3)

    def test_ankers_vullen_lijnkruisingen_aan(self):
        # De gewone weg: de lijnen die je wél ziet, plus een paar vaste punten eromheen.
        nb = _camera(*ACHTER_THUIS)
        argv = ['--diepte', str(int(DIEPTE))] + _punt_args(GEZOND)
        px, py = nb(-2.0, -2.0)  # een punt búiten het veld: hoek van de omheining
        argv += ['--anker', f'{px},{py}=-2,-2:omheining']
        with tempfile.TemporaryDirectory() as d:
            uitpad = Path(d) / 'kalibratie.json'
            with contextlib.redirect_stdout(io.StringIO()):
                calibrate.main(argv + ['--uit', str(uitpad)])
            data = json.loads(uitpad.read_text(encoding='utf-8'))
        self.assertEqual(len(data['punten']), 5)
        self.assertEqual([p['label'] for p in data['punten']].count('omheining'), 1)

    def test_ankers_gaan_niet_samen_met_draai_180(self):
        # Anders zou de draai stilletjes ook fitten — twee dingen tegelijk, geen van beide zichtbaar.
        with self.assertRaises(SystemExit):
            with contextlib.redirect_stderr(io.StringIO()):
                calibrate.main(['--draai-180', 'x.json', '--anker', '1,2=3,4', '--uit', 'y.json'])


if __name__ == '__main__':
    unittest.main()
