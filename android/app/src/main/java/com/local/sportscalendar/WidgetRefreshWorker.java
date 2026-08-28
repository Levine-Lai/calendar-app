package com.local.sportscalendar;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class WidgetRefreshWorker extends Worker {
    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        boolean success = MlbTodayWidgetProvider.refreshAllBlocking(getApplicationContext());
        android.content.SharedPreferences preferences = getApplicationContext()
            .getSharedPreferences(MlbTodayWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
        if (success) {
            preferences.edit()
                .putLong(MlbTodayWidgetProvider.PREFS_LAST_REFRESH_AT, System.currentTimeMillis())
                .remove(MlbTodayWidgetProvider.PREFS_LAST_REFRESH_ERROR)
                .putBoolean(MlbTodayWidgetProvider.PREFS_REFRESHING, false)
                .apply();
            MlbTodayWidgetProvider.refreshAllViewsOnly(getApplicationContext());
            MlbTodayWidgetProvider.scheduleLiveFollowUpIfNeeded(getApplicationContext());
            return Result.success();
        }
        preferences.edit()
            .putString(MlbTodayWidgetProvider.PREFS_LAST_REFRESH_ERROR, "比分数据源暂时不可用")
            .putBoolean(MlbTodayWidgetProvider.PREFS_REFRESHING, false)
            .apply();
        MlbTodayWidgetProvider.refreshAllViewsOnly(getApplicationContext());
        MlbTodayWidgetProvider.scheduleLiveFollowUpIfNeeded(getApplicationContext());
        // Returning failure from a PeriodicWorkRequest permanently stops future score checks.
        // Retry transient outages briefly, then finish this run successfully so the next
        // periodic or near-live refresh remains scheduled.
        return getRunAttemptCount() < 2 ? Result.retry() : Result.success();
    }
}
