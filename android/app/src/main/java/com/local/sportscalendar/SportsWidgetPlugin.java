package com.local.sportscalendar;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "SportsWidget",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class SportsWidgetPlugin extends Plugin {
    private static final ExecutorService STORAGE_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final ExecutorService NETWORK_EXECUTOR = Executors.newFixedThreadPool(2);

    @PluginMethod
    public void saveEvents(PluginCall call) {
        JSArray events = call.getArray("events", new JSArray());
        Context context = getContext().getApplicationContext();
        STORAGE_EXECUTOR.execute(() -> {
            try {
                WidgetEventStore.write(context, events.toString());
                MlbTodayWidgetProvider.refreshAll(context);
                JSObject result = new JSObject();
                result.put("count", events.length());
                call.resolve(result);
            } catch (Exception error) {
                call.reject("组件数据保存失败", error);
            }
        });
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String rawUrl = call.getString("url", "");
        Uri uri = Uri.parse(rawUrl);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            call.reject("仅允许打开 HTTPS 下载地址");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("手机上没有可用的浏览器");
            return;
        }

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getTeamNewsPushStatus(PluginCall call) {
        Context context = getContext().getApplicationContext();
        boolean configured = TeamNewsPushManager.isConfigured(context);
        JSObject result = new JSObject();
        result.put("configured", configured);
        result.put("enabled", configured && TeamNewsPushManager.isEnabled(context));
        result.put("permission", hasNotificationPermission() ? "granted" : "prompt");
        result.put("topic", TeamNewsPushManager.TOPIC);
        result.put("lastCheckAt", TeamNewsPushManager.lastCheckAt(context));
        result.put("lastNotificationAt", TeamNewsPushManager.lastNotificationAt(context));
        result.put("lastError", TeamNewsPushManager.lastError(context));
        call.resolve(result);
    }

    @PluginMethod
    public void setTeamNewsPush(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        String topic = call.getString("topic", TeamNewsPushManager.TOPIC);
        if (!TeamNewsPushManager.TOPIC.equals(topic)) {
            call.reject("新闻推送主题无效");
            return;
        }

        Context context = getContext().getApplicationContext();
        if (!TeamNewsPushManager.isConfigured(context)) {
            call.reject("Firebase 尚未配置");
            return;
        }

        if (enabled && !hasNotificationPermission()) {
            requestPermissionForAlias("notifications", call, "teamNewsPermissionCallback");
            return;
        }
        completeTeamNewsPush(call, enabled);
    }

    @PermissionCallback
    private void teamNewsPermissionCallback(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("通知权限未开启");
            return;
        }
        completeTeamNewsPush(call, true);
    }

    private void completeTeamNewsPush(PluginCall call, boolean enabled) {
        Context context = getContext().getApplicationContext();
        TeamNewsPushManager.rememberEnabled(context, enabled);
        if (enabled) {
            NewsMessagingService.createNotificationChannel(context);
            TeamNewsPushManager.scheduleBackgroundChecks(context);
            TeamNewsPushManager.enqueueImmediateCheck(context);
        } else {
            TeamNewsPushManager.cancelBackgroundChecks(context);
        }

        try {
            com.google.android.gms.tasks.Task<Void> task = enabled
                ? FirebaseMessaging.getInstance().subscribeToTopic(TeamNewsPushManager.TOPIC)
                : FirebaseMessaging.getInstance().unsubscribeFromTopic(TeamNewsPushManager.TOPIC);
            task.addOnCompleteListener(result -> resolvePushChange(call, enabled, result.isSuccessful()));
        } catch (RuntimeException error) {
            resolvePushChange(call, enabled, false);
        }
    }

    private void resolvePushChange(PluginCall call, boolean enabled, boolean fcmEnabled) {
        JSObject response = new JSObject();
        response.put("configured", true);
        response.put("enabled", enabled);
        response.put("fcmEnabled", fcmEnabled);
        response.put("localFallbackEnabled", enabled);
        response.put("topic", TeamNewsPushManager.TOPIC);
        call.resolve(response);
    }

    @PluginMethod
    public void sendTeamNewsTestNotification(PluginCall call) {
        Context context = getContext().getApplicationContext();
        if (!hasNotificationPermission()) {
            call.reject("通知权限未开启");
            return;
        }
        NewsMessagingService.showNewsNotification(
            context,
            "观赛日记测试通知",
            "通知权限和主队新闻频道工作正常。",
            "",
            "test-" + System.currentTimeMillis()
        );
        call.resolve();
    }

    @PluginMethod
    public void consumePendingNewsOpen(PluginCall call) {
        Intent intent = getActivity().getIntent();
        String rawUrl = intent == null ? "" : intent.getStringExtra(TeamNewsPushManager.EXTRA_NEWS_URL);
        if (intent != null) {
            intent.removeExtra(TeamNewsPushManager.EXTRA_NEWS_URL);
            intent.removeExtra(TeamNewsPushManager.EXTRA_NEWS_ID);
        }
        JSObject result = new JSObject();
        result.put("url", TeamNewsPushManager.safeMlbUrl(rawUrl));
        call.resolve(result);
    }

    @PluginMethod
    public void fetchMlbArticle(PluginCall call) {
        String ampUrl = TeamNewsPushManager.toMlbAmpUrl(call.getString("url", ""));
        if (ampUrl.isEmpty()) {
            call.reject("MLB 原文地址无效");
            return;
        }
        NETWORK_EXECUTOR.execute(() -> {
            try {
                String html = WidgetNetworkClient.getMlbArticleHtml(ampUrl);
                JSObject result = new JSObject();
                result.put("html", html);
                result.put("sourceUrl", ampUrl);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("MLB 原文读取失败", error);
            }
        });
    }

    @PluginMethod
    public void fetchMlbNewsFeed(PluginCall call) {
        NETWORK_EXECUTOR.execute(() -> {
            try {
                String xml = WidgetNetworkClient.getMlbNewsFeedXml();
                String json = TeamNewsFeed.toJson(TeamNewsFeed.parse(xml));
                JSObject result = new JSObject();
                result.put("json", json);
                result.put("sourceUrl", TeamNewsFeed.RSS_URL);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("MLB 新闻源读取失败", error);
            }
        });
    }

    @PluginMethod
    public void fetchTeamNews(PluginCall call) {
        JSArray urls = call.getArray("urls", new JSArray());
        if (urls.length() == 0) {
            call.reject("新闻地址尚未配置");
            return;
        }
        NETWORK_EXECUTOR.execute(() -> {
            Exception lastError = null;
            int count = Math.min(urls.length(), 3);
            for (int index = 0; index < count; index++) {
                try {
                    String endpoint = TeamNewsPushManager.safeNewsEndpoint(urls.getString(index));
                    if (endpoint.isEmpty()) continue;
                    String json = WidgetNetworkClient.getTeamNewsJson(endpoint);
                    JSObject result = new JSObject();
                    result.put("json", json);
                    result.put("sourceUrl", endpoint);
                    call.resolve(result);
                    return;
                } catch (Exception error) {
                    lastError = error;
                }
            }
            call.reject("新闻同步失败，请检查网络后重试", lastError);
        });
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

}
