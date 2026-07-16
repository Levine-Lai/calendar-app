package com.local.sportscalendar;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

final class TeamNewsPushManager {
    static final String TOPIC = "toronto_blue_jays_news_en";
    static final String CHANNEL_ID = "team_news";
    static final String EXTRA_NEWS_URL = "newsUrl";
    static final String EXTRA_NEWS_ID = "newsId";
    private static final String PREFS_NAME = "team_news_push";
    private static final String KEY_ENABLED = "enabled";

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
        if (!isConfigured(context) || !isEnabled(context)) return;
        FirebaseMessaging.getInstance().subscribeToTopic(TOPIC);
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

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
