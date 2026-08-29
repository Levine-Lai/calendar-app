package com.local.sportscalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.List;
import java.util.concurrent.TimeUnit;

public class MatchDetailWidgetProvider extends AppWidgetProvider {
    private static final String PERIODIC_WORK_NAME = "team-news-widget-periodic-refresh";
    private static final String IMMEDIATE_WORK_NAME = "team-news-widget-immediate-refresh";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Context appContext = context.getApplicationContext();
        updateWidgetViews(appContext, appWidgetManager, appWidgetIds);
        schedulePeriodicRefresh(appContext);
        enqueueImmediateRefresh(appContext);
    }

    @Override
    public void onEnabled(Context context) {
        Context appContext = context.getApplicationContext();
        schedulePeriodicRefresh(appContext);
        enqueueImmediateRefresh(appContext);
    }

    @Override
    public void onDisabled(Context context) {
        Context appContext = context.getApplicationContext();
        WorkManager manager = WorkManager.getInstance(appContext);
        manager.cancelUniqueWork(PERIODIC_WORK_NAME);
        manager.cancelUniqueWork(IMMEDIATE_WORK_NAME);
    }

    static void refreshAllViews(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] widgetIds = manager.getAppWidgetIds(new ComponentName(context, MatchDetailWidgetProvider.class));
        updateWidgetViews(context, manager, widgetIds);
    }

    private static void updateWidgetViews(Context context, AppWidgetManager manager, int[] widgetIds) {
        List<TeamNewsWidgetData.Item> items = TeamNewsWidgetData.load(context);
        TeamNewsWidgetData.Item latest = items.isEmpty() ? null : items.get(0);
        for (int appWidgetId : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_match_detail);
            if (latest == null) {
                views.setViewVisibility(R.id.news_widget_content, View.GONE);
                views.setViewVisibility(R.id.news_widget_empty, View.VISIBLE);
                views.setOnClickPendingIntent(R.id.news_widget_empty, openAppPendingIntent(context, appWidgetId));
            } else {
                views.setViewVisibility(R.id.news_widget_content, View.VISIBLE);
                views.setViewVisibility(R.id.news_widget_empty, View.GONE);
                Bitmap image = TeamNewsWidgetData.loadImage(context, latest);
                if (image != null) views.setImageViewBitmap(R.id.news_widget_image, image);
                else views.setImageViewResource(R.id.news_widget_image, R.drawable.widget_news_image_background);
                views.setTextViewText(R.id.news_widget_title, latest.title);
                views.setOnClickPendingIntent(
                    R.id.news_widget_content,
                    openArticlePendingIntent(context, appWidgetId, latest)
                );
            }
            manager.updateAppWidget(appWidgetId, views);
        }
    }

    private static PendingIntent openArticlePendingIntent(
        Context context,
        int appWidgetId,
        TeamNewsWidgetData.Item item
    ) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("OPEN_TEAM_NEWS");
        intent.putExtra(TeamNewsPushManager.EXTRA_NEWS_URL, item.url);
        intent.putExtra(TeamNewsPushManager.EXTRA_NEWS_ID, item.id);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            20_000 + appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static PendingIntent openAppPendingIntent(Context context, int appWidgetId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            30_000 + appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static Constraints networkConstraints() {
        return new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
    }

    private static void schedulePeriodicRefresh(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            NewsWidgetRefreshWorker.class,
            15,
            TimeUnit.MINUTES
        ).setConstraints(networkConstraints()).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        );
    }

    private static void enqueueImmediateRefresh(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(NewsWidgetRefreshWorker.class)
            .setConstraints(networkConstraints())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        );
    }
}
