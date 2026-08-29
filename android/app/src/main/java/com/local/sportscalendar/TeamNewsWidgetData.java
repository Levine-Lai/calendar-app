package com.local.sportscalendar;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

final class TeamNewsWidgetData {
    private static final String PREFS_NAME = "team_news_widget";
    private static final String KEY_ITEMS_JSON = "items_json";
    private static final String KEY_ID = "id";
    private static final String KEY_TITLE = "title";
    private static final String KEY_URL = "url";
    private static final String KEY_IMAGE_URL = "image_url";
    private static final String KEY_PUBLISHED_AT = "published_at";
    private static final String LEGACY_IMAGE_FILE_NAME = "team-news-widget-image.jpg";
    private static final String IMAGE_FILE_PREFIX = "team-news-widget-";
    private static final int MAX_ITEMS = 1;
    private static final String[] ENDPOINTS = {
        "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/blue-jays.json",
        "https://cdn.jsdelivr.net/gh/Levine-Lai/calendar-app@main/public/news/blue-jays.json"
    };

    static final class Item {
        final String id;
        final String title;
        final String url;
        final String imageUrl;
        final long publishedAt;

        Item(String id, String title, String url, String imageUrl, long publishedAt) {
            this.id = id;
            this.title = title;
            this.url = url;
            this.imageUrl = imageUrl;
            this.publishedAt = publishedAt;
        }
    }

    private TeamNewsWidgetData() {
    }

    static List<Item> load(Context context) {
        List<Item> items = parseStoredItems(preferences(context).getString(KEY_ITEMS_JSON, ""));
        if (!items.isEmpty()) return items;

        Item legacy = legacyItem(context);
        List<Item> fallback = new ArrayList<>();
        if (legacy != null) fallback.add(legacy);
        return fallback;
    }

    static Bitmap loadImage(Context context, Item item) {
        File file = imageFile(context, item);
        if (!file.isFile() && isLegacyItem(context, item)) {
            file = new File(context.getFilesDir(), LEGACY_IMAGE_FILE_NAME);
        }
        return file.isFile() ? BitmapFactory.decodeFile(file.getAbsolutePath()) : null;
    }

    static List<Item> fetchRecent() throws Exception {
        List<Item> direct = new ArrayList<>();
        List<Item> freshestStatic = new ArrayList<>();
        Exception lastError = null;
        ExecutorService executor = Executors.newFixedThreadPool(ENDPOINTS.length + 1);
        List<Callable<List<Item>>> tasks = new ArrayList<>();
        tasks.add(() -> parseDirectRecent(WidgetNetworkClient.getMlbNewsFeedXml()));
        for (String endpoint : ENDPOINTS) {
            tasks.add(() -> parseRecent(WidgetNetworkClient.getTeamNewsJson(cacheBusted(endpoint))));
        }
        List<Future<List<Item>>> results;
        try {
            results = executor.invokeAll(tasks, 26, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
        for (int index = 0; index < results.size(); index += 1) {
            Future<List<Item>> result = results.get(index);
            try {
                if (result.isCancelled()) {
                    lastError = new IllegalStateException("新闻缓存请求超时");
                    continue;
                }
                List<Item> candidates = result.get();
                if (index == 0) {
                    direct = candidates;
                } else if (!candidates.isEmpty()
                    && (freshestStatic.isEmpty()
                        || candidates.get(0).publishedAt > freshestStatic.get(0).publishedAt)) {
                    freshestStatic = candidates;
                }
            } catch (Exception error) {
                lastError = error;
            }
        }
        if (!direct.isEmpty()) return mergeDirectWithStatic(direct, freshestStatic);
        if (!freshestStatic.isEmpty()) return freshestStatic;
        if (lastError != null) throw lastError;
        throw new IllegalStateException("新闻数据为空");
    }

    private static List<Item> parseDirectRecent(String xml) throws Exception {
        List<Item> items = new ArrayList<>();
        for (TeamNewsFeed.Item item : TeamNewsFeed.parse(xml)) {
            items.add(new Item(item.id, item.title, item.url, "", item.publishedAt));
        }
        return limitToLatest(items);
    }

    static List<Item> mergeDirectWithStatic(List<Item> direct, List<Item> staticItems) {
        List<Item> merged = new ArrayList<>();
        for (Item liveItem : limitToLatest(direct)) {
            String imageUrl = liveItem.imageUrl;
            for (Item staticItem : staticItems == null ? new ArrayList<Item>() : staticItems) {
                if (liveItem.url.equals(staticItem.url)) {
                    imageUrl = staticItem.imageUrl;
                    break;
                }
            }
            merged.add(new Item(
                liveItem.id,
                liveItem.title,
                liveItem.url,
                imageUrl,
                liveItem.publishedAt
            ));
        }
        return limitToLatest(merged);
    }

    static List<Item> loadBundledRecent(Context context) throws Exception {
        try (InputStream input = context.getAssets().open("public/public/news/blue-jays.json")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (output.size() + read > 1024 * 1024) {
                    throw new IllegalStateException("内置新闻数据过大");
                }
                output.write(buffer, 0, read);
            }
            List<Item> items = parseRecent(new String(output.toByteArray(), StandardCharsets.UTF_8));
            if (items.isEmpty()) throw new IllegalStateException("内置新闻数据为空");
            return items;
        }
    }

    static void save(Context context, List<Item> items, List<Bitmap> images) throws Exception {
        if (items == null || images == null || items.isEmpty() || items.size() != images.size()) {
            throw new IllegalArgumentException("新闻组件数据不完整");
        }
        JSONArray stored = new JSONArray();
        Set<String> activeFiles = new HashSet<>();
        for (int index = 0; index < items.size() && index < MAX_ITEMS; index++) {
            Item item = items.get(index);
            Bitmap image = images.get(index);
            if (image != null) {
                File target = imageFile(context, item);
                File temporary = new File(context.getFilesDir(), target.getName() + ".tmp");
                try (FileOutputStream output = new FileOutputStream(temporary)) {
                    if (!image.compress(Bitmap.CompressFormat.JPEG, 88, output)) {
                        throw new IllegalStateException("新闻图片缓存失败");
                    }
                    output.getFD().sync();
                }
                if (target.exists() && !target.delete()) throw new IllegalStateException("旧新闻图片无法替换");
                if (!temporary.renameTo(target)) throw new IllegalStateException("新闻图片缓存无法提交");
                activeFiles.add(target.getName());
            }

            JSONObject value = new JSONObject();
            value.put(KEY_ID, item.id);
            value.put(KEY_TITLE, item.title);
            value.put(KEY_URL, item.url);
            value.put(KEY_IMAGE_URL, item.imageUrl);
            value.put(KEY_PUBLISHED_AT, item.publishedAt);
            stored.put(value);
        }
        if (stored.length() == 0) throw new IllegalStateException("没有可缓存的新闻");
        preferences(context).edit().putString(KEY_ITEMS_JSON, stored.toString()).apply();
        cleanOldImages(context, activeFiles);
    }

    static String safeImageUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return "";
        try {
            URI uri = new URI(rawUrl);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null
                || !"img.mlbstatic.com".equalsIgnoreCase(host)
                || uri.getPath() == null || uri.getPath().contains("..")) {
                return "";
            }
            return uri.toASCIIString();
        } catch (Exception error) {
            return "";
        }
    }

    static List<Item> parseRecent(String rawJson) throws Exception {
        JSONObject payload = new JSONObject(String.valueOf(rawJson));
        JSONArray rawItems = payload.optJSONArray("items");
        List<Item> items = new ArrayList<>();
        if (rawItems == null) return items;
        Set<String> seenIds = new HashSet<>();
        for (int index = 0; index < rawItems.length(); index++) {
            Item item = parseItem(rawItems.optJSONObject(index));
            if (item != null && seenIds.add(item.id)) items.add(item);
        }
        return limitToLatest(items);
    }

    static List<Item> limitToLatest(List<Item> source) {
        List<Item> items = source == null ? new ArrayList<>() : new ArrayList<>(source);
        items.sort((left, right) -> Long.compare(right.publishedAt, left.publishedAt));
        return new ArrayList<>(items.subList(0, Math.min(items.size(), MAX_ITEMS)));
    }

    private static String cacheBusted(String endpoint) {
        String separator = endpoint.contains("?") ? "&" : "?";
        return endpoint + separator + "widget_refresh=" + (System.currentTimeMillis() / 60_000L);
    }

    private static List<Item> parseStoredItems(String rawJson) {
        List<Item> items = new ArrayList<>();
        if (rawJson == null || rawJson.isBlank()) return items;
        try {
            JSONArray stored = new JSONArray(rawJson);
            for (int index = 0; index < stored.length() && index < MAX_ITEMS; index++) {
                Item item = parseItem(stored.optJSONObject(index));
                if (item != null) items.add(item);
            }
        } catch (Exception ignored) {
            // A damaged widget cache is replaced by the next background refresh.
        }
        return items;
    }

    private static Item parseItem(JSONObject raw) {
        if (raw == null) return null;
        String id = bounded(raw.optString(KEY_ID, raw.optString("id", "")), 160);
        if (!id.matches("[A-Za-z0-9_-]{1,160}")) return null;
        String title = bounded(raw.optString(KEY_TITLE, ""), 240);
        if (title.isEmpty()) title = bounded(raw.optString("titleZh", ""), 240);
        if (title.isEmpty()) title = bounded(raw.optString("titleEn", ""), 240);
        String url = TeamNewsPushManager.safeMlbUrl(raw.optString(KEY_URL, raw.optString("url", "")));
        String imageUrl = safeImageUrl(raw.optString(KEY_IMAGE_URL, raw.optString("imageUrl", "")));
        long publishedAt = raw.optLong(KEY_PUBLISHED_AT, 0L);
        if (publishedAt <= 0L) publishedAt = parsePublishedAt(raw.optString("publishedAt", ""));
        if (title.isEmpty() || url.isEmpty() || publishedAt <= 0L) return null;
        return new Item(id, title, url, imageUrl, publishedAt);
    }

    static boolean sameContent(Item left, Item right) {
        return left != null && right != null
            && left.id.equals(right.id)
            && left.title.equals(right.title)
            && left.url.equals(right.url)
            && left.imageUrl.equals(right.imageUrl)
            && left.publishedAt == right.publishedAt;
    }

    static boolean hasCachedImage(Context context, Item item) {
        return item != null && (item.imageUrl.isEmpty() || imageFile(context, item).isFile());
    }

    private static Item legacyItem(Context context) {
        SharedPreferences prefs = preferences(context);
        Item item = new Item(
            bounded(prefs.getString(KEY_ID, ""), 160),
            bounded(prefs.getString(KEY_TITLE, ""), 240),
            TeamNewsPushManager.safeMlbUrl(prefs.getString(KEY_URL, "")),
            safeImageUrl(prefs.getString(KEY_IMAGE_URL, "")),
            prefs.getLong(KEY_PUBLISHED_AT, 0L)
        );
        File legacyImage = new File(context.getFilesDir(), LEGACY_IMAGE_FILE_NAME);
        return item.id.isEmpty() || item.title.isEmpty() || item.url.isEmpty()
            || item.imageUrl.isEmpty() || item.publishedAt <= 0L || !legacyImage.isFile()
            ? null
            : item;
    }

    private static boolean isLegacyItem(Context context, Item item) {
        return item != null && item.id.equals(preferences(context).getString(KEY_ID, ""));
    }

    private static void cleanOldImages(Context context, Set<String> activeFiles) {
        File[] files = context.getFilesDir().listFiles((directory, name) ->
            name.startsWith(IMAGE_FILE_PREFIX) && name.endsWith(".jpg")
        );
        if (files != null) {
            for (File file : files) {
                if (!activeFiles.contains(file.getName())) file.delete();
            }
        }
        File legacy = new File(context.getFilesDir(), LEGACY_IMAGE_FILE_NAME);
        if (legacy.isFile()) legacy.delete();
    }

    private static long parsePublishedAt(String value) {
        for (String pattern : new String[] {
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX"
        }) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                format.setLenient(false);
                Date parsed = format.parse(value);
                if (parsed != null) return parsed.getTime();
            } catch (Exception ignored) {
                // Try the next ISO-8601 representation.
            }
        }
        return 0L;
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static File imageFile(Context context, Item item) {
        return new File(context.getFilesDir(), IMAGE_FILE_PREFIX + item.id + ".jpg");
    }

    private static String bounded(String value, int maxLength) {
        String normalized = String.valueOf(value == null ? "" : value).replaceAll("\\s+", " ").trim();
        return normalized.substring(0, Math.min(normalized.length(), maxLength));
    }
}
