package com.local.sportscalendar;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class WidgetDayRolloverWorker extends Worker {
    public WidgetDayRolloverWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        MlbTodayWidgetProvider.rollOverToToday(getApplicationContext());
        return Result.success();
    }
}
