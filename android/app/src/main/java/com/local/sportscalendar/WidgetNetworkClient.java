package com.local.sportscalendar;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

final class WidgetNetworkClient {
    private static final int MAX_JSON_BYTES = 5 * 1024 * 1024;
    private static final int MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    private static final int MAX_IMAGE_PIXELS = 16_000_000;
    private static final int MAX_ARTICLE_BYTES = 768 * 1024;
    private static final int MAX_NEWS_BYTES = 1024 * 1024;
    private static final int MAX_NEWS_FEED_BYTES = 512 * 1024;
    private static final int JSON_ATTEMPTS = 3;

    private WidgetNetworkClient() {}

    static String getJson(String endpoint) throws Exception {
        Exception lastError = null;
        for (int attempt = 0; attempt < JSON_ATTEMPTS; attempt += 1) {
            try {
                return getJsonOnce(endpoint);
            } catch (Exception error) {
                lastError = error;
                if (attempt + 1 < JSON_ATTEMPTS) Thread.sleep(300L * (attempt + 1));
            }
        }
        throw lastError == null ? new IllegalStateException("JSON request failed") : lastError;
    }

    private static String getJsonOnce(String endpoint) throws Exception {
        HttpURLConnection connection = open(endpoint, 10_000, 10_000);
        connection.setRequestProperty("Accept", "application/json");
        try {
            int code = connection.getResponseCode();
            if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) {
                throw new IllegalStateException("HTTPS redirect required");
            }
            if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
            String contentType = connection.getContentType();
            if (contentType != null && !contentType.contains("json") && !contentType.contains("text")) {
                throw new IllegalStateException("Unexpected content type: " + contentType);
            }
            return new String(readLimited(connection.getInputStream(), MAX_JSON_BYTES), StandardCharsets.UTF_8);
        } finally {
            connection.disconnect();
        }
    }

    static String getMlbArticleHtml(String endpoint) throws Exception {
        HttpURLConnection connection = open(endpoint, 10_000, 15_000);
        connection.setRequestProperty("Accept", "text/html,application/xhtml+xml");
        try {
            int code = connection.getResponseCode();
            if (TeamNewsPushManager.safeMlbUrl(connection.getURL().toString()).isEmpty()) {
                throw new IllegalStateException("MLB HTTPS redirect required");
            }
            if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
            String contentType = connection.getContentType();
            if (contentType != null && !contentType.toLowerCase(Locale.ROOT).contains("html")) {
                throw new IllegalStateException("Unexpected content type: " + contentType);
            }
            return new String(readLimited(connection.getInputStream(), MAX_ARTICLE_BYTES), StandardCharsets.UTF_8);
        } finally {
            connection.disconnect();
        }
    }

    static String getTeamNewsJson(String endpoint) throws Exception {
        String safeEndpoint = TeamNewsPushManager.safeNewsEndpoint(endpoint);
        if (safeEndpoint.isEmpty()) throw new IllegalArgumentException("News endpoint is not allowed");
        HttpURLConnection connection = open(safeEndpoint, 6_000, 10_000);
        connection.setRequestProperty("Accept", "application/json,text/plain");
        connection.setRequestProperty("Cache-Control", "no-cache");
        try {
            int code = connection.getResponseCode();
            if (TeamNewsPushManager.safeNewsEndpoint(connection.getURL().toString()).isEmpty()) {
                throw new IllegalStateException("News HTTPS redirect is not allowed");
            }
            if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
            String contentType = connection.getContentType();
            if (contentType != null && !contentType.contains("json") && !contentType.contains("text")) {
                throw new IllegalStateException("Unexpected content type: " + contentType);
            }
            return new String(readLimited(connection.getInputStream(), MAX_NEWS_BYTES), StandardCharsets.UTF_8);
        } finally {
            connection.disconnect();
        }
    }

    static String getMlbNewsFeedXml() throws Exception {
        HttpURLConnection connection = open(TeamNewsFeed.RSS_URL, 12_000, 25_000);
        connection.setRequestProperty("Accept", "application/rss+xml,application/xml,text/xml");
        connection.setRequestProperty("Cache-Control", "no-cache");
        try {
            int code = connection.getResponseCode();
            if (!TeamNewsFeed.RSS_URL.equals(connection.getURL().toString())) {
                throw new IllegalStateException("MLB RSS HTTPS redirect is not allowed");
            }
            if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
            String contentType = connection.getContentType();
            if (contentType != null && !contentType.contains("xml") && !contentType.contains("text")) {
                throw new IllegalStateException("Unexpected content type: " + contentType);
            }
            return new String(readLimited(connection.getInputStream(), MAX_NEWS_FEED_BYTES), StandardCharsets.UTF_8);
        } finally {
            connection.disconnect();
        }
    }

    static Bitmap downloadLogo(Context context, String imageUrl) {
        if (imageUrl == null || imageUrl.isEmpty()) return null;
        HttpURLConnection connection = null;
        try {
            connection = open(imageUrl, 5_000, 5_000);
            int code = connection.getResponseCode();
            if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) return null;
            if (code < 200 || code >= 300) return null;
            byte[] bytes = readLimited(connection.getInputStream(), MAX_IMAGE_BYTES);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(new ByteArrayInputStream(bytes), null, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0
                || (long) bounds.outWidth * bounds.outHeight > MAX_IMAGE_PIXELS) return null;
            int target = Math.max(1, Math.round(36 * context.getResources().getDisplayMetrics().density));
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            while (bounds.outWidth / options.inSampleSize > target * 2
                || bounds.outHeight / options.inSampleSize > target * 2) {
                options.inSampleSize *= 2;
            }
            Bitmap bitmap = BitmapFactory.decodeStream(new ByteArrayInputStream(bytes), null, options);
            if (bitmap == null) return null;
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, target, target, true);
            if (scaled != bitmap) bitmap.recycle();
            return scaled;
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static Bitmap downloadNewsImage(String imageUrl) {
        String safeUrl = TeamNewsWidgetData.safeImageUrl(imageUrl);
        if (safeUrl.isEmpty()) return null;
        HttpURLConnection connection = null;
        try {
            connection = open(safeUrl, 10_000, 15_000);
            connection.setRequestProperty("Accept", "image/*");
            int code = connection.getResponseCode();
            if (TeamNewsWidgetData.safeImageUrl(connection.getURL().toString()).isEmpty()) return null;
            if (code < 200 || code >= 300) return null;
            String contentType = connection.getContentType();
            if (contentType != null && !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) return null;
            byte[] bytes = readLimited(connection.getInputStream(), MAX_IMAGE_BYTES);

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(new ByteArrayInputStream(bytes), null, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0
                || (long) bounds.outWidth * bounds.outHeight > MAX_IMAGE_PIXELS) return null;

            final int targetWidth = 480;
            final int targetHeight = 270;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            while (bounds.outWidth / (options.inSampleSize * 2) >= targetWidth
                && bounds.outHeight / (options.inSampleSize * 2) >= targetHeight) {
                options.inSampleSize *= 2;
            }
            Bitmap decoded = BitmapFactory.decodeStream(new ByteArrayInputStream(bytes), null, options);
            if (decoded == null) return null;

            float scale = Math.min(
                (float) targetWidth / decoded.getWidth(),
                (float) targetHeight / decoded.getHeight()
            );
            scale = Math.min(1f, scale);
            int scaledWidth = Math.max(1, Math.round(decoded.getWidth() * scale));
            int scaledHeight = Math.max(1, Math.round(decoded.getHeight() * scale));
            Bitmap scaled = Bitmap.createScaledBitmap(decoded, scaledWidth, scaledHeight, true);
            if (scaled != decoded) decoded.recycle();
            return scaled;
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static HttpURLConnection open(String endpoint, int connectTimeout, int readTimeout) throws Exception {
        URL url = new URL(endpoint);
        if (!"https".equalsIgnoreCase(url.getProtocol())) throw new IllegalArgumentException("HTTPS required");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(connectTimeout);
        connection.setReadTimeout(readTimeout);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "GuansaiRiji/2.3.3");
        return connection;
    }

    private static byte[] readLimited(InputStream source, int maxBytes) throws Exception {
        try (InputStream input = new BufferedInputStream(source);
             ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(maxBytes, 32 * 1024))) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) throw new IllegalStateException("Response exceeds size limit");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }
}
