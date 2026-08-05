package com.local.sportscalendar;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.graphics.Color;
import android.webkit.WebSettings;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private boolean playLaunchOnResume = false;

    private static final int NEWS_NOTIFICATION_PERMISSION_REQUEST = 1201;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SportsWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setBackgroundColor(Color.rgb(197, 229, 248));
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setOffscreenPreRaster(true);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    runDefaultBack(this);
                    return;
                }
                String script = "Boolean(window.SportsCalendarHandleBack && window.SportsCalendarHandleBack())";
                getBridge().getWebView().evaluateJavascript(script, handled -> {
                    if (!"true".equals(handled)) runDefaultBack(this);
                });
            }
        });
        TeamNewsPushManager.restoreSubscription(getApplicationContext());
        requestDefaultNewsNotificationPermission();
    }

    private void requestDefaultNewsNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || !TeamNewsPushManager.isConfigured(getApplicationContext())
            || !TeamNewsPushManager.isEnabled(getApplicationContext())
            || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            || !TeamNewsPushManager.shouldPromptForNotificationPermission(getApplicationContext())) {
            return;
        }
        TeamNewsPushManager.rememberNotificationPermissionPrompted(getApplicationContext());
        requestPermissions(
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            NEWS_NOTIFICATION_PERMISSION_REQUEST
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        playLaunchThenHandleIntent(intent);
    }

    @Override
    public void onStop() {
        super.onStop();
        if (!isChangingConfigurations()) playLaunchOnResume = true;
    }

    @Override
    public void onResume() {
        super.onResume();
        if (!playLaunchOnResume) return;
        playLaunchOnResume = false;
        playLaunchThenHandleIntent(null);
    }

    private void runDefaultBack(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        callback.setEnabled(true);
    }

    private void playLaunchThenHandleIntent(Intent intent) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        boolean opensNews = intent != null && "OPEN_TEAM_NEWS".equals(intent.getAction());
        String url = opensNews
            ? TeamNewsPushManager.safeMlbUrl(intent.getStringExtra(TeamNewsPushManager.EXTRA_NEWS_URL))
            : "";
        if (opensNews) {
            intent.removeExtra(TeamNewsPushManager.EXTRA_NEWS_URL);
            intent.removeExtra(TeamNewsPushManager.EXTRA_NEWS_ID);
        }
        String destination = opensNews
            ? "window.dispatchEvent(new CustomEvent('sports-news-open',{detail:{url:" + JSONObject.quote(url) + "}}));"
            : "";
        String script = "(()=>{const done=()=>{" + destination + "};"
            + "const launch=window.SportsCalendarLaunch;"
            + "if(launch&&typeof launch.play==='function'){launch.play().then(done,done);}else{done();}})();";
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(script, null));
    }
}
