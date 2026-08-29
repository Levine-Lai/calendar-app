package com.local.sportscalendar;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class WidgetActionReceiver extends BroadcastReceiver {
    private static final ExecutorService MANUAL_REFRESH_EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        Context appContext = context.getApplicationContext();
        int appWidgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        );
        String action = intent.getAction();
        if (MlbTodayWidgetProvider.ACTION_REFRESH.equals(action)) {
            if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                MlbTodayWidgetProvider.setSelectedDayOffset(appContext, appWidgetId, 0, false);
            }
            MlbTodayWidgetProvider.prepareRefresh(appContext);
            MlbTodayWidgetProvider.schedulePeriodicRefresh(appContext);
            PendingResult pendingResult = goAsync();
            MANUAL_REFRESH_EXECUTOR.execute(() -> {
                try {
                    if (!WidgetRefreshWorker.refreshOnce(appContext)) {
                        MlbTodayWidgetProvider.enqueueImmediateRefresh(appContext);
                    }
                } finally {
                    pendingResult.finish();
                }
            });
        } else if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID
            && MlbTodayWidgetProvider.ACTION_PREV_DAY.equals(action)) {
            MlbTodayWidgetProvider.shiftSelectedDay(appContext, appWidgetId, -1);
        } else if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID
            && MlbTodayWidgetProvider.ACTION_NEXT_DAY.equals(action)) {
            MlbTodayWidgetProvider.shiftSelectedDay(appContext, appWidgetId, 1);
        }
    }
}
