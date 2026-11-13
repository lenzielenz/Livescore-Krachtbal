package be.krachtbal.aantekenaar

import be.krachtbal.aantekenaar.fed.AttestUitkomst
import be.krachtbal.aantekenaar.fed.BladRij
import be.krachtbal.aantekenaar.fed.forfaitUitleg
import be.krachtbal.aantekenaar.fed.geboortedatumIso
import be.krachtbal.aantekenaar.fed.kaartCodeUit
import be.krachtbal.aantekenaar.fed.parseAttest
import be.krachtbal.aantekenaar.fed.parseMeldingen
import be.krachtbal.aantekenaar.fed.parseSheet
import be.krachtbal.aantekenaar.fed.parseTelling
import be.krachtbal.aantekenaar.fed.samenvatting
import be.krachtbal.aantekenaar.fed.voorgesteldeAanleidingen
import be.krachtbal.aantekenaar.fed.nogAanvulbaar
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Meldingen, medisch attest en de onregelmatigheden op het blad: wat de app van de server leest. */
class InboxTest {
    @Test
    fun meldingenLezen() {
        val body = """{"meldingen":[
            {"id":7,"titel":"✅ Attest goedgekeurd","tekst":"Geldt voor 2026-2027.","url":"/profiel","gelezen":false,"op":"2026-11-13T09:00:00.000Z"},
            {"id":"8","titel":"Herinnering","tekst":"","url":null,"gelezen":true},
            {"titel":"zonder id"}
        ]}"""
        val m = parseMeldingen(body)
        assertEquals(listOf(7, 8), m.map { it.id })
        assertEquals("/profiel", m[0].url)
        assertFalse(m[0].gelezen)
        assertNull(m[1].tekst) // lege tekst = geen tekst
        assertTrue(m[1].gelezen)
        assertEquals(emptyList<Any>(), parseMeldingen("geen json"))
        assertEquals(3, parseTelling("""{"ongelezen":3}"""))
        assertEquals(0, parseTelling("""{"fout":1}"""))
    }

    @Test
    fun attestUitkomst() {
        val goed = parseAttest("""{"ok":true,"status":"goedgekeurd","naam":"Kaat K.","reden":null,"seizoen":"2026-2027","meldingen":["verbod"]}""")
        assertTrue(goed is AttestUitkomst.Ontvangen && goed.goedgekeurd && goed.naam == "Kaat K." && goed.seizoen == "2026-2027" && goed.meldingen == listOf("verbod"))
        val wacht = parseAttest("""{"ok":true,"status":"nakijken","naam":"Bert A.","reden":"Geen QR-code","seizoen":null,"meldingen":[]}""")
        assertTrue(wacht is AttestUitkomst.Ontvangen && !wacht.goedgekeurd && wacht.reden == "Geen QR-code")
        assertEquals(AttestUitkomst.Gegevens(true), parseAttest("""{"ok":false,"nodig":"gegevens","blanco":true}"""))
        assertEquals(AttestUitkomst.Fout("ander lid"), parseAttest("""{"ok":false,"fout":"ander lid"}"""))
        assertTrue(parseAttest("<html>") is AttestUitkomst.Fout)
    }

    @Test
    fun kaartCodeEnGeboortedatum() {
        assertEquals("K1A-ABCDEFGH", kaartCodeUit("https://livescore.roodgries.be/k/K1A-ABCDEFGH"))
        assertEquals("K1A-ABCDEFGH", kaartCodeUit("k1a-abcdefgh"))
        assertNull(kaartCodeUit("geen code"))
        assertNull(kaartCodeUit(""))
        assertEquals("2011-03-12", geboortedatumIso("12/03/2011"))
        assertEquals("2011-03-02", geboortedatumIso("2-3-2011"))
        assertEquals("2011-03-12", geboortedatumIso("2011-03-12"))
        assertNull(geboortedatumIso("31/02/2011"))
        assertNull(geboortedatumIso("12 maart"))
    }

    @Test
    fun voorbehoudEnUitsluitingOpHetBlad() {
        val body = """{"docs":[{"id":3,"status":"bezig","homeLineup":[],"awayLineup":[],
            "forfait":{"uitslag":"geen"},
            "voorbehoud":[{"side":"thuis","naam":"Jan Kapitein","reden":"Bal te zacht","onderwerp":"inrichting","score":"12-9","speeltijd":"1e helft 20'"}],
            "uitsluitingen":[{"side":"uit","player":42,"reden":"Slaan","naam":null}],
            "rapportVolgt":true,
            "scheidsrechter":{"akkoord":false}}]}"""
        val s = parseSheet(body)!!
        assertEquals(1, s.voorbehoud.size)
        assertEquals("inrichting", s.voorbehoud[0].onderwerp)
        assertEquals(42, s.uitsluitingen[0].player)
        assertEquals("uit", s.uitsluitingen[0].side)
        assertTrue(s.rapportVolgt)
        assertTrue(s.nogAanvulbaar())
        assertEquals(setOf("voorbehoud", "uitsluiting"), voorgesteldeAanleidingen(s))
        assertTrue(s.voorbehoud[0].samenvatting().startsWith("Materiële inrichting niet in orde — Bal te zacht — stand 12-9"))
        val afgetekend = parseSheet(body.replace("\"akkoord\":false", "\"akkoord\":true"))!!
        assertFalse(afgetekend.nogAanvulbaar())
    }

    @Test
    fun forfaitIsBegrijpelijk() {
        assertEquals("A geeft forfait: B wint met 30–0.", forfaitUitleg("thuis", "A", "B"))
        assertEquals("B geeft forfait: A wint met 30–0.", forfaitUitleg("uit", "A", "B"))
        assertTrue(forfaitUitleg("dubbel", "A", "B").contains("0–0"))
        assertEquals("Het forfait wordt teruggedraaid.", forfaitUitleg("geen", "A", "B"))
        assertEquals("Iets", BladRij("thuis", null, "Iets", null, null, null, null).samenvatting())
    }
}
