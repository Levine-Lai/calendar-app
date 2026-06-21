package com.local.sportscalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MlbTodayWidgetProvider extends AppWidgetProvider {
    public static final String PREFS_NAME = "sports_widget";
    public static final String PREFS_EVENTS = "events_json";

    private static final String ACTION_REFRESH = "com.local.sportscalendar.action.REFRESH_WIDGET";
    private static final String ACTION_SCROLL_UP = "com.local.sportscalendar.action.SCROLL_WIDGET_UP";
    private static final String ACTION_SCROLL_DOWN = "com.local.sportscalendar.action.SCROLL_WIDGET_DOWN";
    private static final int SCORE_DEFAULT_COLOR = 0xFF16120F;
    private static final int SCORE_LIVE_COLOR = 0xFFD83A34;
    private static final TimeZone BEIJING_TIME = TimeZone.getTimeZone("Asia/Shanghai");
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateWidgetsAsync(context.getApplicationContext(), appWidgetManager, appWidgetIds);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null) {
            return;
        }
        if (ACTION_REFRESH.equals(intent.getAction())) {
            refreshAll(context.getApplicationContext());
        } else if (ACTION_SCROLL_UP.equals(intent.getAction())) {
            scrollAll(context.getApplicationContext(), -1);
        } else if (ACTION_SCROLL_DOWN.equals(intent.getAction())) {
            scrollAll(context.getApplicationContext(), 1);
        }
    }

    @Override
    public void onEnabled(Context context) {
        refreshAll(context.getApplicationContext());
    }

    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MlbTodayWidgetProvider.class));
        updateWidgetsAsync(context.getApplicationContext(), manager, ids);
    }

    private static void updateWidgetsAsync(
        Context context,
        AppWidgetManager manager,
        int[] widgetIds
    ) {
        EXECUTOR.execute(() -> {
            boolean hasPaging = readTodayGames(context).size() > 3;
            for (int appWidgetId : widgetIds) {
                RemoteViews views = baseViews(context, appWidgetId, hasPaging);
                manager.updateAppWidget(appWidgetId, views);
                manager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.game_list);
            }
        });
    }

    private static void scrollAll(Context context, int offset) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] widgetIds = manager.getAppWidgetIds(new ComponentName(context, MlbTodayWidgetProvider.class));
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_mlb_today);
        views.setRelativeScrollPosition(R.id.game_list, offset);
        manager.partiallyUpdateAppWidget(widgetIds, views);
    }

    private static RemoteViews baseViews(Context context, int appWidgetId, boolean hasPaging) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_mlb_today);
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        views.setTextViewText(R.id.widget_date_label, todayLabel());
        Intent serviceIntent = new Intent(context, SportsWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.game_list, serviceIntent);
        views.setPendingIntentTemplate(R.id.game_list, pendingIntent);
        views.setViewVisibility(R.id.widget_scroll_up, hasPaging ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_scroll_down, hasPaging ? View.VISIBLE : View.GONE);

        Intent scrollUpIntent = new Intent(context, MlbTodayWidgetProvider.class);
        scrollUpIntent.setAction(ACTION_SCROLL_UP);
        PendingIntent scrollUpPendingIntent = PendingIntent.getBroadcast(
            context,
            2,
            scrollUpIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_scroll_up, scrollUpPendingIntent);

        Intent scrollDownIntent = new Intent(context, MlbTodayWidgetProvider.class);
        scrollDownIntent.setAction(ACTION_SCROLL_DOWN);
        PendingIntent scrollDownPendingIntent = PendingIntent.getBroadcast(
            context,
            3,
            scrollDownIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_scroll_down, scrollDownPendingIntent);

        Intent refreshIntent = new Intent(context, MlbTodayWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH);
        PendingIntent refreshPendingIntent = PendingIntent.getBroadcast(
            context,
            1,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_refresh_button, refreshPendingIntent);
        return views;
    }

    static List<Game> readTodayGames(Context context) {
        String raw = context
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREFS_EVENTS, "[]");
        List<Game> games = new ArrayList<>();
        try {
            JSONArray events = new JSONArray(raw);
            for (int index = 0; index < events.length(); index += 1) {
                Game game = parseStoredGame(events.optJSONObject(index));
                if (game != null && isBeijingToday(game.start)) {
                    games.add(game);
                }
            }
        } catch (Exception ignored) {
            return games;
        }

        Collections.sort(games, (left, right) -> left.start.compareTo(right.start));
        return games;
    }

    private static Game parseStoredGame(JSONObject event) {
        if (event == null) {
            return null;
        }
        Date start = parseDate(event.optString("start", ""));
        if (start == null) {
            return null;
        }

        Game game = new Game();
        game.start = start;
        game.awayLogo = event.optString("awayLogo", "");
        game.homeLogo = event.optString("homeLogo", "");
        game.leagueLabel = event.optString("leagueName", event.optString("league", "比赛"));
        game.sourceId = event.optString("sourceId", "");
        game.sport = event.optString("sport", "");
        game.espnLeague = event.optString("espnLeague", "");
        game.dataSource = event.optString("dataSource", "espn");
        game.providerLeagueId = event.optString("providerLeagueId", "");
        game.providerYear = event.optString("providerYear", "");
        game.providerDate = event.optString("providerDate", "");
        game.awayScore = event.optString("awayScore", "");
        game.homeScore = event.optString("homeScore", "");
        game.completed = event.optBoolean("completed", false);
        game.status = event.optString("status", "");
        game.statusState = event.optString("statusState", "");
        return game;
    }

    static void renderEmpty(RemoteViews views) {
        views.setImageViewResource(R.id.away_logo, R.drawable.ic_team_placeholder);
        views.setImageViewResource(R.id.home_logo, R.drawable.ic_team_placeholder);
        views.setTextViewText(R.id.start, "");
        views.setTextColor(R.id.time, SCORE_DEFAULT_COLOR);
        views.setTextViewText(R.id.time, "今日暂无");
        views.setTextViewText(R.id.type, "打开 App 导入赛程");
    }

    static void renderGame(Context context, RemoteViews views, Game game) {
        views.setTextViewText(R.id.start, startTimeLabel(game));
        views.setTextViewText(R.id.time, primaryLabel(game));
        views.setTextColor(R.id.time, isLive(game) ? SCORE_LIVE_COLOR : SCORE_DEFAULT_COLOR);
        views.setTextViewText(R.id.type, secondaryLabel(game));
        setLogo(context, views, R.id.away_logo, game.awayLogo);
        setLogo(context, views, R.id.home_logo, game.homeLogo);
    }

    private static void setLogo(Context context, RemoteViews views, int viewId, String logoUrl) {
        Bitmap bitmap = downloadBitmap(context, logoUrl);
        if (bitmap == null) {
            views.setImageViewResource(viewId, R.drawable.ic_team_placeholder);
        } else {
            views.setImageViewBitmap(viewId, bitmap);
        }
    }

    static void hydrateLiveScores(List<Game> games) {
        Map<String, List<Game>> groups = new HashMap<>();
        for (Game game : games) {
            if (game.sourceId == null || game.sourceId.isEmpty()
                || game.sport == null || game.sport.isEmpty()
                || game.espnLeague == null || game.espnLeague.isEmpty()) {
                continue;
            }
            String key = game.sport + "|" + game.espnLeague + "|" + espnDate(game.start);
            if (!groups.containsKey(key)) {
                groups.put(key, new ArrayList<>());
            }
            groups.get(key).add(game);
        }

        for (Map.Entry<String, List<Game>> entry : groups.entrySet()) {
            try {
                String[] parts = entry.getKey().split("\\|");
                String endpoint = "https://site.api.espn.com/apis/site/v2/sports/"
                    + parts[0] + "/" + parts[1]
                    + "/scoreboard?dates=" + parts[2] + "&limit=300";
                Map<String, JSONObject> liveEvents = fetchEventsById(endpoint);
                for (Game game : entry.getValue()) {
                    JSONObject liveEvent = liveEvents.get(game.sourceId);
                    if (liveEvent != null) {
                        applyLiveEvent(game, liveEvent);
                    }
                }
            } catch (Exception ignored) {
                // Keep the imported snapshot if live refresh fails.
            }
        }
        hydrateSportsDbScores(games);
        hydrateCfaScores(games);
    }

    private static void hydrateSportsDbScores(List<Game> games) {
        Map<String, List<Game>> groups = new HashMap<>();
        for (Game game : games) {
            if (!"thesportsdb".equals(game.dataSource)
                || game.sourceId == null || game.sourceId.isEmpty()
                || game.providerLeagueId == null || game.providerLeagueId.isEmpty()
                || game.providerDate == null || game.providerDate.isEmpty()) {
                continue;
            }
            String key = game.providerLeagueId + "|" + game.providerDate;
            if (!groups.containsKey(key)) {
                groups.put(key, new ArrayList<>());
            }
            groups.get(key).add(game);
        }

        for (Map.Entry<String, List<Game>> entry : groups.entrySet()) {
            try {
                String[] parts = entry.getKey().split("\\|");
                String endpoint = "https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d="
                    + parts[1] + "&l=" + parts[0];
                JSONObject root = new JSONObject(httpGet(endpoint));
                JSONArray events = root.optJSONArray("events");
                Map<String, JSONObject> byId = jsonArrayById(events, "idEvent");
                for (Game game : entry.getValue()) {
                    JSONObject event = byId.get(game.sourceId);
                    if (event == null) {
                        continue;
                    }
                    game.homeScore = cleanJsonValue(event.optString("intHomeScore", game.homeScore));
                    game.awayScore = cleanJsonValue(event.optString("intAwayScore", game.awayScore));
                    String status = event.optString("strStatus", game.status);
                    game.status = status;
                    game.completed = status.matches("(?i)FT|AET|PEN|Match Finished");
                    game.statusState = game.completed ? "post" : (
                        status.matches("(?i).*live.*|.*progress.*|.*half.*") ? "in" : "pre"
                    );
                    String awayLogo = event.optString("strAwayTeamBadge", "");
                    String homeLogo = event.optString("strHomeTeamBadge", "");
                    if (!awayLogo.isEmpty()) game.awayLogo = awayLogo;
                    if (!homeLogo.isEmpty()) game.homeLogo = homeLogo;
                }
            } catch (Exception ignored) {
                // Keep the imported snapshot if this provider is unavailable.
            }
        }
    }

    private static void hydrateCfaScores(List<Game> games) {
        Map<String, List<Game>> groups = new HashMap<>();
        for (Game game : games) {
            if (!"cfa".equals(game.dataSource)
                || game.sourceId == null || game.sourceId.isEmpty()
                || game.providerLeagueId == null || game.providerLeagueId.isEmpty()) {
                continue;
            }
            String year = game.providerYear == null || game.providerYear.isEmpty()
                ? new SimpleDateFormat("yyyy", Locale.US).format(game.start)
                : game.providerYear;
            String key = game.providerLeagueId + "|" + year;
            if (!groups.containsKey(key)) {
                groups.put(key, new ArrayList<>());
            }
            groups.get(key).add(game);
        }

        for (Map.Entry<String, List<Game>> entry : groups.entrySet()) {
            try {
                String[] parts = entry.getKey().split("\\|");
                String endpoint = "https://data.thecfa.cn/gameplans.do?lid="
                    + parts[0] + "&year=" + parts[1];
                JSONArray events = new JSONArray(httpGet(endpoint));
                Map<String, JSONObject> byId = jsonArrayById(events, "gameid");
                for (Game game : entry.getValue()) {
                    JSONObject event = byId.get(game.sourceId);
                    if (event == null) {
                        continue;
                    }
                    String score = event.optString("score", "");
                    if (score.matches("\\d+\\s*[:\\-]\\s*\\d+")) {
                        String[] values = score.split("[:\\-]");
                        game.homeScore = values[0].trim();
                        game.awayScore = values[1].trim();
                        game.completed = true;
                        game.status = "已结束";
                        game.statusState = "post";
                    }
                }
            } catch (Exception ignored) {
                // Keep the imported snapshot if this provider is unavailable.
            }
        }
    }

    private static Map<String, JSONObject> jsonArrayById(JSONArray events, String key) {
        Map<String, JSONObject> byId = new HashMap<>();
        if (events == null) {
            return byId;
        }
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (event != null) {
                byId.put(event.optString(key, ""), event);
            }
        }
        return byId;
    }

    private static String cleanJsonValue(String value) {
        return value == null || "null".equalsIgnoreCase(value) ? "" : value;
    }

    private static Map<String, JSONObject> fetchEventsById(String endpoint) throws Exception {
        JSONObject root = new JSONObject(httpGet(endpoint));
        JSONArray events = root.optJSONArray("events");
        Map<String, JSONObject> byId = new HashMap<>();
        if (events == null) {
            return byId;
        }
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (event != null) {
                byId.put(event.optString("id", ""), event);
            }
        }
        return byId;
    }

    private static void applyLiveEvent(Game game, JSONObject event) {
        JSONObject competition = firstObject(event.optJSONArray("competitions"));
        JSONArray competitors = competition == null ? null : competition.optJSONArray("competitors");
        JSONObject away = findCompetitor(competitors, "away");
        JSONObject home = findCompetitor(competitors, "home");
        if (away != null) {
            game.awayScore = away.optString("score", game.awayScore);
            JSONObject team = away.optJSONObject("team");
            String logo = teamLogo(team);
            if (!logo.isEmpty()) {
                game.awayLogo = logo;
            }
        }
        if (home != null) {
            game.homeScore = home.optString("score", game.homeScore);
            JSONObject team = home.optJSONObject("team");
            String logo = teamLogo(team);
            if (!logo.isEmpty()) {
                game.homeLogo = logo;
            }
        }

        JSONObject status = competition == null ? null : competition.optJSONObject("status");
        if (status == null) {
            status = event.optJSONObject("status");
        }
        JSONObject type = status == null ? null : status.optJSONObject("type");
        if (type != null) {
            game.status = type.optString(
                "shortDetail",
                type.optString("detail", type.optString("description", game.status))
            );
            game.statusState = type.optString("state", game.statusState);
            game.completed = type.optBoolean("completed", game.completed);
        }
    }

    private static JSONObject firstObject(JSONArray array) {
        if (array == null || array.length() == 0) {
            return null;
        }
        return array.optJSONObject(0);
    }

    private static JSONObject findCompetitor(JSONArray competitors, String homeAway) {
        if (competitors == null) {
            return null;
        }
        for (int index = 0; index < competitors.length(); index += 1) {
            JSONObject competitor = competitors.optJSONObject(index);
            if (competitor != null && homeAway.equals(competitor.optString("homeAway"))) {
                return competitor;
            }
        }
        return null;
    }

    private static String teamLogo(JSONObject team) {
        if (team == null) {
            return "";
        }
        String logo = team.optString("logo", "");
        if (!logo.isEmpty()) {
            return logo;
        }
        JSONArray logos = team.optJSONArray("logos");
        JSONObject firstLogo = firstObject(logos);
        return firstLogo == null ? "" : firstLogo.optString("href", "");
    }

    private static String espnDate(Date date) {
        SimpleDateFormat format = new SimpleDateFormat("yyyyMMdd", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("America/New_York"));
        return format.format(date);
    }

    private static String httpGet(String endpoint) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "GuansaiRijiWidget/1.0");
        try (InputStream input = new BufferedInputStream(connection.getInputStream());
             BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
            return builder.toString();
        } finally {
            connection.disconnect();
        }
    }

    private static String primaryLabel(Game game) {
        if (!game.awayScore.isEmpty() && !game.homeScore.isEmpty()) {
            return game.awayScore + " - " + game.homeScore;
        }
        if (isLive(game)) {
            return "\u8FDB\u884C\u4E2D";
        }
        if (isFinished(game)) {
            return "\u5DF2\u7ED3\u675F";
        }
        return "\u672A\u5F00\u59CB";
    }

    private static String secondaryLabel(Game game) {
        if (!game.awayScore.isEmpty() && !game.homeScore.isEmpty()) {
            return statusLabel(game) + " · " + game.leagueLabel;
        }
        return game.leagueLabel;
    }

    private static String statusLabel(Game game) {
        String status = game.status == null ? "" : game.status.toLowerCase(Locale.US);
        if (status.contains("in progress") || status.contains("live") || status.contains("进行")) {
            return "进行中";
        }
        if (game.completed || status.contains("final") || status.contains("已结束")) {
            return "已结束";
        }
        return timeLabel(game);
    }

    private static String timeLabel(Game game) {
        String status = game.status == null ? "" : game.status.toLowerCase(Locale.US);
        if (status.contains("in progress") || status.contains("live") || status.contains("进行")) {
            return "进行中";
        }
        if (game.completed || status.contains("final") || status.contains("已结束")) {
            return "已结束";
        }
        SimpleDateFormat format = new SimpleDateFormat("HH:mm", Locale.CHINA);
        format.setTimeZone(BEIJING_TIME);
        return format.format(game.start);
    }

    private static String todayLabel() {
        SimpleDateFormat format = new SimpleDateFormat("M/d", Locale.CHINA);
        format.setTimeZone(BEIJING_TIME);
        return format.format(new Date()).replace("/", "\u6708") + "\u65E5";
    }

    private static String startTimeLabel(Game game) {
        SimpleDateFormat format = new SimpleDateFormat("HH:mm", Locale.CHINA);
        format.setTimeZone(BEIJING_TIME);
        return format.format(game.start);
    }

    private static boolean isLive(Game game) {
        String state = game.statusState == null ? "" : game.statusState.toLowerCase(Locale.US);
        String status = game.status == null ? "" : game.status.toLowerCase(Locale.US);
        if (isFinished(game)) {
            return false;
        }
        return state.equals("in")
            || status.contains("in progress")
            || status.contains("live")
            || status.contains("top")
            || status.contains("bot")
            || status.contains("bottom")
            || status.contains("mid")
            || status.contains("halftime")
            || status.equals("ht")
            || status.contains("'");
    }

    private static boolean isFinished(Game game) {
        String state = game.statusState == null ? "" : game.statusState.toLowerCase(Locale.US);
        String status = game.status == null ? "" : game.status.toLowerCase(Locale.US);
        return game.completed
            || state.equals("post")
            || status.contains("final")
            || status.contains("full time")
            || status.equals("ft");
    }

    private static boolean isBeijingToday(Date date) {
        Calendar now = Calendar.getInstance(BEIJING_TIME, Locale.CHINA);
        Calendar target = Calendar.getInstance(BEIJING_TIME, Locale.CHINA);
        target.setTime(date);
        return now.get(Calendar.YEAR) == target.get(Calendar.YEAR)
            && now.get(Calendar.DAY_OF_YEAR) == target.get(Calendar.DAY_OF_YEAR);
    }

    private static Date parseDate(String value) {
        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                return format.parse(value);
            } catch (Exception ignored) {
                // Try the next timestamp shape.
            }
        }
        try {
            return new Date(Date.parse(value));
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Bitmap downloadBitmap(Context context, String imageUrl) {
        if (imageUrl == null || imageUrl.isEmpty()) {
            return null;
        }
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(imageUrl).openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            try (InputStream input = new BufferedInputStream(connection.getInputStream())) {
                Bitmap bitmap = BitmapFactory.decodeStream(input);
                if (bitmap == null) {
                    return null;
                }
                int size = Math.round(36 * context.getResources().getDisplayMetrics().density);
                return Bitmap.createScaledBitmap(bitmap, size, size, true);
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    static class Game {
        Date start;
        String sourceId;
        String sport;
        String espnLeague;
        String dataSource;
        String providerLeagueId;
        String providerYear;
        String providerDate;
        String awayLogo;
        String homeLogo;
        String awayScore;
        String homeScore;
        String leagueLabel;
        String status;
        String statusState;
        boolean completed;
    }
}
