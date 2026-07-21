package com.local.sportscalendar;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

final class TeamNewsPushManager {
    static final String TOPIC = "toronto_blue_jays_news_en";
    static final String CHANNEL_ID = "team_news";
    static final String EXTRA_NEWS_URL = "newsUrl";
    static final String EXTRA_NEWS_ID = "newsId";
    private static final String PREFS_NAME = "team_news_push";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_FEED_IDS = "feed_ids";
    private static final String KEY_NOTIFIED_IDS = "notified_ids";
    private static final String KEY_LAST_CHECK_AT = "last_check_at";
    private static final String KEY_LAST_NOTIFICATION_AT = "last_notification_at";
    private static final String KEY_LAST_ERROR = "last_error";
    private static final String WORK_NAME = "team-news-background-check";
    private static final String IMMEDIATE_WORK_NAME = "team-news-immediate-check";
    private static final String PRIMARY_NEWS_ENDPOINT = "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/blue-jays.json";
    private static final long ENGLISH_FALLBACK_DELAY_MS = TimeUnit.HOURS.toMillis(1);

    private static final class NotificationCopy {
        final String title;
        final String summary;

        NotificationCopy(String title, String summary) {
            this.title = title;
            this.summary = summary;
        }
    }

    private TeamNewsPushManager() {
    }

    static boolean isConfigured(Context context) {
        try {
            return FirebaseApp.initializeApp(context) != null || !FirebaseApp.getApps(context).isEmpty();
        } catch (RuntimeException error) {
            return false;
        }
    }

    static boolean isEnabled(Context context) {
        return preferences(context).getBoolean(KEY_ENABLED, false);
    }

    static void rememberEnabled(Context context, boolean enabled) {
        preferences(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    static void restoreSubscription(Context context) {
        if (!isEnabled(context)) return;
        scheduleBackgroundChecks(context);
        enqueueImmediateCheck(context);
        if (isConfigured(context)) {
            try {
                FirebaseMessaging.getInstance().subscribeToTopic(TOPIC);
            } catch (RuntimeException ignored) {
                // The local WorkManager fallback remains active without Google services.
            }
        }
    }

    static void scheduleBackgroundChecks(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            TeamNewsRefreshWorker.class,
            15,
            TimeUnit.MINUTES
        ).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        );
    }

    static void cancelBackgroundChecks(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
        WorkManager.getInstance(context).cancelUniqueWork(IMMEDIATE_WORK_NAME);
    }

    static void enqueueImmediateCheck(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(TeamNewsRefreshWorker.class)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request
        );
    }

    static boolean pollAndNotify(Context context) {
        try {
            List<TeamNewsFeed.Item> items = TeamNewsFeed.parse(WidgetNetworkClient.getMlbNewsFeedXml());
            if (items.isEmpty()) throw new IllegalStateException("MLB RSS did not contain news");
            SharedPreferences prefs = preferences(context);
            String previousFeedIds = prefs.getString(KEY_FEED_IDS, "");
            if (previousFeedIds.isEmpty()) {
                prefs.edit()
                    .putLong(KEY_LAST_CHECK_AT, System.currentTimeMillis())
                    .putString(KEY_FEED_IDS, joinIds(TeamNewsFeed.ids(items)))
                    .remove(KEY_LAST_ERROR)
                    .apply();
                return true;
            }

            Set<String> previous = splitIds(previousFeedIds);
            List<TeamNewsFeed.Item> newItems = new ArrayList<>();
            for (TeamNewsFeed.Item item : items) {
                if (!previous.contains(item.id)) newItems.add(item);
            }
            Map<String, NotificationCopy> localizedCopies = newItems.isEmpty()
                ? Collections.emptyMap()
                : fetchNotificationCopies();
            long now = System.currentTimeMillis();
            for (TeamNewsFeed.Item item : newItems) {
                if (!localizedCopies.containsKey(item.id) && now - item.publishedAt < ENGLISH_FALLBACK_DELAY_MS) {
                    throw new IllegalStateException("等待中文新闻同步");
                }
            }
            prefs.edit()
                .putLong(KEY_LAST_CHECK_AT, now)
                .putString(KEY_FEED_IDS, joinIds(TeamNewsFeed.ids(items)))
                .remove(KEY_LAST_ERROR)
                .apply();
            Collections.reverse(newItems);
            int start = Math.max(0, newItems.size() - 3);
            for (TeamNewsFeed.Item item : newItems.subList(start, newItems.size())) {
                if (!rememberNotification(context, item.id)) continue;
                NotificationCopy copy = localizedCopies.get(item.id);
                NewsMessagingService.showNewsNotification(
                    context,
                    copy == null ? item.title : copy.title,
                    copy == null ? item.summary : copy.summary,
                    item.url,
                    item.id
                );
            }
            return true;
        } catch (Exception error) {
            preferences(context).edit()
                .putLong(KEY_LAST_CHECK_AT, System.currentTimeMillis())
                .putString(KEY_LAST_ERROR, boundedError(error))
                .apply();
            return false;
        }
    }

    private static Map<String, NotificationCopy> fetchNotificationCopies() throws Exception {
        JSONObject payload = new JSONObject(WidgetNetworkClient.getTeamNewsJson(PRIMARY_NEWS_ENDPOINT));
        JSONArray items = payload.optJSONArray("items");
        Map<String, NotificationCopy> copies = new HashMap<>();
        if (items == null) return copies;
        for (int index = 0; index < items.length(); index++) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) continue;
            String id = item.optString("id", "");
            if (!id.matches("[A-Za-z0-9_-]{1,160}")) continue;
            String title = boundedText(item.optString("titleZh", ""), 240);
            if (title.isEmpty()) title = boundedText(item.optString("titleEn", ""), 240);
            String summary = boundedText(item.optString("summaryZh", ""), 900);
            if (summary.isEmpty()) summary = firstParagraph(item.optJSONArray("bodyZh"));
            if (summary.isEmpty()) summary = boundedText(item.optString("summaryEn", ""), 900);
            if (summary.isEmpty()) summary = firstParagraph(item.optJSONArray("bodyEn"));
            if (summary.isEmpty()) summary = "多伦多蓝鸟发布了一篇新文章，点击查看详情。";
            if (!title.isEmpty()) copies.put(id, new NotificationCopy(title, summary));
        }
        return copies;
    }

    static synchronized boolean rememberNotification(Context context, String newsId) {
        if (newsId == null || !newsId.matches("[A-Za-z0-9_-]{1,160}")) return true;
        SharedPreferences prefs = preferences(context);
        List<String> ids = new ArrayList<>(splitIds(prefs.getString(KEY_NOTIFIED_IDS, "")));
        if (ids.contains(newsId)) return false;
        ids.add(0, newsId);
        if (ids.size() > 50) ids = new ArrayList<>(ids.subList(0, 50));
        prefs.edit()
            .putString(KEY_NOTIFIED_IDS, joinIds(ids))
            .putLong(KEY_LAST_NOTIFICATION_AT, System.currentTimeMillis())
            .apply();
        return true;
    }

    static long lastCheckAt(Context context) {
        return preferences(context).getLong(KEY_LAST_CHECK_AT, 0L);
    }

    static long lastNotificationAt(Context context) {
        return preferences(context).getLong(KEY_LAST_NOTIFICATION_AT, 0L);
    }

    static String lastError(Context context) {
        return preferences(context).getString(KEY_LAST_ERROR, "");
    }

    static String safeMlbUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return "";
        try {
            URI uri = new URI(rawUrl);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null) return "";
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            return normalizedHost.equals("mlb.com") || normalizedHost.endsWith(".mlb.com")
                ? uri.toASCIIString()
                : "";
        } catch (URISyntaxException error) {
            return "";
        }
    }

    static String toMlbAmpUrl(String rawUrl) {
        String safeUrl = safeMlbUrl(rawUrl);
        if (safeUrl.isEmpty()) return "";
        try {
            String path = new URI(safeUrl).getPath();
            if (path == null || path.contains("..")) return "";
            String[] parts = path.split("/");
            String slug = "";
            for (int index = parts.length - 1; index >= 0; index--) {
                if (!parts[index].isBlank()) {
                    slug = parts[index].replaceFirst("\\.html$", "");
                    break;
                }
            }
            if (!slug.matches("[A-Za-z0-9-]{1,180}")) return "";
            return "https://www.mlb.com/amp/news/" + slug + ".html";
        } catch (URISyntaxException error) {
            return "";
        }
    }

    static String safeNewsEndpoint(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return "";
        try {
            URI uri = new URI(rawUrl);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null) return "";
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            String path = uri.getPath() == null ? "" : uri.getPath();
            boolean rawGithub = normalizedHost.equals("raw.githubusercontent.com")
                && path.equals("/Levine-Lai/calendar-app/main/public/news/blue-jays.json");
            boolean jsDelivr = normalizedHost.equals("cdn.jsdelivr.net")
                && path.equals("/gh/Levine-Lai/calendar-app@main/public/news/blue-jays.json");
            return rawGithub || jsDelivr ? uri.toASCIIString() : "";
        } catch (URISyntaxException error) {
            return "";
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static Set<String> splitIds(String value) {
        Set<String> result = new LinkedHashSet<>();
        if (value == null || value.isEmpty()) return result;
        result.addAll(Arrays.asList(value.split(",")));
        result.remove("");
        return result;
    }

    private static String joinIds(List<String> ids) {
        return String.join(",", ids);
    }

    private static String boundedError(Exception error) {
        String message = error == null || error.getMessage() == null ? "新闻源暂时不可用" : error.getMessage();
        return message.substring(0, Math.min(message.length(), 120));
    }

    private static String boundedText(String value, int maxLength) {
        String normalized = String.valueOf(value == null ? "" : value).replaceAll("\\s+", " ").trim();
        return normalized.substring(0, Math.min(normalized.length(), maxLength));
    }

    private static String firstParagraph(JSONArray paragraphs) {
        if (paragraphs == null || paragraphs.length() == 0) return "";
        return boundedText(paragraphs.optString(0, ""), 500);
    }
}
