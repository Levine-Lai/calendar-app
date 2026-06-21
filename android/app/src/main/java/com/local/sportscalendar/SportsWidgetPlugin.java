package com.local.sportscalendar;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SportsWidget")
public class SportsWidgetPlugin extends Plugin {
    @PluginMethod
    public void saveEvents(PluginCall call) {
        JSArray events = call.getArray("events", new JSArray());
        Context context = getContext().getApplicationContext();
        context
            .getSharedPreferences(MlbTodayWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(MlbTodayWidgetProvider.PREFS_EVENTS, events.toString())
            .apply();

        MlbTodayWidgetProvider.refreshAll(context);

        JSObject result = new JSObject();
        result.put("count", events.length());
        call.resolve(result);
    }
}
