package com.local.sportscalendar;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class TeamNewsRefreshWorker extends Worker {
    public TeamNewsRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (!TeamNewsPushManager.isEnabled(getApplicationContext())) return Result.success();
        if (TeamNewsPushManager.pollAndNotify(getApplicationContext())) return Result.success();
        return getRunAttemptCount() < 3 ? Result.retry() : Result.failure();
    }
}
