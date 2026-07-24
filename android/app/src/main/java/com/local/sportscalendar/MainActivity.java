package com.local.sportscalendar;

import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.webkit.WebSettings;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SportsWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setBackgroundColor(Color.rgb(251, 244, 234));
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
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchTeamNewsOpen(intent);
    }

    private void runDefaultBack(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        callback.setEnabled(true);
    }

    private void dispatchTeamNewsOpen(Intent intent) {
        if (intent == null || !"OPEN_TEAM_NEWS".equals(intent.getAction()) || getBridge() == null) return;
        String url = TeamNewsPushManager.safeMlbUrl(intent.getStringExtra(TeamNewsPushManager.EXTRA_NEWS_URL));
        String script = "window.dispatchEvent(new CustomEvent('sports-news-open',{detail:{url:"
            + JSONObject.quote(url)
            + "}}));";
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(script, null));
    }
}
