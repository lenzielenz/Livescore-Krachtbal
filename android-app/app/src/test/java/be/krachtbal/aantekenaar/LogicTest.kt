package be.krachtbal.aantekenaar

import be.krachtbal.aantekenaar.data.AppJson
import be.krachtbal.aantekenaar.data.ClockSpec
import be.krachtbal.aantekenaar.data.GoalView
import be.krachtbal.aantekenaar.data.LocalClock
import be.krachtbal.aantekenaar.data.LogoFit
import be.krachtbal.aantekenaar.data.initialsFor
import be.krachtbal.aantekenaar.data.isBewaardLogo
import be.krachtbal.aantekenaar.data.logoSource
import be.krachtbal.aantekenaar.data.parseClubsBody
import be.krachtbal.aantekenaar.data.MatchInfo
import be.krachtbal.aantekenaar.data.MatchState
import be.krachtbal.aantekenaar.data.Op
import be.krachtbal.aantekenaar.data.Overlay
import be.krachtbal.aantekenaar.data.Rejected
import be.krachtbal.aantekenaar.data.ServerClock
import be.krachtbal.aantekenaar.data.SessionSnapshot
import be.krachtbal.aantekenaar.data.SessionStore
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.data.Sides
import be.krachtbal.aantekenaar.data.SseParser
import be.krachtbal.aantekenaar.data.StreamUpdate
import be.krachtbal.aantekenaar.data.TeamInfo
import be.krachtbal.aantekenaar.data.halfDurationSeconds
import be.krachtbal.aantekenaar.data.parseMatchesBody
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

private fun team(id: Int, name: String) = TeamInfo(id, name)

private fun state(
    status: String = "live",
    half: Int = 1,
    score: Sides<Int> = Sides(0, 0),
    last: Sides<GoalView?> = Sides(null, null),
    timeouts: Sides<Int> = Sides(0, 0),
    refStops: Int = 0,
) = MatchState(
    match = MatchInfo(id = 1, status = status, currentHalf = half, category = "U18"),
    teams = Sides(team(10, "Thuis"), team(20, "Uit")),
    score = score,
    lastSimpleGoalBySide = last,
    timeouts = timeouts,
    refereeStops = refStops,
)

private var seq = 0
private fun op(action: String, side: Side? = null, points: Int? = null, delta: Int? = null, clock: ClockSpec? = null, tapElapsed: Long = 0, tapWall: Long = 0) =
    Op(opId = "op-${seq++}", action = action, side = side?.wire, points = points, delta = delta, clock = clock, tapWall = tapWall, tapElapsed = tapElapsed)

class LocalClockTest {
    @Test
    fun tellOpMonotoneTijdEnPauzeert() {
        var e = 1_000L
        val c = LocalClock({ e }, { 0L })
        c.set(10.0, true)
        e += 5_000
        assertEquals(15.0, c.value(), 1e-9)
        c.set(c.value(), false)
        e += 9_000
        assertEquals("een gepauzeerde klok loopt niet", 15.0, c.value(), 1e-9)
        c.set(c.value(), true)
        e += 1_500
        assertEquals(16.5, c.value(), 1e-9)
    }

    @Test
    fun muurklokSprongBeinvloedtDeKlokNiet() {
        var e = 0L
        var w = 1_000_000L
        val c = LocalClock({ e }, { w })
        c.set(0.0, true)
        e += 60_000
        w += 3_600_000 // iemand zet de gsm-klok een uur vooruit
        assertEquals(60.0, c.value(), 1e-9)
    }

    @Test
    fun herstelNaAppherstartBlijftDoorlopen() {
        var e = 100_000L
        val c = LocalClock({ e }, { 5_000_000L })
        c.set(30.0, true)
        val snap = c.snapshot()
        e += 20_000 // app was 20 s weg, toestel niet herstart
        val c2 = LocalClock({ e }, { 5_020_000L })
        c2.restore(snap)
        assertEquals(50.0, c2.value(), 1e-9)
    }

    @Test
    fun herstelNaToestelHerstartValtTerugOpMuurklok() {
        val c = LocalClock({ 100_000L }, { 5_000_000L })
        c.set(30.0, true)
        val snap = c.snapshot()
        // Toestel herstart: elapsed begint opnieuw (500 ms), 40 s muurklok later.
        val c2 = LocalClock({ 500L }, { 5_040_000L })
        c2.restore(snap)
        assertEquals(70.0, c2.value(), 1e-9)
    }
}

class OpBodyTest {
    @Test
    fun lopendeKlokTeltDeVerzendvertragingMee() {
        val o = op("clock", clock = ClockSpec(120.0, true), tapElapsed = 1_000)
        val body = o.toBody(nowElapsed = 5_500) { it }
        assertEquals(124.5, body["seconds"]!!.jsonPrimitive.doubleOrNull!!, 1e-9)
        assertEquals("true", body["running"]!!.jsonPrimitive.content)
    }

    @Test
    fun gepauzeerdeKlokBlijftOpHetMomentVanDeTik() {
        val o = op("clock", clock = ClockSpec(120.0, false), tapElapsed = 1_000)
        val body = o.toBody(nowElapsed = 60_000) { it }
        assertEquals(120.0, body["seconds"]!!.jsonPrimitive.doubleOrNull!!, 1e-9)
        assertEquals("false", body["running"]!!.jsonPrimitive.content)
    }

    @Test
    fun tijdstipWordtNaarServertijdOmgerekend() {
        val o = op("simplegoal", Side.HOME, points = 2, tapWall = 1_000)
        val body = o.toBody(0) { it + 250 }
        assertEquals(1250.0, body["at"]!!.jsonPrimitive.doubleOrNull!!, 1e-9)
        assertEquals("home", body["side"]!!.jsonPrimitive.contentOrNull)
        assertEquals("2", body["points"]!!.jsonPrimitive.content)
        assertEquals(o.opId, body["opId"]!!.jsonPrimitive.contentOrNull)
    }

    @Test
    fun opsOverleefSerialisatie() {
        val o = op("simplegoal", Side.AWAY, points = 1, tapWall = 77, tapElapsed = 88)
        val back = AppJson.decodeFromString(Op.serializer(), AppJson.encodeToString(Op.serializer(), o))
        assertEquals(o, back)
    }
}

class OverlayTest {
    @Test
    fun doelpuntVerhoogtDeScoreEnOndoenNeemtHetTerug() {
        val base = state()
        val goal = Overlay.apply(base, listOf(op("simplegoal", Side.HOME, points = 2)))
        assertEquals(2, goal.score.home)
        assertEquals(2, goal.lastSimpleGoalBySide.home?.points)
        val undone = Overlay.apply(base, listOf(op("simplegoal", Side.HOME, points = 2), op("simpleundo", Side.HOME)))
        assertEquals(0, undone.score.home)
        assertNull(undone.lastSimpleGoalBySide.home)
    }

    @Test
    fun ondoenNeemtHetLaatsteDoelpuntVanDieploegVanDeServer() {
        val base = state(score = Sides(3, 1), last = Sides(GoalView("home", 2), GoalView("away", 1)))
        val r = Overlay.apply(base, listOf(op("simpleundo", Side.HOME)))
        assertEquals(1, r.score.home)
        assertEquals(1, r.score.away)
        assertNull("niets meer om terug te nemen tot de server antwoordt", r.lastSimpleGoalBySide.home)
    }

    @Test
    fun offlineMeermaalsTerugnemenKlopt() {
        val base = state()
        val ops = listOf(
            op("simplegoal", Side.HOME, points = 1),
            op("simplegoal", Side.HOME, points = 2),
            op("simpleundo", Side.HOME),
            op("simpleundo", Side.HOME),
            op("simpleundo", Side.HOME), // niets meer om terug te nemen: moet genegeerd worden
        )
        assertEquals(0, Overlay.apply(base, ops).score.home)
        assertEquals(1, Overlay.apply(base, ops.take(3)).score.home) // +1 +2 −2
    }

    @Test
    fun timeoutsBlijvenTussen0En2EnKruisjesNietNegatief() {
        var s = state()
        s = Overlay.apply(s, List(5) { op("simpletimeout", Side.HOME, delta = 1) })
        assertEquals(2, s.timeouts.home)
        s = Overlay.apply(state(), List(3) { op("simplecross", Side.AWAY, delta = -1) })
        assertEquals(0, s.crosses.away)
    }

    @Test
    fun helftwisselResetTellersMaarNietDeScore() {
        val base = state(score = Sides(4, 3), timeouts = Sides(2, 1), refStops = 2, last = Sides(GoalView("home", 1), null))
        val r = Overlay.apply(base, listOf(op("simplehalf")))
        assertEquals(2, r.match.currentHalf)
        assertEquals(Sides(0, 0), r.timeouts)
        assertEquals(0, r.refereeStops)
        assertEquals(Sides(4, 3), r.score)
        assertNull("een afgesloten helft is vergrendeld", r.lastSimpleGoalBySide.home)
    }

    @Test
    fun tweedeHelftwisselDoetNiets() {
        val base = state(half = 2)
        assertEquals(2, Overlay.apply(base, listOf(op("simplehalf"))).match.currentHalf)
    }

    @Test
    fun startEindeHeropenenEnReset() {
        assertEquals("live", Overlay.apply(state(status = "scheduled"), listOf(op("simplestart"))).match.status)
        assertEquals("finished", Overlay.apply(state(), listOf(op("finish"))).match.status)
        assertEquals("live", Overlay.apply(state(status = "finished"), listOf(op("reopen"))).match.status)
        val reset = Overlay.apply(state(score = Sides(5, 5), half = 2), listOf(op("reset")))
        assertEquals("scheduled", reset.match.status)
        assertEquals(Sides(0, 0), reset.score)
        assertEquals(1, reset.match.currentHalf)
    }

    @Test
    fun eersteDoelpuntOpGeplandeWedstrijdZetHemLive() {
        val r = Overlay.apply(state(status = "scheduled"), listOf(op("simplegoal", Side.AWAY, points = 1)))
        assertEquals("live", r.match.status)
    }

    @Test
    fun legeWachtrijGeeftDeServerstandTerug() {
        val base = state(score = Sides(1, 2))
        assertTrue(Overlay.apply(base, emptyList()) === base)
    }
}

class SseParserTest {
    @Test
    fun parstEenUpdateEvent() {
        val p = SseParser()
        assertNull(p.feed("id: 3"))
        assertNull(p.feed("event: update"))
        assertNull(p.feed("data: {\"state\":null}"))
        val e = p.feed("")!!
        assertEquals("update", e.event)
        assertEquals("{\"state\":null}", e.data)
        assertEquals("3", e.id)
    }

    @Test
    fun negeertCommentaarEnLegeBerichten() {
        val p = SseParser()
        assertNull(p.feed(": hartslag"))
        assertNull(p.feed(""))
        assertNull(p.feed("event: ping"))
        val e = p.feed("")!!
        assertEquals("ping", e.event)
        assertEquals("", e.data)
    }

    @Test
    fun plakMeerdereDatalijnenAanElkaar() {
        val p = SseParser()
        p.feed("data: a")
        p.feed("data: b")
        assertEquals("a\nb", p.feed("")!!.data)
    }

    @Test
    fun hetEchteUpdateFormaatVanDeServerWordtGelezen() {
        val json = """{"state":{"match":{"id":21742,"title":"A — B","status":"live","category":"U18","reeks":"U18M","currentHalf":1,"clockSeconds":12.5,"clockRunning":true,"clockUpdatedAt":"2026-10-30T16:04:02.000Z","goalAreaDepth":10,"veldBreedte":null,"veldSpeelveld":null,"finishedAt":null,"date":"2026-09-12T09:30:00.000Z"},"teams":{"home":{"id":677,"name":"Buffalo's Sijsele","logoUrl":"https://x/y.gif","logoFit":{"zoom":1.25,"offsetX":0,"offsetY":0},"colors":{"primary":"#ff8000","secondary":"#000000"}},"away":{"id":382,"name":"Noordster Dudzele","logoUrl":null,"logoFit":null,"colors":null}},"lineup":{"home":[],"away":[]},"captain":{"home":null,"away":null},"score":{"home":3,"away":2},"crosses":{"home":1,"away":0},"timeouts":{"home":1,"away":0},"refereeStops":1,"lastSimpleGoal":null,"lastSimpleGoalBySide":{"home":{"side":"home","points":2,"half":1,"clock":300,"scorer":null},"away":null},"atHalfTime":false,"trust":{"label":"unconfirmed","emoji":"🟡","short":"x","long":"y","scorerId":44,"scorerName":"Robin","claimActive":true,"laatstActief":1790000000000,"confirms":0,"disputes":0},"possession":null},"timeline":[]}"""
        val s = AppJson.decodeFromString(StreamUpdate.serializer(), json).state!!
        assertEquals(3, s.score.home)
        assertEquals(12.5, s.match.clockSeconds, 1e-9)
        assertTrue(s.match.clockRunning)
        assertEquals(2, s.lastSimpleGoalBySide.home?.points)
        assertEquals(44, s.trust.scorerId)
        assertEquals("#ff8000", s.teams.home.colors?.primary)
        assertNull(s.teams.away.colors)
        assertTrue(s.isLive)
    }
}

class SessionStoreTest {
    private fun tmp(): File = Files.createTempDirectory("sessions").toFile()

    @Test
    fun bewaartEnHerlaadtAlles() {
        val store = SessionStore(tmp())
        val o = op("simplegoal", Side.HOME, points = 1, tapWall = 5)
        val snap = SessionSnapshot(
            matchId = 7,
            state = state(),
            clock = LocalClock.Snapshot(12.0, true, 100, 200),
            queue = listOf(o),
            rejected = listOf(Rejected(op("simplestart"), "te vroeg")),
            savedWall = 9,
        )
        store.save(snap)
        assertEquals(snap, store.load(7))
        assertEquals(listOf(7), store.idsWithPending())
    }

    @Test
    fun beschadigdBestandGeeftNullInPlaatsVanEenCrash() {
        val dir = tmp()
        File(dir, "9.json").writeText("{kapot")
        assertNull(SessionStore(dir).load(9))
    }

    @Test
    fun legeWachtrijTeltNietAlsOpenstaand() {
        val store = SessionStore(tmp())
        store.save(SessionSnapshot(3, state = state()))
        assertTrue(store.idsWithPending().isEmpty())
        store.delete(3)
        assertNull(store.load(3))
    }
}

class ServerClockTest {
    @Test
    fun leestDeHttpDateHeader() {
        assertEquals(1_793_376_261_000L, ServerClock.parseHttpDate("Fri, 30 Oct 2026 16:04:21 GMT"))
        assertNull(ServerClock.parseHttpDate("onzin"))
    }

    @Test
    fun zwakkeDateHeaderGeeftGrofVerschil() {
        val w = 1_793_376_000_000L
        val sc = ServerClock { w }
        // Server zegt 16:04:21; het toestel denkt dat het 20 s eerder is.
        sc.onDateHeader("Fri, 30 Oct 2026 16:04:21 GMT", sentWall = 1_793_376_240_000L, recvWall = 1_793_376_240_100L)
        assertEquals(1_793_376_261_500L - 1_793_376_240_050L, sc.offsetMs)
        assertFalse(sc.isPrecise)
    }

    @Test
    fun serverstempelIsNauwkeurigerEnWintVanDeHeader() {
        var w = 1_000_000L
        val sc = ServerClock { w }
        sc.onDateHeader("Fri, 30 Oct 2026 16:04:21 GMT", 0, 0)
        sc.onServerStamp(stampMs = 1_000_600, sentWall = 1_000_000, recvWall = 1_000_200)
        assertTrue(sc.isPrecise)
        assertEquals(500L, sc.offsetMs) // stempel 600 − midden 100
        // Een latere, zwakkere header overschrijft de precieze meting niet.
        sc.onDateHeader("Fri, 30 Oct 2026 16:04:21 GMT", 0, 0)
        assertEquals(500L, sc.offsetMs)
        // Een tragere peiling (grotere RTT) wordt genegeerd zolang de oude vers is.
        w += 1_000
        sc.onServerStamp(stampMs = 2_000_000, sentWall = 1_001_000, recvWall = 1_002_000)
        assertEquals(500L, sc.offsetMs)
        assertEquals(1_000_000 + 500L, sc.toServerTime(1_000_000))
    }

    @Test
    fun onzinnigeSprongenWordenGenegeerd() {
        val sc = ServerClock { 0L }
        sc.onServerStamp(stampMs = 99_999_999_999, sentWall = 0, recvWall = 100)
        assertEquals(0L, sc.offsetMs)
    }
}

class ListParserTest {
    @Test
    fun filtertDemoEnAnalyseEnLeestPloegnamen() {
        val body = """{"docs":[
          {"id":1,"title":"A — B","date":"2026-11-07T08:00:00.000Z","status":"scheduled","reeks":"U12B","afgelast":false,"isDemo":false,"analyseOnly":false,
           "homeTeam":{"id":5,"name":"Avanti Lissewege"},"awayTeam":{"id":6,"name":"D&W Koekelare"}},
          {"id":2,"title":"Demo — Demo","status":"scheduled","isDemo":true},
          {"id":3,"title":"X — Y","status":"live","analyseOnly":true},
          {"id":4,"title":"Club C — Club D","date":"2026-11-07T09:00:00.000Z","status":"live","homeTeam":5,"awayTeam":6,"afgelast":true}
        ],"hasNextPage":true}"""
        val page = parseMatchesBody(body)
        assertEquals(listOf(1, 4), page.rows.map { it.id })
        assertEquals("Avanti Lissewege", page.rows[0].home)
        assertEquals("D&W Koekelare", page.rows[0].away)
        assertEquals("Club C", page.rows[1].home) // relatie niet uitgeklapt → titel
        assertEquals("Club D", page.rows[1].away)
        assertTrue(page.rows[1].cancelled)
        assertTrue(page.hasNext)
    }
}

class CategoryTest {
    @Test
    fun speelduurPerCategorie() {
        assertEquals(20 * 60, halfDurationSeconds("U12"))
        assertEquals(20 * 60, halfDurationSeconds("U16"))
        assertEquals(25 * 60, halfDurationSeconds("U18"))
        assertEquals(25 * 60, halfDurationSeconds("senioren"))
        assertNotNull(Side.fromWire("home"))
    }
}

class LogoTest {
    private val base = "https://livescore.roodgries.be"

    @Test
    fun federatielogoLooptViaDeEigenRouteZoalsOpDeSite() {
        assertEquals(
            "https://livescore.roodgries.be/api/clublogo?u=https%3A%2F%2Fwww.krachtbal.be%2Fimages%2Flogo_3.gif",
            logoSource("https://www.krachtbal.be/images/logo_3.gif", "$base/"),
        )
    }

    @Test
    fun httpEnHttpsGevenDezelfdeSleutel() {
        val a = logoSource("http://krachtbal.be/images/a.png", base)
        val b = logoSource("https://krachtbal.be/images/a.png", base)
        assertEquals(a, b)
        assertTrue(a!!.contains("u=https%3A%2F%2Fkrachtbal.be%2Fimages%2Fa.png"))
    }

    @Test
    fun enkelDeVasteHostsEnBeeldmappenWordenBewaard() {
        assertFalse(isBewaardLogo("https://evil.example/images/logo_3.gif"))
        assertFalse(isBewaardLogo("https://www.krachtbal.be/andere/logo_3.gif"))
        assertFalse(isBewaardLogo("https://www.krachtbal.be/images/logo_3.gif?x=1"))
        assertFalse(isBewaardLogo("https://www.krachtbal.be:8443/images/logo_3.gif"))
        assertFalse(isBewaardLogo("https://u:p@www.krachtbal.be/images/logo_3.gif"))
        assertFalse(isBewaardLogo("https://www.krachtbal.be/images/../secret.gif"))
        assertTrue(isBewaardLogo("https://www.krachtbal.be/news_images/x-1.JPG"))
    }

    @Test
    fun anderePadenBlijvenOfKrijgenDeServerbasis() {
        assertEquals("$base/api/media/file/x.png", logoSource("/api/media/file/x.png", base))
        assertEquals("https://cdn.example/y.png", logoSource("//cdn.example/y.png", base))
        assertEquals("https://cdn.example/y.png", logoSource("https://cdn.example/y.png", base))
        assertNull(logoSource(null, base))
        assertNull(logoSource("   ", base))
    }

    @Test
    fun initialenAlsErGeenLogoIs() {
        assertEquals("KRS", initialsFor("KV Roeselare Senioren"))
        assertEquals("BS", initialsFor("Buffalo's Sijsele"))
        assertEquals("A", initialsFor("a"))
        assertEquals("ABC", initialsFor("A B C D"))
        assertEquals("", initialsFor("   "))
    }

    @Test
    fun clubsMetUploadExternLogoEnUitsnede() {
        val body = """{"docs":[
          {"id":1,"name":"Met upload","logo":{"id":9,"url":"/api/media/file/a.png"},"logoUrl":"https://www.krachtbal.be/images/logo_1.png","logoZoom":1.5,"logoOffsetX":10,"logoOffsetY":-5,"colorPrimary":"#ff8000"},
          {"id":2,"name":"Extern","logo":null,"logoUrl":"https://www.krachtbal.be/images/logo_2.png","logoZoom":1,"logoOffsetX":0,"logoOffsetY":0,"colorPrimary":null},
          {"id":3,"name":"Zonder","logo":null,"logoUrl":null},
          {"id":4,"name":"Absurd","logoUrl":"https://x/y.png","logoZoom":9,"logoOffsetX":400}
        ]}"""
        val clubs = parseClubsBody(body).associateBy { it.id }
        assertEquals("/api/media/file/a.png", clubs[1]!!.logoUrl) // upload gaat voor
        assertEquals(LogoFit(1.5, 10.0, -5.0), clubs[1]!!.fit)
        assertEquals("#ff8000", clubs[1]!!.color)
        assertEquals("https://www.krachtbal.be/images/logo_2.png", clubs[2]!!.logoUrl)
        assertNull(clubs[2]!!.fit) // standaard: geen transform
        assertNull(clubs[3]!!.logoUrl)
        assertEquals(LogoFit(3.0, 50.0, 0.0), clubs[4]!!.fit) // zoals normalizeLogoFit: begrensd
    }

    @Test
    fun lijstGeeftHetClubIdVanElkePloeg() {
        val body = """{"docs":[
          {"id":1,"title":"A — B","status":"scheduled","homeTeam":{"id":5,"name":"A","club":77},"awayTeam":{"id":6,"name":"B","club":{"id":64,"name":"B-club"}}},
          {"id":2,"title":"C — D","status":"scheduled","homeTeam":{"id":7,"name":"C","club":null},"awayTeam":7}
        ]}"""
        val rows = parseMatchesBody(body).rows
        assertEquals(77, rows[0].homeClub)
        assertEquals(64, rows[0].awayClub)
        assertNull(rows[1].homeClub)
        assertNull(rows[1].awayClub)
    }
}
