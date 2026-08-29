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
        boolean success = refreshOnce(getApplicationContext());
        // Returning failure from a PeriodicWorkRequest permanently stops future score checks.
        // Retry transient outages briefly, then finish this run successfully so the next
        // periodic or near-live refresh remains scheduled.
        return success || getRunAttemptCount() >= 2 ? Result.success() : Result.retry();
    }

    static boolean refreshOnce(Context context) {
        boolean success = MlbTodayWidgetProvider.refreshAllBlocking(context);
        android.content.SharedPreferences preferences = context
            .getSharedPreferences(MlbTodayWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
        if (success) {
            preferences.edit()
                .putLong(MlbTodayWidgetProvider.PREFS_LAST_REFRESH_AT, System.currentTimeMillis())
                .remove(MlbTodayWidgetProvider.PREFS_LAST_REFRESH_ERROR)
                .putBoolean(MlbTodayWidgetProvider.PREFS_REFRESHING, false)
                .apply();
            MlbTodayWidgetProvider.refreshAllViewsOnly(context);
            MlbTodayWidgetProvider.scheduleLiveFollowUpIfNeeded(context);
            return true;
        }
        preferences.edit()
            .putString(MlbTodayWidgetProvider.PREFS_LAST_REFRESH_ERROR, "比分数据源暂时不可用")
            .putBoolean(MlbTodayWidgetProvider.PREFS_REFRESHING, false)
            .apply();
        MlbTodayWidgetProvider.refreshAllViewsOnly(context);
        MlbTodayWidgetProvider.scheduleLiveFollowUpIfNeeded(context);
        return false;
    }
}
