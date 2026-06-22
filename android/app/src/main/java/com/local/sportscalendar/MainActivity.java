package com.local.sportscalendar;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SportsWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().getSettings().setLoadsImagesAutomatically(true);
        getBridge().getWebView().getSettings().setBlockNetworkImage(false);
    }
}
