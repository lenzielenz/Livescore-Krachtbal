"""De trainingslus: instellingen léren uit gelabelde wedstrijden i.p.v. ze te schatten.

Hier wordt vastgelegd wat "beter" betekent — want dat is de hele beslissing die
train.py neemt. Een zoektocht die de verkeerde instelling het hoogst waardeert,
maakt het model stelselmatig slechter zonder dat iemand het merkt.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from train import (  # noqa: E402
    benoem,
    keten_momenten,
    kies_apart,
    lees_labels,
    lees_reeks,
    main,
    scoor,
    scoor_samen,
    zoek_instellingen,
)


def maak_reeks(pieken: list[tuple[float, float]], duur: float = 60.0, stap: float = 0.2,
               rust: float = 0.15) -> list[dict]:
    """Een meetreeks met rust en een paar duidelijke pieken op gekende momenten."""
    reeks = []
    t = 0.0
    while t <= duur + 1e-9:
        score = rust
        for piek_t, hoogte in pieken:
            if abs(t - piek_t) < 1e-6:
                score = hoogte
        reeks.append({'t': round(t, 3), 'score': score, 'polshoogte': 0.4})
        t += stap
    return reeks


class TestScoor:
    def test_vindt_de_gelabelde_worpen(self):
        reeks = maak_reeks([(10.0, 3.0), (20.0, 2.5), (30.0, 2.8)])
        s = scoor(reeks, [10.1, 19.9, 30.2], drempel=1.0, min_afstand=3.0)
        assert s['gevonden'] == 3
        assert s['vals'] == 0
        assert s['recall'] == 1.0
        assert s['f1'] == 1.0

    def test_te_lage_drempel_levert_valse_voorstellen(self):
        # Onder het ruisniveau meldt elk oneffenheidje zich aan.
        reeks = maak_reeks([(10.0, 3.0)])
        reeks[15]['score'] = 0.4  # een bultje in de rust
        s = scoor(reeks, [10.0], drempel=0.2, min_afstand=1.0)
        assert s['gevonden'] == 1
        assert s['vals'] >= 1
        assert s['precisie'] < 1.0

    def test_te_hoge_drempel_mist_alles(self):
        reeks = maak_reeks([(10.0, 3.0), (20.0, 2.5)])
        s = scoor(reeks, [10.0, 20.0], drempel=5.0, min_afstand=3.0)
        assert s['gevonden'] == 0
        assert s['recall'] == 0.0
        assert s['precisie'] is None  # geen detecties: niet gedefinieerd, geen 0

    def test_een_voorstel_buiten_het_venster_telt_niet(self):
        reeks = maak_reeks([(10.0, 3.0)])
        assert scoor(reeks, [15.0], 1.0, 3.0, venster=2.0)['gevonden'] == 0
        assert scoor(reeks, [15.0], 1.0, 3.0, venster=6.0)['gevonden'] == 1


def maak_twee_passages_reeks() -> list[dict]:
    """Een reeks zoals houding.py ze na een voltooide twee-passages-run herschrijft.

    Grof (8/s, passage 1) waar de zoekpassage van díe run niets zag; fijn (25/s, passage 2)
    alleen rond haar kandidaat op t=30 (fijne piek 0,47). De worp op t=80 lag met zijn grove
    piek 0,31 onder de zoekdrempel van die oude run en is dus nooit fijn gemeten.
    """
    reeks = []
    for i in range(801):
        t = i * 0.125
        if 29.2 <= t <= 30.8:
            continue  # binnen het oude nakijkvenster zijn de grove regels vervangen
        reeks.append({'t': round(t, 3), 'score': 0.31 if abs(t - 80.0) < 1e-9 else 0.15,
                      'passage': 1})
    for i in range(41):
        t = 29.2 + i * 0.04
        reeks.append({'t': round(t, 3), 'score': 0.47 if abs(t - 30.0) < 0.02 else 0.15,
                      'passage': 2})
    reeks.sort(key=lambda r: r['t'])
    return reeks


class TestKetenNaspel:
    """De meetreeks is geconditioneerd op de drempel van de run die haar schreef: alleen fíjn
    waar díe run kandidaten zag. De scoring moet daarom de keten naspelen — anders lijkt een
    kandidaat-drempel worpen te missen die de gedeployde keten wél vindt (zoekdrempel × 0,40
    vangt de grove piek, het nakijken tilt hem naar fijne schaal)."""

    def test_alleen_grof_gemeten_worp_telt_op_fijne_schaal(self):
        # Regressie (het recept van de doorlichting): kaal hertellen gaf 1/2 bij drempel 0,45,
        # terwijl de keten 2/2 vindt: 0,45 × 0,40 = 0,18 ≤ 0,31 → venster → fijn 0,47 ≥ 0,45.
        s = scoor(maak_twee_passages_reeks(), [30.0, 80.0], drempel=0.45, min_afstand=3.0)
        assert s['gevonden'] == 2
        assert s['vals'] == 0
        assert s['recall'] == 1.0

    def test_de_naspeling_verzint_geen_worpen_boven_de_fijne_schaal(self):
        # 0,31 × GROF_NAAR_FIJN = 0,465 < 0,7: ook de echte keten zou deze worp missen.
        s = scoor(maak_twee_passages_reeks(), [30.0, 80.0], drempel=0.7, min_afstand=3.0)
        assert s['gevonden'] == 0

    def test_naspeling_dedupliceert_met_de_kale_telling(self):
        # De fijne piek op t=30 mag niet nóg eens als nagespeelde grove piek meetellen.
        momenten = keten_momenten(maak_twee_passages_reeks(), 0.45, 3.0)
        assert momenten == [30.0, 80.0]

    def test_homogene_reeks_blijft_kaal_geteld(self):
        # Zonder passage-merktekens (één passage) ís wat er staat wat de keten zag: daar
        # zou de naspeling worpen verzinnen die de keten nooit fijn hermeten heeft.
        reeks = maak_reeks([(80.0, 0.31)], duur=100.0, rust=0.15)
        assert scoor(reeks, [80.0], drempel=0.45, min_afstand=3.0)['gevonden'] == 0

    def test_lees_reeks_bewaart_het_passage_merkteken(self, tmp_path):
        # Zonder het merkteken op schijf valt de naspeling stil weg na een JSON-rondgang.
        pad = tmp_path / 'reeks.jsonl'
        pad.write_text('\n'.join(json.dumps(r) for r in maak_twee_passages_reeks()),
                       encoding='utf-8')
        s = scoor(lees_reeks(pad), [30.0, 80.0], drempel=0.45, min_afstand=3.0)
        assert s['gevonden'] == 2


class TestScoorSamen:
    def test_telt_op_in_plaats_van_f1_te_middelen(self):
        # Een kleine wedstrijd waar alles klopt mag een grote mislukking niet verbergen.
        klein = {'naam': 'klein', 'reeks': maak_reeks([(10.0, 3.0)]), 'labels': [10.0]}
        groot = {'naam': 'groot',
                 'reeks': maak_reeks([(t, 3.0) for t in range(10, 60, 5)], duur=200.0),
                 'labels': [float(t) + 100 for t in range(10, 60, 5)]}  # allemaal ernaast
        samen = scoor_samen([klein, groot], drempel=1.0, min_afstand=3.0)
        assert samen['labels'] == 11
        assert samen['gevonden'] == 1
        assert samen['recall'] == pytest.approx(1 / 11)
        # Het gemiddelde van de twee F1's zou hier ruim boven 0,4 uitkomen.
        assert samen['f1'] < 0.25

    def test_houdt_de_wedstrijden_apart_in_het_rapport(self):
        w = [{'naam': 'a', 'reeks': maak_reeks([(10.0, 3.0)]), 'labels': [10.0]},
             {'naam': 'b', 'reeks': maak_reeks([(20.0, 3.0)]), 'labels': [20.0]}]
        samen = scoor_samen(w, 1.0, 3.0)
        assert [p['naam'] for p in samen['per_wedstrijd']] == ['a', 'b']


class TestZoekInstellingen:
    def test_vindt_een_drempel_tussen_ruis_en_worp(self):
        # Ruis op 0,5 en worpen op 3,0: de gezochte drempel ligt daartussen.
        reeks = maak_reeks([(10.0, 3.0), (25.0, 3.0), (40.0, 3.0)], rust=0.5)
        for i in range(0, len(reeks), 7):
            reeks[i]['score'] = 0.9  # ruispieken
        drempel, afstand, s = zoek_instellingen(
            [{'naam': 'proef', 'reeks': reeks, 'labels': [10.0, 25.0, 40.0]}])
        assert 0.9 < drempel <= 3.0
        assert s['gevonden'] == 3
        assert s['vals'] == 0
        assert afstand > 0

    def test_kiest_bij_gelijke_f1_de_hoogste_drempel(self):
        # Alles tussen 0,3 en 3,0 geeft hier hetzelfde perfecte resultaat; dan is de
        # hoogste drempel de veiligste keuze voor de reviewlaan.
        reeks = maak_reeks([(10.0, 3.0), (30.0, 3.0)], rust=0.0)
        drempel, _afstand, s = zoek_instellingen(
            [{'naam': 'proef', 'reeks': reeks, 'labels': [10.0, 30.0]}])
        assert s['f1'] == 1.0
        assert drempel == pytest.approx(3.0)

    def test_kiest_een_afstand_die_twee_snelle_worpen_niet_samenvoegt(self):
        reeks = maak_reeks([(10.0, 3.0), (12.0, 2.8)])
        drempel, afstand, s = zoek_instellingen(
            [{'naam': 'proef', 'reeks': reeks, 'labels': [10.0, 12.0]}])
        assert afstand <= 2.0
        assert s['gevonden'] == 2


class TestBenoem:
    def test_laat_unieke_namen_met_rust(self):
        w = [{'naam': 'match42', 'pad': Path('/a/match42.jsonl')},
             {'naam': 'match43', 'pad': Path('/a/match43.jsonl')}]
        assert [x['naam'] for x in benoem(w)] == ['match42', 'match43']

    def test_zet_de_map_ervoor_als_de_namen_botsen(self):
        # Zoals de server ze wegschrijft: <werkmap>/<match-id>/houding-reeks.jsonl.
        w = [{'naam': 'houding-reeks', 'pad': Path('/werk/42/houding-reeks.jsonl')},
             {'naam': 'houding-reeks', 'pad': Path('/werk/43/houding-reeks.jsonl')}]
        namen = [x['naam'] for x in benoem(w)]
        assert namen == ['42/houding-reeks', '43/houding-reeks']
        # En daarmee werkt --holdout 43 weer.
        assert sum('43' in n for n in namen) == 1


class TestKiesApart:
    def _w(self, naam, pad):
        return {'naam': naam, 'pad': Path(pad), 'reeks': [], 'labels': []}

    def test_wijst_precies_één_wedstrijd_aan(self):
        w = [self._w('42/houding-reeks', '/werk/42/houding-reeks.jsonl'),
             self._w('142/houding-reeks', '/werk/142/houding-reeks.jsonl')]
        # Op tekst zou "42" ook 142 meepakken — en dan is de holdout er stiekem twee.
        assert [x['naam'] for x in kies_apart(w, ['42'])] == ['42/houding-reeks']
        assert [x['naam'] for x in kies_apart(w, ['142'])] == ['142/houding-reeks']

    def test_valt_terug_op_tekst_als_niets_exact_past(self):
        w = [self._w('match42-avond', '/a/match42-avond.jsonl'),
             self._w('match43-avond', '/a/match43-avond.jsonl')]
        assert [x['naam'] for x in kies_apart(w, ['43'])] == ['match43-avond']


class TestLezen:
    def test_leest_een_reeks_en_sorteert_op_tijd(self, tmp_path):
        pad = tmp_path / 'reeks.jsonl'
        pad.write_text('{"t": 2.0, "score": 1.0}\n\n{"t": 1.0, "score": 0.5}\n', encoding='utf-8')
        assert [r['t'] for r in lees_reeks(pad)] == [1.0, 2.0]

    def test_weigert_een_reeks_zonder_score(self, tmp_path):
        pad = tmp_path / 'reeks.jsonl'
        pad.write_text('{"t": 2.0}\n', encoding='utf-8')
        with pytest.raises(SystemExit):
            lees_reeks(pad)

    def test_alle_worp_aflopen_tellen_als_worp(self, tmp_path):
        pad = tmp_path / 'labels.jsonl'
        pad.write_text('\n'.join([
            '{"video_time_s": 1.0, "event_type": "worp"}',
            '{"video_time_s": 2.0, "event_type": "vangst"}',
            '{"video_time_s": 3.0, "event_type": "doelpunt"}',
            '{"video_time_s": 4.0, "event_type": "buitenspel"}',
            '{"video_time_s": 5.0, "event_type": "timeout"}',
        ]), encoding='utf-8')
        assert lees_labels(pad) == [1.0, 2.0, 3.0, 4.0]

    def test_een_afgewezen_voorstel_is_geen_worp(self, tmp_path):
        # Ground truth uit de reviewlaan: "mens zei nee" mag niet als worp meetrainen.
        pad = tmp_path / 'gt.jsonl'
        pad.write_text('\n'.join([
            '{"video_time_s": 1.0, "event_type": "worp", "verdict": "bevestigd"}',
            '{"video_time_s": 2.0, "event_type": "worp", "verdict": "afgewezen"}',
        ]), encoding='utf-8')
        assert lees_labels(pad) == [1.0]


class TestCli:
    def _wedstrijd(self, tmp_path, naam, pieken, labels):
        reeks = tmp_path / f'{naam}.jsonl'
        reeks.write_text('\n'.join(json.dumps(r) for r in maak_reeks(pieken, rust=0.3)),
                         encoding='utf-8')
        lab = tmp_path / f'labels-{naam}.jsonl'
        lab.write_text('\n'.join(json.dumps({'video_time_s': t, 'event_type': 'worp'})
                                 for t in labels), encoding='utf-8')
        return str(reeks), str(lab)

    def test_schrijft_instellingen_weg_die_houding_py_kan_lezen(self, tmp_path, capsys):
        r, l = self._wedstrijd(tmp_path, 'match42', [(10.0, 3.0), (30.0, 2.7)], [10.0, 30.0])
        uit = tmp_path / 'model.json'
        main(['--wedstrijd', r, l, '--uit', str(uit)])
        gegevens = json.loads(uit.read_text(encoding='utf-8'))
        assert gegevens['drempel'] > 0.3
        assert gegevens['min_afstand_s'] > 0
        assert gegevens['getraind_op'] == ['match42']
        assert gegevens['holdout'] is None

        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from houding import laad_instellingen  # noqa: PLC0415

        geladen = laad_instellingen(uit)
        assert geladen is not None
        assert geladen['drempel'] == gegevens['drempel']

    def test_waarschuwt_luid_als_er_geen_holdout_is(self, tmp_path, capsys):
        r, l = self._wedstrijd(tmp_path, 'match42', [(10.0, 3.0)], [10.0])
        main(['--wedstrijd', r, l, '--uit', str(tmp_path / 'model.json')])
        uitvoer = capsys.readouterr().out
        assert 'LET OP' in uitvoer
        assert 'holdout' in uitvoer.lower()

    def test_rapporteert_de_holdout_apart(self, tmp_path, capsys):
        r1, l1 = self._wedstrijd(tmp_path, 'match42', [(10.0, 3.0), (30.0, 3.0)], [10.0, 30.0])
        r2, l2 = self._wedstrijd(tmp_path, 'match43', [(15.0, 3.0)], [15.0])
        uit = tmp_path / 'model.json'
        main(['--wedstrijd', r1, l1, '--wedstrijd', r2, l2, '--holdout', 'match43',
              '--uit', str(uit)])
        gegevens = json.loads(uit.read_text(encoding='utf-8'))
        assert gegevens['getraind_op'] == ['match42']
        assert gegevens['holdout_wedstrijden'] == ['match43']
        assert gegevens['holdout']['labels'] == 1
        assert 'dít cijfer telt' in capsys.readouterr().out

    def test_stopt_als_de_holdout_nergens_op_slaat(self, tmp_path):
        r, l = self._wedstrijd(tmp_path, 'match42', [(10.0, 3.0)], [10.0])
        with pytest.raises(SystemExit):
            main(['--wedstrijd', r, l, '--holdout', 'match99', '--uit', str(tmp_path / 'm.json')])

    def test_droog_schrijft_niets(self, tmp_path):
        r, l = self._wedstrijd(tmp_path, 'match42', [(10.0, 3.0)], [10.0])
        uit = tmp_path / 'model.json'
        main(['--wedstrijd', r, l, '--uit', str(uit), '--droog'])
        assert not uit.exists()

    def test_houdt_gelijknamige_reeksen_uit_elkaar(self, tmp_path):
        # Twee wedstrijden, allebei een bestand 'houding-reeks.jsonl' in hun eigen map.
        paden = []
        for match, piek in (('42', 10.0), ('43', 20.0)):
            map_ = tmp_path / match
            map_.mkdir()
            r = map_ / 'houding-reeks.jsonl'
            r.write_text('\n'.join(json.dumps(x) for x in maak_reeks([(piek, 3.0)], rust=0.3)),
                         encoding='utf-8')
            l = map_ / 'labels.jsonl'
            l.write_text(json.dumps({'video_time_s': piek, 'event_type': 'worp'}), encoding='utf-8')
            paden += ['--wedstrijd', str(r), str(l)]
        uit = tmp_path / 'model.json'
        main([*paden, '--holdout', '43', '--uit', str(uit)])
        gegevens = json.loads(uit.read_text(encoding='utf-8'))
        assert gegevens['getraind_op'] == ['42/houding-reeks']
        assert gegevens['holdout_wedstrijden'] == ['43/houding-reeks']

    def test_stopt_bij_labels_zonder_worpen(self, tmp_path):
        r, _ = self._wedstrijd(tmp_path, 'match42', [(10.0, 3.0)], [10.0])
        leeg = tmp_path / 'leeg.jsonl'
        leeg.write_text('{"video_time_s": 1.0, "event_type": "timeout"}\n', encoding='utf-8')
        with pytest.raises(SystemExit):
            main(['--wedstrijd', r, str(leeg), '--uit', str(tmp_path / 'm.json')])


class TestLaadInstellingen:
    def test_bedorven_bestand_valt_terug_op_de_schatting(self, tmp_path):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from houding import laad_instellingen  # noqa: PLC0415

        stuk = tmp_path / 'stuk.json'
        stuk.write_text('{"drempel": 1.2, "min_afsta', encoding='utf-8')
        assert laad_instellingen(stuk) is None
        assert laad_instellingen(tmp_path / 'bestaat-niet.json') is None

        onzin = tmp_path / 'onzin.json'
        onzin.write_text('{"drempel": -3, "min_afstand_s": 2}', encoding='utf-8')
        assert laad_instellingen(onzin) is None
