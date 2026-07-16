package com.local.sportscalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class MatchDetailWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Context appContext = context.getApplicationContext();
        MlbTodayWidgetProvider.schedulePeriodicRefresh(appContext);
        updateWidgetViews(appContext, appWidgetManager, appWidgetIds);
        MlbTodayWidgetProvider.refreshAll(appContext);
    }

    @Override
    public void onEnabled(Context context) {
        Context appContext = context.getApplicationContext();
        MlbTodayWidgetProvider.schedulePeriodicRefresh(appContext);
        MlbTodayWidgetProvider.refreshAll(appContext);
    }

    @Override
    public void onDisabled(Context context) {
        MlbTodayWidgetProvider.cancelPeriodicRefreshIfUnused(context.getApplicationContext());
    }

    static void refreshAllViews(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] widgetIds = manager.getAppWidgetIds(new ComponentName(context, MatchDetailWidgetProvider.class));
        updateWidgetViews(context, manager, widgetIds);
    }

    private static void updateWidgetViews(
        Context context,
        AppWidgetManager manager,
        int[] widgetIds
    ) {
        for (int appWidgetId : widgetIds) {
            RemoteViews views = baseViews(context, appWidgetId);
            manager.updateAppWidget(appWidgetId, views);
            manager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.detail_game_stack);
        }
    }

    private static RemoteViews baseViews(Context context, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_match_detail);
        Intent openIntent = new Intent(context, MainActivity.class);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            context,
            10_000 + appWidgetId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.detail_widget_root, openPendingIntent);

        Intent serviceIntent = new Intent(context, SportsDetailWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.detail_game_stack, serviceIntent);
        views.setPendingIntentTemplate(R.id.detail_game_stack, openPendingIntent);
        return views;
    }
}
