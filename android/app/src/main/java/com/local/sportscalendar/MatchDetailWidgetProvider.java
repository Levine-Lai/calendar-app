package com.local.sportscalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

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
        for (int appWidgetId : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_match_detail);

            Intent serviceIntent = new Intent(context, NewsWidgetService.class);
            serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            serviceIntent.setData(Uri.parse("sportscalendar://news-widget/" + appWidgetId));
            views.setRemoteAdapter(R.id.news_widget_stack, serviceIntent);
            views.setEmptyView(R.id.news_widget_stack, R.id.news_widget_empty);
            views.setPendingIntentTemplate(
                R.id.news_widget_stack,
                openArticleTemplate(context, appWidgetId)
            );
            views.setOnClickPendingIntent(
                R.id.news_widget_empty,
                openAppPendingIntent(context, appWidgetId)
            );

            manager.updateAppWidget(appWidgetId, views);
            manager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.news_widget_stack);
        }
    }

    private static PendingIntent openArticleTemplate(Context context, int appWidgetId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("OPEN_TEAM_NEWS");
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            20_000 + appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
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
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        );
    }
}
