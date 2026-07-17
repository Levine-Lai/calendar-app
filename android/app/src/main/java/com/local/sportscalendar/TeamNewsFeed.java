package com.local.sportscalendar;

import org.json.JSONArray;
import org.json.JSONObject;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

import javax.xml.parsers.DocumentBuilderFactory;

final class TeamNewsFeed {
    static final String RSS_URL = "https://www.mlb.com/bluejays/feeds/news/rss.xml";
    private static final int MAX_ITEMS = 20;

    static final class Item {
        final String id;
        final String title;
        final String summary;
        final String author;
        final long publishedAt;
        final String url;

        Item(String id, String title, String summary, String author, long publishedAt, String url) {
            this.id = id;
            this.title = title;
            this.summary = summary;
            this.author = author;
            this.publishedAt = publishedAt;
            this.url = url;
        }
    }

    private TeamNewsFeed() {
    }

    static List<Item> parse(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        Document document = factory.newDocumentBuilder().parse(
            new ByteArrayInputStream(String.valueOf(xml).getBytes(StandardCharsets.UTF_8))
        );

        NodeList rawItems = document.getElementsByTagName("item");
        List<Item> items = new ArrayList<>();
        Set<String> seenUrls = new HashSet<>();
        for (int index = 0; index < rawItems.getLength(); index++) {
            if (!(rawItems.item(index) instanceof Element)) continue;
            Element element = (Element) rawItems.item(index);
            String url = TeamNewsPushManager.safeMlbUrl(firstText(element, "link", "guid"));
            String title = bounded(firstText(element, "title"), 240);
            long publishedAt = parsePublishedAt(firstText(element, "pubDate"));
            if (url.isEmpty() || title.isEmpty() || publishedAt <= 0L || !seenUrls.add(url)) continue;
            items.add(new Item(
                sha256(url),
                title,
                bounded(stripHtml(firstText(element, "description")), 900),
                bounded(firstText(element, "author", "dc:creator"), 80),
                publishedAt,
                url
            ));
        }
        items.sort((left, right) -> Long.compare(right.publishedAt, left.publishedAt));
        return new ArrayList<>(items.subList(0, Math.min(items.size(), MAX_ITEMS)));
    }

    static String toJson(List<Item> items) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("teamId", "toronto-blue-jays");
        payload.put("teamName", "多伦多蓝鸟");
        payload.put("updatedAt", isoDate(System.currentTimeMillis()));
        JSONArray output = new JSONArray();
        for (Item item : items) {
            JSONObject value = new JSONObject();
            value.put("id", item.id);
            value.put("teamId", "toronto-blue-jays");
            value.put("teamName", "多伦多蓝鸟");
            value.put("titleEn", item.title);
            value.put("summaryEn", item.summary);
            value.put("bodyEn", new JSONArray());
            value.put("author", item.author);
            value.put("publishedAt", isoDate(item.publishedAt));
            value.put("url", item.url);
            value.put("source", "MLB.com");
            output.put(value);
        }
        payload.put("items", output);
        return payload.toString();
    }

    static List<String> ids(List<Item> items) {
        List<String> ids = new ArrayList<>();
        for (Item item : items) ids.add(item.id);
        return ids;
    }

    private static String firstText(Element parent, String... names) {
        for (String name : names) {
            NodeList matches = parent.getElementsByTagName(name);
            if (matches.getLength() > 0) {
                String value = bounded(matches.item(0).getTextContent(), 5000);
                if (!value.isEmpty()) return value;
            }
        }
        return "";
    }

    private static String stripHtml(String value) {
        return String.valueOf(value)
            .replaceAll("<[^>]*>", " ")
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">");
    }

    private static String bounded(String value, int maxLength) {
        String normalized = String.valueOf(value == null ? "" : value).replaceAll("\\s+", " ").trim();
        return normalized.substring(0, Math.min(normalized.length(), maxLength));
    }

    private static long parsePublishedAt(String value) {
        for (String pattern : new String[] {"EEE, dd MMM yyyy HH:mm:ss z", "EEE, dd MMM yyyy HH:mm z"}) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setLenient(false);
                Date parsed = format.parse(value);
                if (parsed != null) return parsed.getTime();
            } catch (Exception ignored) {
                // Try the next RFC 822 variant.
            }
        }
        return 0L;
    }

    private static String sha256(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder output = new StringBuilder(digest.length * 2);
        for (byte part : digest) output.append(String.format(Locale.US, "%02x", part & 0xff));
        return output.toString();
    }

    private static String isoDate(long timestamp) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(timestamp));
    }
}
