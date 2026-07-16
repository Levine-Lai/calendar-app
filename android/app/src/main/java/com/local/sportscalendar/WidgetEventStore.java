package com.local.sportscalendar;

import android.content.Context;
import android.util.AtomicFile;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

final class WidgetEventStore {
    private static final int MAX_BYTES = 10 * 1024 * 1024;
    private static final int MAX_EVENTS = 5000;
    private static final Object LOCK = new Object();

    private WidgetEventStore() {}

    static void write(Context context, String json) throws Exception {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IllegalArgumentException("Widget data exceeds 10 MB");
        JSONArray events = new JSONArray(json);
        if (events.length() > MAX_EVENTS) throw new IllegalArgumentException("Widget data exceeds 5000 events");
        synchronized (LOCK) {
            AtomicFile file = atomicFile(context);
            FileOutputStream output = null;
            try {
                output = file.startWrite();
                output.write(bytes);
                output.getFD().sync();
                file.finishWrite(output);
            } catch (Exception error) {
                if (output != null) file.failWrite(output);
                throw error;
            }
        }
    }

    static String read(Context context) {
        synchronized (LOCK) {
            AtomicFile file = atomicFile(context);
            try {
                if (file.getBaseFile().exists()) {
                    String json = new String(file.readFully(), StandardCharsets.UTF_8);
                    new JSONArray(json);
                    return json;
                }
            } catch (Exception ignored) {
                // AtomicFile restores its previous version when the newest write is incomplete.
            }
            String legacy = context
                .getSharedPreferences(MlbTodayWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
                .getString(MlbTodayWidgetProvider.PREFS_EVENTS, "[]");
            try {
                new JSONArray(legacy);
                return legacy;
            } catch (Exception ignored) {
                return "[]";
            }
        }
    }

    private static AtomicFile atomicFile(Context context) {
        File directory = new File(context.getFilesDir(), "widget");
        if (!directory.exists()) directory.mkdirs();
        return new AtomicFile(new File(directory, "events.json"));
    }
}
