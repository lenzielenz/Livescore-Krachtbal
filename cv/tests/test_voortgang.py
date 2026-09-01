"""De voortgangsmeldingen: het verschil tussen "traag" en "vastgelopen".

De app leest deze regels mee om de balk te laten kruipen binnen één stap. Vandaar
dat de vorm hier vastligt: een regel die er anders uitziet, wordt niet gelezen en
dan staat de balk weer stil zonder dat iemand weet waarom.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from voortgang import Melder, VOORTGANG_PREFIX, duur_van_video  # noqa: E402


class NepKlok:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def verder(self, seconden):
        self.t += seconden


class TestMelder:
    def test_meldt_fractie_en_leesbare_tijd(self):
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(600.0, interval_s=1.0, stroom=uit, klok=klok)
        m.meld(150.0, '750 metingen')
        regel = uit.getvalue().strip()
        assert regel.startswith(f'{VOORTGANG_PREFIX} 0.250')
        assert '2:30 van 10:00' in regel
        assert '750 metingen' in regel

    def test_knijpt_op_de_klok_en_niet_op_het_aantal(self):
        # Een lus die duizend keer per seconde rondgaat mag de uitvoer niet dichtslibben.
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(600.0, interval_s=3.0, stroom=uit, klok=klok)
        assert m.meld(1.0) is True
        for _ in range(100):
            assert m.meld(2.0) is False
        klok.verder(3.0)
        assert m.meld(60.0) is True
        assert m.meldingen == 2

    def test_forceren_negeert_het_interval(self):
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(600.0, interval_s=3.0, stroom=uit, klok=klok)
        m.meld(1.0)
        assert m.meld(2.0, forceer=True) is True

    def test_zonder_totaal_wel_een_teken_van_leven(self):
        # Niet elke container draagt een betrouwbare lengte mee. Dan liever geen percentage dan
        # een verzonnen percentage dat halverwege over de 100 gaat — maar wél laten horen dat
        # er nog gewerkt wordt.
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(None, interval_s=0.0, stroom=uit, klok=klok)
        m.meld(42.0)
        regel = uit.getvalue().strip()
        assert regel.startswith(f'{VOORTGANG_PREFIX} ?')
        assert '0:42 bekeken' in regel

    def test_blijft_binnen_nul_en_een(self):
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(100.0, interval_s=0.0, stroom=uit, klok=klok)
        m.meld(-5.0)
        m.meld(250.0)
        deler = [r.split()[1] for r in uit.getvalue().strip().splitlines()]
        assert deler == ['0.000', '1.000']

    def test_klaar_meldt_altijd_honderd_procent(self):
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(600.0, interval_s=100.0, stroom=uit, klok=klok)
        m.klaar('1200 metingen')
        regel = uit.getvalue().strip()
        assert regel.startswith(f'{VOORTGANG_PREFIX} 1.000')
        assert '1200 metingen' in regel

    def test_elke_melding_staat_op_zijn_eigen_regel(self):
        # De lezer aan de andere kant splitst op nieuwe regels; twee meldingen op één regel
        # zouden er dus eentje verloren laten gaan.
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(600.0, interval_s=0.0, stroom=uit, klok=klok)
        m.meld(10.0)
        m.meld(20.0)
        regels = [r for r in uit.getvalue().split('\n') if r]
        assert len(regels) == 2


class TestSchatting:
    def test_meldt_hoelang_het_nog_duurt(self):
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(600.0, interval_s=0.0, stroom=uit, klok=klok)
        klok.verder(60.0)          # een minuut bezig …
        m.meld(60.0)               # … en een tiende van de video gezien
        # Dan duurt de rest ongeveer negen minuten.
        assert 'nog ± 9:00' in uit.getvalue()

    def test_zwijgt_over_de_resterende_tijd_zolang_er_te_weinig_gemeten_is(self):
        # Een schatting uit de eerste seconde is een gok, en een verkeerde gok is erger dan geen.
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(600.0, interval_s=0.0, stroom=uit, klok=klok)
        klok.verder(2.0)
        m.meld(60.0)
        assert 'nog ±' not in uit.getvalue()

    def test_zwijgt_ook_wanneer_er_nog_bijna_niets_gedaan_is(self):
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(600.0, interval_s=0.0, stroom=uit, klok=klok)
        klok.verder(60.0)
        m.meld(1.0)   # 0,17% — daar valt niets uit te besluiten
        assert 'nog ±' not in uit.getvalue()


class TestDuurVanVideo:
    class NepCv2:
        CAP_PROP_FPS = 5
        CAP_PROP_FRAME_COUNT = 7

    class NepCap:
        def __init__(self, waarden):
            self.waarden = waarden

        def get(self, sleutel):
            return self.waarden.get(sleutel, 0.0)

    def test_rekent_beelden_gedeeld_door_fps(self):
        cv2 = self.NepCv2()
        cap = self.NepCap({cv2.CAP_PROP_FPS: 25.0, cv2.CAP_PROP_FRAME_COUNT: 750.0})
        assert duur_van_video(cv2, cap) == 30.0

    def test_geeft_niets_terug_bij_een_onbetrouwbare_container(self):
        cv2 = self.NepCv2()
        assert duur_van_video(cv2, self.NepCap({cv2.CAP_PROP_FPS: 25.0})) is None
        assert duur_van_video(cv2, self.NepCap({cv2.CAP_PROP_FRAME_COUNT: 750.0})) is None


class TestDeelVanDeBalk:
    """Twee passages over dezelfde video vullen samen één balk.

    Zonder dit liep elke passage van 0 naar 100% en sprong de balk halverwege terug — en een
    balk die terugspringt lijkt kapot, ook al klopt er niets aan.
    """

    def test_meldt_binnen_het_toegewezen_stuk(self):
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(100.0, interval_s=0.0, stroom=uit, klok=klok, deel=(0.75, 1.0))
        m.meld(0.0)
        m.meld(50.0)
        m.klaar()
        fracties = [float(r.split()[1]) for r in uit.getvalue().strip().splitlines()]
        assert fracties == [0.75, 0.875, 1.0]

    def test_zonder_deel_blijft_alles_zoals_het_was(self):
        uit, klok = io.StringIO(), NepKlok()
        m = Melder(100.0, interval_s=0.0, stroom=uit, klok=klok)
        m.meld(25.0)
        assert float(uit.getvalue().split()[1]) == 0.25
