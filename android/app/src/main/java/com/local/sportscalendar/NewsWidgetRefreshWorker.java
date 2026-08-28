package com.local.sportscalendar;

import android.content.Context;
import android.graphics.Bitmap;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.ArrayList;
import java.util.List;

public class NewsWidgetRefreshWorker extends Worker {
    public NewsWidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        try {
            refresh(context, TeamNewsWidgetData.fetchRecent());
            return Result.success();
        } catch (Exception networkError) {
            if (TeamNewsWidgetData.load(context).isEmpty()) {
                try {
                    refresh(context, TeamNewsWidgetData.loadBundledRecent(context));
                    return Result.success();
                } catch (Exception ignored) {
                    // Keep the empty state and let WorkManager retry below.
                }
            }
            MatchDetailWidgetProvider.refreshAllViews(context);
            return getRunAttemptCount() < 2 ? Result.retry() : Result.success();
        }
    }

    private static void refresh(Context context, List<TeamNewsWidgetData.Item> items) throws Exception {
        List<TeamNewsWidgetData.Item> existing = TeamNewsWidgetData.load(context);
        if (!existing.isEmpty() && !items.isEmpty()
            && TeamNewsWidgetData.sameContent(items.get(0), existing.get(0))
            && TeamNewsWidgetData.hasCachedImage(context, existing.get(0))) {
            MatchDetailWidgetProvider.refreshAllViews(context);
            return;
        }
        List<TeamNewsWidgetData.Item> cachedItems = new ArrayList<>();
        List<Bitmap> images = new ArrayList<>();
        try {
            for (TeamNewsWidgetData.Item item : items) {
                Bitmap image = item.imageUrl.isEmpty()
                    ? null
                    : WidgetNetworkClient.downloadNewsImage(item.imageUrl);
                cachedItems.add(item);
                images.add(image);
            }
            if (cachedItems.isEmpty()) throw new IllegalStateException("新闻数据为空");
            TeamNewsWidgetData.save(context, cachedItems, images);
        } finally {
            for (Bitmap image : images) {
                if (image != null) image.recycle();
            }
        }
        MatchDetailWidgetProvider.refreshAllViews(context);
    }
}
