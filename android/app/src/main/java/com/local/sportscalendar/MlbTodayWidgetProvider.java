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

import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MlbTodayWidgetProvider extends AppWidgetProvider {
    public static final String PREFS_NAME = "sports_widget";
    public static final String PREFS_EVENTS = "events_json";
    private static final String PREFS_SELECTED_DAY_OFFSET = "selected_day_offset";
    private static final String PREFS_LIVE_SNAPSHOT = "live_snapshot_json";
    static final String PREFS_LAST_REFRESH_AT = "last_refresh_at";
    static final String PREFS_LAST_REFRESH_ERROR = "last_refresh_error";

    static final String ACTION_REFRESH = "com.local.sportscalendar.action.REFRESH_WIDGET";
    static final String ACTION_PREV_DAY = "com.local.sportscalendar.action.PREV_DAY_WIDGET";
    static final String ACTION_NEXT_DAY = "com.local.sportscalendar.action.NEXT_DAY_WIDGET";
    private static final String PERIODIC_WORK_NAME = "sports-widget-live-refresh";
    private static final String IMMEDIATE_WORK_NAME = "sports-widget-refresh-now";
    private static final int SCORE_DEFAULT_COLOR = 0xFF16120F;
    private static final int SCORE_LIVE_COLOR = 0xFFD83A34;
    private static final TimeZone BEIJING_TIME = TimeZone.getTimeZone("Asia/Shanghai");
    private static final Object DISPLAY_GAMES_LOCK = new Object();
    private static final Object REFRESH_LOCK = new Object();
    private static final Map<Integer, DisplayCache> DISPLAY_GAMES = new HashMap<>();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Context appContext = context.getApplicationContext();
        schedulePeriodicRefresh(appContext);
        renderLocalWidgets(appContext, appWidgetManager, appWidgetIds);
        enqueueImmediateRefresh(appContext);
    }

    @Override
    public void onEnabled(Context context) {
        schedulePeriodicRefresh(context.getApplicationContext());
        refreshAll(context.getApplicationContext());
    }

    @Override
    public void onDisabled(Context context) {
        cancelPeriodicRefreshIfUnused(context.getApplicationContext());
    }

    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MlbTodayWidgetProvider.class));
        renderLocalWidgets(context.getApplicationContext(), manager, ids);
        MatchDetailWidgetProvider.refreshAllViews(context.getApplicationContext());
        enqueueImmediateRefresh(context.getApplicationContext());
    }

    static void enqueueImmediateRefresh(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request
        );
    }

    static boolean refreshAllBlocking(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MlbTodayWidgetProvider.class));
        synchronized (REFRESH_LOCK) {
            return updateWidgetsNow(context.getApplicationContext(), manager, ids);
        }
    }

    static void refreshAllViewsOnly(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MlbTodayWidgetProvider.class));
        renderLocalWidgets(context.getApplicationContext(), manager, ids);
        MatchDetailWidgetProvider.refreshAllViews(context.getApplicationContext());
    }

    private static boolean updateWidgetsNow(Context context, AppWidgetManager manager, int[] widgetIds) {
        boolean success = true;
        Map<String, List<Game>> gamesByDay = new HashMap<>();
        for (int appWidgetId : widgetIds) {
            Date requestedDay = selectedDay(context, appWidgetId);
            String requestedDayKey = dayKey(requestedDay);
            if (!gamesByDay.containsKey(requestedDayKey)) {
                gamesByDay.put(requestedDayKey, readSelectedDayGames(context, requestedDay, requestedDayKey));
            }
        }
        int[] detailWidgetIds = manager.getAppWidgetIds(new ComponentName(context, MatchDetailWidgetProvider.class));
        for (int appWidgetId : detailWidgetIds) {
            Date requestedDay = selectedDay(context, appWidgetId);
            String requestedDayKey = dayKey(requestedDay);
            if (!gamesByDay.containsKey(requestedDayKey)) {
                gamesByDay.put(requestedDayKey, readSelectedDayGames(context, requestedDay, requestedDayKey));
            }
        }
        if (widgetIds.length == 0 && detailWidgetIds.length == 0) {
            Date today = selectedDay(context, AppWidgetManager.INVALID_APPWIDGET_ID);
            gamesByDay.put(dayKey(today), readSelectedDayGames(context, today, dayKey(today)));
        }

        for (Map.Entry<String, List<Game>> entry : gamesByDay.entrySet()) {
            List<Game> liveGames = new ArrayList<>(entry.getValue());
            if (!liveGames.isEmpty()) success &= hydrateLiveScores(liveGames);
            cacheLiveSnapshot(context, entry.getKey(), liveGames);
            prefetchLogos(context, liveGames);
            entry.setValue(liveGames);
        }

        for (int appWidgetId : widgetIds) {
            String requestedDayKey = selectedDayKey(context, appWidgetId);
            cacheDisplayGames(appWidgetId, requestedDayKey, gamesByDay.get(requestedDayKey));
        }
        for (int appWidgetId : detailWidgetIds) {
            String requestedDayKey = selectedDayKey(context, appWidgetId);
            cacheDisplayGames(appWidgetId, requestedDayKey, gamesByDay.get(requestedDayKey));
        }
        updateWidgetViews(context, manager, widgetIds);
        cacheDetailWidgetGames(context);
        MatchDetailWidgetProvider.refreshAllViews(context);
        return success;
    }

    private static void renderLocalWidgets(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int appWidgetId : widgetIds) {
            Date date = selectedDay(context, appWidgetId);
            String key = dayKey(date);
            cacheDisplayGames(appWidgetId, key, readSelectedDayGames(context, date, key));
        }
        updateWidgetViews(context, manager, widgetIds);
        cacheDetailWidgetGames(context);
    }

    private static void cacheDetailWidgetGames(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] detailIds = manager.getAppWidgetIds(new ComponentName(context, MatchDetailWidgetProvider.class));
        for (int appWidgetId : detailIds) {
            Date date = selectedDay(context, appWidgetId);
            String key = dayKey(date);
            cacheDisplayGames(appWidgetId, key, readSelectedDayGames(context, date, key));
        }
    }

    private static String refreshStatusLabel(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String error = prefs.getString(PREFS_LAST_REFRESH_ERROR, "");
        long updatedAt = prefs.getLong(PREFS_LAST_REFRESH_AT, 0L);
        if (!error.isEmpty()) return "失败";
        if (updatedAt <= 0L) return "";
        SimpleDateFormat format = new SimpleDateFormat("HH:mm", Locale.CHINA);
        format.setTimeZone(BEIJING_TIME);
        return format.format(new Date(updatedAt));
    }

    static void schedulePeriodicRefresh(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            WidgetRefreshWorker.class,
            15,
            TimeUnit.MINUTES
        ).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        );
    }

    static void cancelPeriodicRefreshIfUnused(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int componentOneCount = manager
            .getAppWidgetIds(new ComponentName(context, MlbTodayWidgetProvider.class))
            .length;
        int componentTwoCount = manager
            .getAppWidgetIds(new ComponentName(context, MatchDetailWidgetProvider.class))
            .length;
        if (componentOneCount == 0 && componentTwoCount == 0) {
            WorkManager.getInstance(context)
                .cancelUniqueWork(PERIODIC_WORK_NAME);
        }
    }

    private static void updateWidgetViews(
        Context context,
        AppWidgetManager manager,
        int[] widgetIds
    ) {
        for (int appWidgetId : widgetIds) {
            RemoteViews views = baseViews(context, appWidgetId);
            manager.updateAppWidget(appWidgetId, views);
            manager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.game_list);
        }
    }

    static void shiftSelectedDay(Context context, int appWidgetId, int offset) {
        setSelectedDayOffset(context, appWidgetId, getSelectedDayOffset(context, appWidgetId) + offset);
    }

    static void setSelectedDayOffset(Context context, int appWidgetId, int nextOffset) {
        context
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putInt(selectedDayOffsetKey(appWidgetId), nextOffset)
            .apply();
        Date date = selectedDay(context, appWidgetId);
        String dayKey = dayKey(date);
        List<Game> localGames = readSelectedDayGames(context, date, dayKey);
        cacheDisplayGames(appWidgetId, dayKey, localGames);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            updateWidgetViews(context, manager, new int[] { appWidgetId });
        }
        enqueueImmediateRefresh(context);
    }

    private static RemoteViews baseViews(Context context, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_mlb_today);
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        views.setTextViewText(R.id.widget_date_label, selectedDayLabel(context, appWidgetId));
        views.setTextViewText(R.id.widget_refresh_status, refreshStatusLabel(context));
        Intent serviceIntent = new Intent(context, SportsWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.game_list, serviceIntent);
        views.setPendingIntentTemplate(R.id.game_list, pendingIntent);

        Intent prevDayIntent = new Intent(context, WidgetActionReceiver.class);
        prevDayIntent.setAction(ACTION_PREV_DAY);
        prevDayIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent prevDayPendingIntent = PendingIntent.getBroadcast(
            context,
            appWidgetId * 10 + 2,
            prevDayIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_prev_day_button, prevDayPendingIntent);

        Intent nextDayIntent = new Intent(context, WidgetActionReceiver.class);
        nextDayIntent.setAction(ACTION_NEXT_DAY);
        nextDayIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent nextDayPendingIntent = PendingIntent.getBroadcast(
            context,
            appWidgetId * 10 + 3,
            nextDayIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_next_day_button, nextDayPendingIntent);

        Intent refreshIntent = new Intent(context, WidgetActionReceiver.class);
        refreshIntent.setAction(ACTION_REFRESH);
        refreshIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent refreshPendingIntent = PendingIntent.getBroadcast(
            context,
            appWidgetId * 10 + 1,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_refresh_button, refreshPendingIntent);
        return views;
    }

    static List<Game> readSelectedDayGames(Context context, int appWidgetId) {
        Date selectedDate = selectedDay(context, appWidgetId);
        return readSelectedDayGames(context, selectedDate, dayKey(selectedDate));
    }

    private static List<Game> readSelectedDayGames(Context context, Date selectedDate, String selectedKey) {
        String raw = WidgetEventStore.read(context);
        List<Game> games = new ArrayList<>();
        Map<String, JSONObject> liveSnapshot = readLiveSnapshot(context, selectedKey);
        try {
            JSONArray events = new JSONArray(raw);
            for (int index = 0; index < events.length(); index += 1) {
                Game game = parseStoredGame(events.optJSONObject(index));
                if (game != null && isSameBeijingDay(game.start, selectedDate)) {
                    applyCachedGame(game, liveSnapshot.get(game.key()));
                    games.add(game);
                }
            }
        } catch (Exception ignored) {
            return games;
        }

        Collections.sort(games, (left, right) -> left.start.compareTo(right.start));
        return games;
    }

    static List<Game> getDisplayGames(Context context, int appWidgetId) {
        synchronized (DISPLAY_GAMES_LOCK) {
            DisplayCache cached = DISPLAY_GAMES.get(appWidgetId);
            if (cached != null && selectedDayKey(context, appWidgetId).equals(cached.dayKey)) {
                return new ArrayList<>(cached.games);
            }
        }
        return readSelectedDayGames(context, appWidgetId);
    }

    private static void cacheDisplayGames(int appWidgetId, String dayKey, List<Game> games) {
        synchronized (DISPLAY_GAMES_LOCK) {
            DISPLAY_GAMES.put(appWidgetId, new DisplayCache(dayKey, games == null ? new ArrayList<>() : games));
        }
    }

    private static int getSelectedDayOffset(Context context, int appWidgetId) {
        return context
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getInt(selectedDayOffsetKey(appWidgetId), 0);
    }

    static String selectedDayOffsetKey(int appWidgetId) {
        return PREFS_SELECTED_DAY_OFFSET + "_" + appWidgetId;
    }

    private static Date selectedDay(Context context, int appWidgetId) {
        Calendar calendar = Calendar.getInstance(BEIJING_TIME, Locale.CHINA);
        calendar.add(Calendar.DATE, getSelectedDayOffset(context, appWidgetId));
        return calendar.getTime();
    }

    private static String selectedDayKey(Context context, int appWidgetId) {
        return dayKey(selectedDay(context, appWidgetId));
    }

    private static String dayKey(Date date) {
        SimpleDateFormat format = new SimpleDateFormat("yyyyMMdd", Locale.CHINA);
        format.setTimeZone(BEIJING_TIME);
        return format.format(date);
    }

    private static String selectedDayLabel(Context context, int appWidgetId) {
        Date date = selectedDay(context, appWidgetId);
        Calendar today = Calendar.getInstance(BEIJING_TIME, Locale.CHINA);
        Calendar selected = Calendar.getInstance(BEIJING_TIME, Locale.CHINA);
        selected.setTime(date);
        String suffix = "";
        int offset = getSelectedDayOffset(context, appWidgetId);
        if (offset == 0) {
            suffix = " 今日";
        } else if (offset == -1) {
            suffix = " 昨日";
        } else if (offset == 1) {
            suffix = " 明日";
        } else if (today.get(Calendar.YEAR) != selected.get(Calendar.YEAR)) {
            suffix = " " + selected.get(Calendar.YEAR);
        }
        return dayLabel(date) + suffix;
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
        game.id = event.optString("id", "");
        game.start = start;
        game.awayLogo = secureImageUrl(event.optString("awayLogo", ""));
        game.homeLogo = secureImageUrl(event.optString("homeLogo", ""));
        game.leagueLabel = event.optString("leagueName", event.optString("league", "比赛"));
        game.sourceId = event.optString("sourceId", "");
        game.sport = event.optString("sport", "");
        game.espnLeague = event.optString("espnLeague", "");
        game.dataSource = event.optString("dataSource", "espn");
        game.providerLeagueId = event.optString("providerLeagueId", "");
        game.providerYear = event.optString("providerYear", "");
        game.providerDate = event.optString("providerDate", "");
        game.awayScore = scoreJsonValue(event.opt("awayScore"));
        game.homeScore = scoreJsonValue(event.opt("homeScore"));
        game.awayTeam = event.optString("awayTeam", "");
        game.homeTeam = event.optString("homeTeam", "");
        game.venue = event.optString("venue", "");
        game.city = event.optString("city", "");
        game.importedTeamName = event.optString("importedTeamName", "");
        game.completed = event.optBoolean("completed", false);
        game.status = event.optString("status", "");
        game.statusState = event.optString("statusState", "");
        return game;
    }

    static void renderGame(Context context, RemoteViews views, Game game) {
        renderVisibleRow(views);
        views.setTextViewText(R.id.start, startTimeLabel(game));
        views.setTextViewText(R.id.time, primaryLabel(game));
        views.setTextColor(R.id.time, isLive(game) ? SCORE_LIVE_COLOR : SCORE_DEFAULT_COLOR);
        views.setTextViewText(R.id.type, secondaryLabel(game));
        if (isHomeFirst(game)) {
            setLogo(context, views, R.id.away_logo, game.homeLogo);
            setLogo(context, views, R.id.home_logo, game.awayLogo);
        } else {
            setLogo(context, views, R.id.away_logo, game.awayLogo);
            setLogo(context, views, R.id.home_logo, game.homeLogo);
        }
    }

    private static void renderVisibleRow(RemoteViews views) {
        views.setInt(R.id.game_row, "setBackgroundResource", R.drawable.widget_row_background);
        views.setViewVisibility(R.id.away_logo, View.VISIBLE);
        views.setViewVisibility(R.id.home_logo, View.VISIBLE);
    }

    static void renderDetailGame(Context context, RemoteViews views, Game game) {
        Matchup matchup = matchup(game);
        views.setTextViewText(R.id.detail_start, startTimeLabel(game));
        views.setTextViewText(R.id.detail_score, primaryLabel(game));
        views.setTextColor(R.id.detail_score, isLive(game) ? SCORE_LIVE_COLOR : SCORE_DEFAULT_COLOR);
        views.setTextViewText(R.id.detail_status, statusLabel(game));
        views.setTextViewText(R.id.detail_league, game.leagueLabel == null ? "比赛" : game.leagueLabel);
        views.setTextViewText(R.id.detail_left_team, teamLabel(matchup.leftName, matchup.leftSlot));
        views.setTextViewText(R.id.detail_right_team, teamLabel(matchup.rightName, matchup.rightSlot));
        String venue = detailVenueLabel(game);
        views.setTextViewText(R.id.detail_venue, venue);
        views.setViewVisibility(R.id.detail_venue, venue.isEmpty() ? View.GONE : View.VISIBLE);
        setLogo(context, views, R.id.detail_left_logo, matchup.leftLogo);
        setLogo(context, views, R.id.detail_right_logo, matchup.rightLogo);
    }

    private static Matchup matchup(Game game) {
        if (isHomeFirst(game)) {
            return new Matchup(
                game.homeLogo,
                game.awayLogo,
                game.homeTeam,
                game.awayTeam,
                "主队",
                "客队"
            );
        }
        return new Matchup(
            game.awayLogo,
            game.homeLogo,
            game.awayTeam,
            game.homeTeam,
            "客队",
            "主队"
        );
    }

    private static String teamLabel(String value, String fallback) {
        String cleaned = cleanJsonValue(value);
        return cleaned.isEmpty() ? fallback : cleaned;
    }

    private static String detailVenueLabel(Game game) {
        String venue = cleanJsonValue(game.venue);
        String city = cleanJsonValue(game.city);
        if (venue.isEmpty()) {
            return city;
        }
        if (city.isEmpty() || venue.contains(city)) {
            return venue;
        }
        return city + " · " + venue;
    }

    private static void setLogo(Context context, RemoteViews views, int viewId, String logoUrl) {
        views.setViewVisibility(viewId, View.VISIBLE);
        Bitmap bitmap = loadCachedBitmap(context, logoUrl);
        if (bitmap == null) {
            views.setImageViewResource(viewId, R.drawable.ic_team_placeholder);
        } else {
            views.setImageViewBitmap(viewId, bitmap);
        }
    }

    private static Map<String, JSONObject> readLiveSnapshot(Context context, String dayKey) {
        Map<String, JSONObject> byKey = new HashMap<>();
        try {
            String raw = context
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(PREFS_LIVE_SNAPSHOT, "{}");
            JSONObject root = new JSONObject(raw);
            if (!dayKey.equals(root.optString("day", ""))) {
                return byKey;
            }
            JSONArray games = root.optJSONArray("games");
            if (games == null) return byKey;
            for (int index = 0; index < games.length(); index += 1) {
                JSONObject game = games.optJSONObject(index);
                if (game != null) byKey.put(game.optString("key", ""), game);
            }
        } catch (Exception ignored) {
            // Ignore a damaged snapshot and use the imported schedule.
        }
        return byKey;
    }

    private static void applyCachedGame(Game game, JSONObject cached) {
        if (cached == null) return;
        game.awayScore = cached.optString("awayScore", game.awayScore);
        game.homeScore = cached.optString("homeScore", game.homeScore);
        game.status = cached.optString("status", game.status);
        game.statusState = cached.optString("statusState", game.statusState);
        game.completed = cached.optBoolean("completed", game.completed);
        game.awayLogo = secureImageUrl(cached.optString("awayLogo", game.awayLogo));
        game.homeLogo = secureImageUrl(cached.optString("homeLogo", game.homeLogo));
    }

    private static void cacheLiveSnapshot(Context context, String dayKey, List<Game> games) {
        try {
            JSONArray rows = new JSONArray();
            for (Game game : games) {
                JSONObject row = new JSONObject();
                row.put("key", game.key());
                row.put("awayScore", game.awayScore);
                row.put("homeScore", game.homeScore);
                row.put("status", game.status);
                row.put("statusState", game.statusState);
                row.put("completed", game.completed);
                row.put("awayLogo", game.awayLogo);
                row.put("homeLogo", game.homeLogo);
                rows.put(row);
            }
            JSONObject root = new JSONObject();
            root.put("day", dayKey);
            root.put("fetchedAt", System.currentTimeMillis());
            root.put("games", rows);
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREFS_LIVE_SNAPSHOT, root.toString())
                .apply();
        } catch (Exception ignored) {
            // The in-memory result remains usable when persistence fails.
        }
    }

    private static boolean prefetchLogos(Context context, List<Game> games) {
        pruneLogoCache(context);
        Set<String> urls = new HashSet<>();
        for (Game game : games) {
            if (game.awayLogo != null && !game.awayLogo.isEmpty()) urls.add(game.awayLogo);
            if (game.homeLogo != null && !game.homeLogo.isEmpty()) urls.add(game.homeLogo);
        }
        boolean changed = false;
        for (String url : urls) {
            File file = logoCacheFile(context, url);
            if (file.exists()) continue;
            Bitmap bitmap = WidgetNetworkClient.downloadLogo(context, url);
            if (bitmap == null) continue;
            File temporary = new File(file.getAbsolutePath() + ".tmp");
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                if (bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                    changed |= temporary.renameTo(file);
                }
            } catch (Exception ignored) {
                // A placeholder remains visible until a later refresh succeeds.
            } finally {
                if (temporary.exists()) temporary.delete();
            }
        }
        return changed;
    }

    private static void pruneLogoCache(Context context) {
        File directory = new File(context.getCacheDir(), "widget_logos");
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".png"));
        if (files == null || files.length <= 256) return;
        Arrays.sort(files, (left, right) -> Long.compare(left.lastModified(), right.lastModified()));
        for (int index = 0; index < files.length - 256; index += 1) files[index].delete();
    }

    static boolean hydrateLiveScores(List<Game> games) {
        RefreshTracker tracker = new RefreshTracker();
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
            tracker.attempt();
            try {
                String[] parts = entry.getKey().split("\\|");
                String endpoint = "https://site.api.espn.com/apis/site/v2/sports/"
                    + parts[0] + "/" + parts[1]
                    + "/scoreboard?dates=" + parts[2] + "&limit=300";
                Map<String, JSONObject> liveEvents = fetchEventsById(endpoint);
                tracker.succeed();
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
        hydrateSportsDbScores(games, tracker);
        hydrateCslEspnScores(games, tracker);
        hydrateCflScores(games, tracker);
        hydrateCfaScores(games, tracker);
        return tracker.isSuccessful();
    }

    private static void hydrateCslEspnScores(List<Game> games, RefreshTracker tracker) {
        Map<String, List<Game>> groups = new HashMap<>();
        for (Game game : games) {
            if (!isCslGame(game)) continue;
            String date = espnDate(game.start);
            if (!groups.containsKey(date)) groups.put(date, new ArrayList<>());
            groups.get(date).add(game);
        }
        for (Map.Entry<String, List<Game>> entry : groups.entrySet()) {
            tracker.attempt();
            try {
                String endpoint = "https://site.api.espn.com/apis/site/v2/sports/soccer/chn.1/scoreboard"
                    + "?dates=" + entry.getKey() + "&limit=100";
                JSONObject root = new JSONObject(WidgetNetworkClient.getJson(endpoint));
                tracker.succeed();
                JSONArray events = root.optJSONArray("events");
                if (events == null) continue;
                for (Game game : entry.getValue()) {
                    JSONObject match = findCslMatch(game, events);
                    if (match != null) applyLiveEvent(game, match);
                }
            } catch (Exception ignored) {
                // Keep the saved score when ESPN is temporarily unavailable.
            }
        }
    }

    private static JSONObject findCslMatch(Game game, JSONArray events) {
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            JSONObject competition = event == null ? null : firstObject(event.optJSONArray("competitions"));
            JSONArray competitors = competition == null ? null : competition.optJSONArray("competitors");
            JSONObject away = findCompetitor(competitors, "away");
            JSONObject home = findCompetitor(competitors, "home");
            if (sameCslTeam(game.homeTeam, competitorTeamName(home))
                && sameCslTeam(game.awayTeam, competitorTeamName(away))) {
                return event;
            }
        }
        return null;
    }

    private static String competitorTeamName(JSONObject competitor) {
        JSONObject team = competitor == null ? null : competitor.optJSONObject("team");
        if (team == null) return "";
        return team.optString("displayName", team.optString("name", team.optString("shortDisplayName", "")));
    }

    private static boolean isCslGame(Game game) {
        return "chn.1".equalsIgnoreCase(cleanJsonValue(game.espnLeague))
            || "CSL".equalsIgnoreCase(cleanJsonValue(game.providerLeagueId))
            || cleanJsonValue(game.leagueLabel).contains("中超");
    }

    static boolean sameCslTeam(String left, String right) {
        String leftKey = cslTeamKey(left);
        String rightKey = cslTeamKey(right);
        return !leftKey.isEmpty() && leftKey.equals(rightKey);
    }

    static String cslTeamKey(String value) {
        String text = cleanJsonValue(value).toLowerCase(Locale.US).replaceAll("[^a-z0-9\\u4e00-\\u9fff]", "");
        String[][] aliases = {
            {"北京国安", "beijingguoan"}, {"成都蓉城", "chengdurongcheng"},
            {"重庆铜梁龙", "chongqingtonglianglong"}, {"大连英博", "dalianyingbo"},
            {"河南队", "河南", "henan"}, {"辽宁铁人", "liaoningtieren"},
            {"青岛海牛", "qingdaohainiu"}, {"青岛西海岸", "qingdaowestcoast"},
            {"山东泰山", "shandongtaishan"}, {"上海海港", "shanghaiport", "shanghaisipg"},
            {"上海申花", "shanghaishenhua"}, {"深圳新鹏城", "shenzhenxinpengcheng"},
            {"天津津门虎", "tianjinjinmentiger", "tianjinteda"}, {"武汉三镇", "wuhanthreetowns"},
            {"云南玉昆", "yunnanyukun"}, {"浙江队", "浙江", "zhejiangprofessionalfc", "zhejiang"}
        };
        for (String[] group : aliases) {
            for (String alias : group) {
                if (text.equals(alias)) return group[0];
            }
        }
        return text;
    }

    private static void hydrateSportsDbScores(List<Game> games, RefreshTracker tracker) {
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
            tracker.attempt();
            try {
                String[] parts = entry.getKey().split("\\|");
                String endpoint = "https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d="
                    + parts[1] + "&l=" + parts[0];
                JSONObject root = new JSONObject(WidgetNetworkClient.getJson(endpoint));
                tracker.succeed();
                JSONArray events = root.optJSONArray("events");
                Map<String, JSONObject> byId = jsonArrayById(events, "idEvent");
                for (Game game : entry.getValue()) {
                    JSONObject event = byId.get(game.sourceId);
                    if (event == null) {
                        continue;
                    }
                    game.homeScore = scoreJsonValue(event.opt("intHomeScore"), game.homeScore);
                    game.awayScore = scoreJsonValue(event.opt("intAwayScore"), game.awayScore);
                    String status = combineStatusText(
                        event.optString("strStatus", ""),
                        event.optString("strProgress", "")
                    );
                    if (status.isEmpty()) {
                        status = game.status;
                    }
                    game.status = status;
                    game.completed = isFinishedStatusText(status);
                    game.statusState = game.completed ? "post" : (isLiveStatusText(status) ? "in" : "pre");
                    String awayLogo = event.optString("strAwayTeamBadge", "");
                    String homeLogo = event.optString("strHomeTeamBadge", "");
                    if (!awayLogo.isEmpty()) game.awayLogo = secureImageUrl(awayLogo);
                    if (!homeLogo.isEmpty()) game.homeLogo = secureImageUrl(homeLogo);
                }
            } catch (Exception ignored) {
                // Keep the imported snapshot if this provider is unavailable.
            }
        }
    }

    private static void hydrateCflScores(List<Game> games, RefreshTracker tracker) {
        Map<String, List<Game>> groups = new HashMap<>();
        for (Game game : games) {
            if (!"cfl".equals(game.dataSource)
                || isCslGame(game)
                || game.sourceId == null || game.sourceId.isEmpty()
                || game.providerLeagueId == null || game.providerLeagueId.isEmpty()
                || game.providerYear == null || game.providerYear.isEmpty()) {
                continue;
            }
            String key = game.providerLeagueId + "|" + game.providerYear;
            if (!groups.containsKey(key)) {
                groups.put(key, new ArrayList<>());
            }
            groups.get(key).add(game);
        }

        for (Map.Entry<String, List<Game>> entry : groups.entrySet()) {
            tracker.attempt();
            try {
                String[] parts = entry.getKey().split("\\|");
                String endpoint = "https://api.cfl-china.cn/frontweb/api/matches/page"
                    + "?tournament_calendar_id=" + parts[1]
                    + "&competition_code=" + parts[0]
                    + "&curPage=1&pageSize=999";
                JSONObject root = new JSONObject(WidgetNetworkClient.getJson(endpoint));
                tracker.succeed();
                JSONObject data = root.optJSONObject("data");
                JSONArray events = data == null ? null : data.optJSONArray("dataList");
                Map<String, JSONObject> byId = jsonArrayById(events, "id");
                for (Game game : entry.getValue()) {
                    JSONObject event = byId.get(game.sourceId);
                    if (event == null) {
                        continue;
                    }
                    game.homeScore = cflScoreValue(event, "home", game.homeScore);
                    game.awayScore = cflScoreValue(event, "away", game.awayScore);
                    String status = event.optString("match_status", game.status);
                    game.status = status;
                    game.completed = isFinishedStatusText(status);
                    game.statusState = game.completed ? "post" : (isLiveStatusText(status) ? "in" : "pre");
                    String awayLogo = event.optString("away_contestant_icon", "");
                    String homeLogo = event.optString("home_contestant_icon", "");
                    if (!awayLogo.isEmpty()) game.awayLogo = secureImageUrl(awayLogo);
                    if (!homeLogo.isEmpty()) game.homeLogo = secureImageUrl(homeLogo);
                }
            } catch (Exception ignored) {
                // Keep the imported snapshot if this provider is unavailable.
            }
        }
    }

    private static String cflScoreValue(JSONObject event, String side, String fallback) {
        String[] fields = {
            "total_" + side + "_score",
            "ft_" + side + "_score",
            "ht_" + side + "_score"
        };
        for (String field : fields) {
            String value = scoreJsonValue(event.opt(field));
            if (!value.isEmpty()) {
                return value;
            }
        }
        return fallback;
    }

    private static void hydrateCfaScores(List<Game> games, RefreshTracker tracker) {
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
            tracker.attempt();
            try {
                String[] parts = entry.getKey().split("\\|");
                String endpoint = "https://data.thecfa.cn/gameplans.do?lid="
                    + parts[0] + "&year=" + parts[1];
                JSONArray events = new JSONArray(WidgetNetworkClient.getJson(endpoint));
                tracker.succeed();
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
                    }
                    String providerStatus = combineStatusText(
                        event.optString("status", ""),
                        event.optString("gamestatus", ""),
                        event.optString("game_status", ""),
                        event.optString("matchstatus", ""),
                        event.optString("match_status", ""),
                        event.optString("state", "")
                    );
                    applyCfaStatus(game, providerStatus, !score.isEmpty());
                }
            } catch (Exception ignored) {
                // Keep the imported snapshot if this provider is unavailable.
            }
        }
    }

    static void applyCfaStatus(Game game, String providerStatus, boolean hasScore) {
        GameStatus.Kind kind = GameStatus.classify(providerStatus, "", false);
        if (kind == GameStatus.Kind.FINISHED) {
            game.status = providerStatus.isEmpty() ? "已结束" : providerStatus;
            game.statusState = "post";
            game.completed = true;
            return;
        }
        if (kind == GameStatus.Kind.LIVE) {
            game.status = providerStatus.isEmpty() ? "进行中" : providerStatus;
            game.statusState = "in";
            game.completed = false;
            return;
        }
        if (kind == GameStatus.Kind.POSTPONED || kind == GameStatus.Kind.CANCELED) {
            game.status = providerStatus;
            game.statusState = "pre";
            game.completed = false;
            return;
        }
        long elapsed = game.start == null ? Long.MIN_VALUE : System.currentTimeMillis() - game.start.getTime();
        if (elapsed >= TimeUnit.HOURS.toMillis(4) && hasScore) {
            game.status = "已结束";
            game.statusState = "post";
            game.completed = true;
        } else if (elapsed >= -TimeUnit.MINUTES.toMillis(5) && elapsed < TimeUnit.HOURS.toMillis(4)) {
            game.status = "进行中";
            game.statusState = "in";
            game.completed = false;
        } else {
            game.status = "未开始";
            game.statusState = "pre";
            game.completed = false;
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
        if (value == null) return "";
        String text = value.trim();
        return text.isEmpty()
            || "null".equalsIgnoreCase(text)
            || "[object Object]".equalsIgnoreCase(text)
            ? ""
            : text;
    }

    static String scoreJsonValue(Object raw) {
        return scoreJsonValue(raw, "");
    }

    private static String scoreJsonValue(Object raw, String fallback) {
        if (raw == null || raw == JSONObject.NULL) return cleanJsonValue(fallback);
        if (raw instanceof Number) return String.valueOf(raw);
        if (raw instanceof JSONObject) {
            JSONObject object = (JSONObject) raw;
            for (String key : Arrays.asList("displayValue", "value", "score", "total", "points")) {
                if (!object.has(key)) continue;
                String value = scoreJsonValue(object.opt(key), "");
                if (!value.isEmpty()) return value;
            }
            return cleanJsonValue(fallback);
        }
        String text = cleanJsonValue(String.valueOf(raw));
        if (text.startsWith("{") && text.endsWith("}")) {
            try {
                return scoreJsonValue(new JSONObject(text), fallback);
            } catch (Exception ignored) {
                return cleanJsonValue(fallback);
            }
        }
        if (text.startsWith("[") && text.endsWith("]")) return cleanJsonValue(fallback);
        return text.isEmpty() ? cleanJsonValue(fallback) : text;
    }

    private static String combineStatusText(String... values) {
        List<String> parts = new ArrayList<>();
        for (String value : values) {
            String cleaned = cleanJsonValue(value);
            if (!cleaned.isEmpty() && !parts.contains(cleaned)) {
                parts.add(cleaned);
            }
        }
        return String.join(" ", parts);
    }

    private static Map<String, JSONObject> fetchEventsById(String endpoint) throws Exception {
        JSONObject root = new JSONObject(WidgetNetworkClient.getJson(endpoint));
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
            game.awayScore = scoreJsonValue(away.opt("score"), game.awayScore);
            JSONObject team = away.optJSONObject("team");
            String logo = teamLogo(team);
            if (!logo.isEmpty()) {
                game.awayLogo = logo;
            }
        }
        if (home != null) {
            game.homeScore = scoreJsonValue(home.opt("score"), game.homeScore);
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
            return secureImageUrl(logo);
        }
        JSONArray logos = team.optJSONArray("logos");
        JSONObject firstLogo = firstObject(logos);
        return firstLogo == null ? "" : secureImageUrl(firstLogo.optString("href", ""));
    }

    private static String secureImageUrl(String value) {
        if (value == null) return "";
        String source = value.trim();
        if (source.startsWith("//")) return "https:" + source;
        if (source.startsWith("http://")) return "https://" + source.substring(7);
        return source.startsWith("https://") ? source : "";
    }

    private static String espnDate(Date date) {
        SimpleDateFormat format = new SimpleDateFormat("yyyyMMdd", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("America/New_York"));
        return format.format(date);
    }

    private static String primaryLabel(Game game) {
        if (isHomeFirst(game)) {
            return scoreValue(game.homeScore) + " - " + scoreValue(game.awayScore);
        }
        return scoreValue(game.awayScore) + " - " + scoreValue(game.homeScore);
    }

    private static String secondaryLabel(Game game) {
        return statusLabel(game) + " · " + game.leagueLabel;
    }

    static String statusLabel(Game game) {
        String baseballLabel = baseballInfoLabel(game);
        if (!baseballLabel.isEmpty()) {
            return baseballLabel;
        }
        GameStatus.Kind kind = GameStatus.classify(game.status, game.statusState, game.completed);
        if (kind == GameStatus.Kind.POSTPONED) return "已延期";
        if (kind == GameStatus.Kind.CANCELED) return "已取消";
        if (isLive(game)) {
            return "进行中";
        }
        if (isFinished(game)) {
            return "已结束";
        }
        return timeLabel(game);
    }

    private static String timeLabel(Game game) {
        SimpleDateFormat format = new SimpleDateFormat("HH:mm", Locale.CHINA);
        format.setTimeZone(BEIJING_TIME);
        return format.format(game.start);
    }

    private static String baseballInfoLabel(Game game) {
        if (!isBaseball(game)) return "";
        String status = game.status == null ? "" : game.status.trim();
        String normalized = status.toLowerCase(Locale.US);
        Matcher matcher = Pattern
            .compile("\\b(top|bot|bottom|mid|middle|end)\\s+(\\d+)(?:st|nd|rd|th)?\\b", Pattern.CASE_INSENSITIVE)
            .matcher(status);
        if (matcher.find()) {
            String phase = matcher.group(1).toLowerCase(Locale.US);
            String inning = matcher.group(2);
            if (phase.equals("top")) return inning + "局上";
            if (phase.equals("bot") || phase.equals("bottom")) return inning + "局下";
            if (phase.equals("mid") || phase.equals("middle")) return inning + "局中";
            if (phase.equals("end")) return inning + "局末";
        }
        if (normalized.contains("delay") || normalized.contains("delayed") || normalized.contains("postponed")) {
            return "延迟";
        }
        if (normalized.contains("suspend")) {
            return "暂停";
        }
        if (normalized.contains("rain")) {
            return "雨停";
        }
        return "";
    }

    private static String todayLabel() {
        return dayLabel(new Date());
    }

    private static String dayLabel(Date date) {
        SimpleDateFormat format = new SimpleDateFormat("M/d", Locale.CHINA);
        format.setTimeZone(BEIJING_TIME);
        return format.format(date).replace("/", "\u6708") + "\u65E5";
    }

    private static String startTimeLabel(Game game) {
        SimpleDateFormat format = new SimpleDateFormat("HH:mm", Locale.CHINA);
        format.setTimeZone(BEIJING_TIME);
        return format.format(game.start);
    }

    static boolean isLive(Game game) {
        return GameStatus.isLive(game.status, game.statusState, game.completed, game.start);
    }

    static boolean isFinished(Game game) {
        return GameStatus.isFinished(game.status, game.statusState, game.completed);
    }

    private static boolean isHomeFirst(Game game) {
        return "soccer".equalsIgnoreCase(game.sport);
    }

    private static boolean isBaseball(Game game) {
        return "baseball".equalsIgnoreCase(game.sport)
            || "mlb".equalsIgnoreCase(game.espnLeague)
            || "MLB".equalsIgnoreCase(game.leagueLabel);
    }

    private static String scoreValue(String value) {
        String cleaned = cleanJsonValue(value);
        return cleaned.isEmpty() ? "0" : cleaned;
    }

    private static boolean isLiveStatusText(String value) {
        return GameStatus.isLiveText(value);
    }

    private static boolean isFinishedStatusText(String value) {
        return GameStatus.isFinishedText(value);
    }

    private static boolean isBeijingToday(Date date) {
        return isSameBeijingDay(date, new Date());
    }

    private static boolean isSameBeijingDay(Date leftDate, Date rightDate) {
        Calendar now = Calendar.getInstance(BEIJING_TIME, Locale.CHINA);
        Calendar target = Calendar.getInstance(BEIJING_TIME, Locale.CHINA);
        now.setTime(rightDate);
        target.setTime(leftDate);
        return now.get(Calendar.YEAR) == target.get(Calendar.YEAR)
            && now.get(Calendar.DAY_OF_YEAR) == target.get(Calendar.DAY_OF_YEAR);
    }

    private static Date parseDate(String value) {
        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mmXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"
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
        return null;
    }

    private static Bitmap loadCachedBitmap(Context context, String imageUrl) {
        if (imageUrl == null || imageUrl.isEmpty()) return null;
        File file = logoCacheFile(context, imageUrl);
        if (!file.exists()) return null;
        file.setLastModified(System.currentTimeMillis());
        return BitmapFactory.decodeFile(file.getAbsolutePath());
    }

    private static File logoCacheFile(Context context, String imageUrl) {
        File directory = new File(context.getCacheDir(), "widget_logos");
        if (!directory.exists()) directory.mkdirs();
        return new File(directory, sha256(imageUrl) + ".png");
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte part : digest) result.append(String.format(Locale.US, "%02x", part));
            return result.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private static class DisplayCache {
        final String dayKey;
        final List<Game> games;

        DisplayCache(String dayKey, List<Game> games) {
            this.dayKey = dayKey;
            this.games = new ArrayList<>(games);
        }
    }

    private static class RefreshTracker {
        int attempted;
        int succeeded;

        void attempt() {
            attempted += 1;
        }

        void succeed() {
            succeeded += 1;
        }

        boolean isSuccessful() {
            return attempted == 0 || succeeded > 0;
        }
    }

    static class Game {
        String id;
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
        String awayTeam;
        String homeTeam;
        String venue;
        String city;
        String importedTeamName;
        String leagueLabel;
        String status;
        String statusState;
        boolean completed;

        String key() {
            if (id != null && !id.isEmpty()) return id;
            return (sourceId == null ? "" : sourceId) + "|" + start.getTime();
        }

        long stableId() {
            return key().hashCode();
        }
    }

    private static class Matchup {
        final String leftLogo;
        final String rightLogo;
        final String leftName;
        final String rightName;
        final String leftSlot;
        final String rightSlot;

        Matchup(
            String leftLogo,
            String rightLogo,
            String leftName,
            String rightName,
            String leftSlot,
            String rightSlot
        ) {
            this.leftLogo = leftLogo;
            this.rightLogo = rightLogo;
            this.leftName = leftName;
            this.rightName = rightName;
            this.leftSlot = leftSlot;
            this.rightSlot = rightSlot;
        }
    }
}
