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
                .apply();
            MlbTodayWidgetProvider.refreshAllViewsOnly(getApplicationContext());
            return Result.success();
        }
        preferences.edit()
            .putString(MlbTodayWidgetProvider.PREFS_LAST_REFRESH_ERROR, "比分数据源暂时不可用")
            .apply();
        MlbTodayWidgetProvider.refreshAllViewsOnly(getApplicationContext());
        return getRunAttemptCount() < 3 ? Result.retry() : Result.failure();
    }
}
