package com.local.sportscalendar;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WidgetActionReceiver extends BroadcastReceiver {
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
            MlbTodayWidgetProvider.refreshAll(appContext);
        } else if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID
            && MlbTodayWidgetProvider.ACTION_PREV_DAY.equals(action)) {
            MlbTodayWidgetProvider.shiftSelectedDay(appContext, appWidgetId, -1);
        } else if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID
            && MlbTodayWidgetProvider.ACTION_NEXT_DAY.equals(action)) {
            MlbTodayWidgetProvider.shiftSelectedDay(appContext, appWidgetId, 1);
        }
    }
}
