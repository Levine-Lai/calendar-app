package com.local.sportscalendar;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Date;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.junit.Test;

public class WidgetGameStatusTest {
    @Test
    public void liveStateIsRecognized() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Top 5th";
        game.statusState = "in";
        game.completed = false;

        assertTrue(MlbTodayWidgetProvider.isLive(game));
        assertFalse(MlbTodayWidgetProvider.isFinished(game));
    }

    @Test
    public void completedGameCannotRemainLive() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Final";
        game.statusState = "post";
        game.completed = true;

        assertTrue(MlbTodayWidgetProvider.isFinished(game));
        assertFalse(MlbTodayWidgetProvider.isLive(game));
    }

    @Test
    public void baseballWidgetShowsInningDetails() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.sport = "baseball";
        game.espnLeague = "mlb";
        game.status = "Top 5th";
        game.statusState = "in";

        assertEquals("5局上", MlbTodayWidgetProvider.statusLabel(game));

        game.status = "Bot 8th";
        assertEquals("8局下", MlbTodayWidgetProvider.statusLabel(game));
    }

    @Test
    public void cflPlayingStatusIsLive() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Playing";
        game.statusState = "pre";
        game.completed = false;

        assertTrue(MlbTodayWidgetProvider.isLive(game));
        assertFalse(MlbTodayWidgetProvider.isFinished(game));
    }

    @Test
    public void cflPlayedStatusIsFinished() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Played";
        game.statusState = "pre";
        game.completed = false;

        assertTrue(MlbTodayWidgetProvider.isFinished(game));
        assertFalse(MlbTodayWidgetProvider.isLive(game));
    }

    @Test
    public void soccerPeriodCodesAreLive() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "1H";
        assertTrue(MlbTodayWidgetProvider.isLive(game));

        game.status = "2H";
        assertTrue(MlbTodayWidgetProvider.isLive(game));
    }

    @Test
    public void quarterCodesAreLive() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Q2";

        assertTrue(MlbTodayWidgetProvider.isLive(game));
    }

    @Test
    public void futureGameCannotRemainLive() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Top 1st";
        game.statusState = "in";
        game.completed = false;
        game.start = new Date(System.currentTimeMillis() + TimeUnit.DAYS.toMillis(3));

        assertFalse(MlbTodayWidgetProvider.isLive(game));
        assertFalse(MlbTodayWidgetProvider.isFinished(game));
    }

    @Test
    public void scheduledTimeTextIsNotLiveStatus() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "07:10";
        game.statusState = "pre";
        game.completed = false;
        game.start = new Date(System.currentTimeMillis());

        assertFalse(MlbTodayWidgetProvider.isLive(game));
    }

    @Test
    public void cslChineseAndEnglishNamesMatch() {
        assertTrue(MlbTodayWidgetProvider.sameCslTeam("成都蓉城", "Chengdu Rongcheng"));
        assertTrue(MlbTodayWidgetProvider.sameCslTeam("天津津门虎", "Tianjin Jinmen Tiger"));
        assertTrue(MlbTodayWidgetProvider.sameCslTeam("上海海港", "Shanghai Port"));
    }

    @Test
    public void differentCslTeamsDoNotMatchByShortSubstring() {
        assertFalse(MlbTodayWidgetProvider.sameCslTeam("成都蓉城", "重庆铜梁龙"));
        assertFalse(MlbTodayWidgetProvider.sameCslTeam("上海申花", "上海海港"));
    }

    @Test
    public void postponedGameIsNotFinishedOrLive() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Postponed";
        game.statusState = "post";
        game.completed = false;
        game.start = new Date(System.currentTimeMillis() - TimeUnit.HOURS.toMillis(1));

        assertFalse(MlbTodayWidgetProvider.isFinished(game));
        assertFalse(MlbTodayWidgetProvider.isLive(game));
        assertEquals("已延期", MlbTodayWidgetProvider.statusLabel(game));
    }

    @Test
    public void ambiguousStatusFragmentsAreNotLive() {
        assertFalse(GameStatus.isLiveText("half postponed"));
        assertFalse(GameStatus.isLiveText("coach's review"));
        assertTrue(GameStatus.isLiveText("45'"));
    }

    @Test
    public void cfaScoreDuringMatchDoesNotForceFinishedState() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.start = new Date(System.currentTimeMillis() - TimeUnit.HOURS.toMillis(1));
        MlbTodayWidgetProvider.applyCfaStatus(game, "", true);

        assertTrue(MlbTodayWidgetProvider.isLive(game));
        assertFalse(MlbTodayWidgetProvider.isFinished(game));
    }

    @Test
    public void widgetDateOffsetsUseIndependentPreferenceKeys() {
        assertEquals("selected_day_offset_101", MlbTodayWidgetProvider.selectedDayOffsetKey(101));
        assertEquals("selected_day_offset_202", MlbTodayWidgetProvider.selectedDayOffsetKey(202));
        assertFalse(
            MlbTodayWidgetProvider.selectedDayOffsetKey(101)
                .equals(MlbTodayWidgetProvider.selectedDayOffsetKey(202))
        );
    }

    @Test
    public void malformedScoresNeverRenderObjectText() {
        assertEquals("5", MlbTodayWidgetProvider.scoreJsonValue(5));
        assertEquals("", MlbTodayWidgetProvider.scoreJsonValue("[object Object]"));
    }

    @Test
    public void widgetsHaveNoRowsWhenThereAreNoGames() {
        assertEquals(0, SportsWidgetService.rowCount(0));
        assertEquals(0, SportsDetailWidgetService.rowCount(0));
    }

    @Test
    public void populatedWidgetsKeepTheirExistingRowRules() {
        assertEquals(3, SportsWidgetService.rowCount(1));
        assertEquals(3, SportsWidgetService.rowCount(3));
        assertEquals(4, SportsWidgetService.rowCount(4));
        assertEquals(1, SportsDetailWidgetService.rowCount(1));
        assertEquals(4, SportsDetailWidgetService.rowCount(4));
    }

    @Test
    public void teamNewsOnlyOpensOfficialMlbLinks() {
        assertEquals(
            "https://www.mlb.com/bluejays/news/example",
            TeamNewsPushManager.safeMlbUrl("https://www.mlb.com/bluejays/news/example")
        );
        assertEquals("", TeamNewsPushManager.safeMlbUrl("http://www.mlb.com/bluejays/news/example"));
        assertEquals("", TeamNewsPushManager.safeMlbUrl("https://mlb.com.example.org/fake"));
        assertEquals("", TeamNewsPushManager.safeMlbUrl("javascript:alert(1)"));
    }

    @Test
    public void teamNewsBuildsOnlyOfficialAmpArticleUrls() {
        assertEquals(
            "https://www.mlb.com/amp/news/jays-add-reliever.html",
            TeamNewsPushManager.toMlbAmpUrl("https://www.mlb.com/bluejays/news/jays-add-reliever")
        );
        assertEquals(
            "https://www.mlb.com/amp/news/jays-add-reliever.html",
            TeamNewsPushManager.toMlbAmpUrl("https://www.mlb.com/amp/news/jays-add-reliever.html")
        );
        assertEquals("", TeamNewsPushManager.toMlbAmpUrl("https://example.com/news/jays-add-reliever"));
        assertEquals("", TeamNewsPushManager.toMlbAmpUrl("https://www.mlb.com/news/../../secret"));
    }

    @Test
    public void teamNewsSyncAllowsOnlyConfiguredStaticEndpoints() {
        assertEquals(
            "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/blue-jays.json?_=1",
            TeamNewsPushManager.safeNewsEndpoint(
                "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/blue-jays.json?_=1"
            )
        );
        assertEquals(
            "https://cdn.jsdelivr.net/gh/Levine-Lai/calendar-app@main/public/news/blue-jays.json",
            TeamNewsPushManager.safeNewsEndpoint(
                "https://cdn.jsdelivr.net/gh/Levine-Lai/calendar-app@main/public/news/blue-jays.json"
            )
        );
        assertEquals("", TeamNewsPushManager.safeNewsEndpoint("https://example.com/blue-jays.json"));
        assertEquals("", TeamNewsPushManager.safeNewsEndpoint(
            "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/private/secret.json"
        ));
    }

    @Test
    public void mlbRssParserKeepsNewestOfficialStoriesOnly() throws Exception {
        String xml = "<?xml version=\"1.0\"?><rss><channel>"
            + "<item><title>Older story</title><link>https://www.mlb.com/bluejays/news/older</link>"
            + "<description><![CDATA[<p>Older summary</p>]]></description>"
            + "<pubDate>Thu, 16 Jul 2026 19:00:00 GMT</pubDate></item>"
            + "<item><title>Fresh story</title><link>https://www.mlb.com/bluejays/news/fresh</link>"
            + "<description><![CDATA[<p>Fresh &amp; useful</p>]]></description>"
            + "<pubDate>Fri, 17 Jul 2026 13:00:00 GMT</pubDate></item>"
            + "<item><title>Unsafe story</title><link>https://example.com/news/unsafe</link>"
            + "<pubDate>Fri, 17 Jul 2026 14:00:00 GMT</pubDate></item>"
            + "</channel></rss>";
        List<TeamNewsFeed.Item> items = TeamNewsFeed.parse(xml);

        assertEquals(2, items.size());
        assertEquals("Fresh story", items.get(0).title);
        assertEquals("Fresh & useful", items.get(0).summary);
        assertEquals(64, items.get(0).id.length());
        assertEquals("https://www.mlb.com/bluejays/news/fresh", items.get(0).url);
    }

    @Test(expected = Exception.class)
    public void mlbRssParserRejectsDoctypeDocuments() throws Exception {
        TeamNewsFeed.parse("<!DOCTYPE rss [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><rss><channel/></rss>");
    }
}
