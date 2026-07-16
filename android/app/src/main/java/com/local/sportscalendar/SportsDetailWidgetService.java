package com.local.sportscalendar;

import android.content.Context;
import android.content.Intent;
import android.appwidget.AppWidgetManager;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class SportsDetailWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int appWidgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        );
        return new DetailGameFactory(getApplicationContext(), appWidgetId);
    }

    private static class DetailGameFactory implements RemoteViewsFactory {
        private final Context context;
        private final int appWidgetId;
        private List<MlbTodayWidgetProvider.Game> games = new ArrayList<>();

        DetailGameFactory(Context context, int appWidgetId) {
            this.context = context;
            this.appWidgetId = appWidgetId;
        }

        @Override
        public void onCreate() {
        }

        @Override
        public void onDataSetChanged() {
            games = MlbTodayWidgetProvider.getDisplayGames(context, appWidgetId);
        }

        @Override
        public void onDestroy() {
            games.clear();
        }

        @Override
        public int getCount() {
            return rowCount(games.size());
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_detail_game_item);
            MlbTodayWidgetProvider.renderDetailGame(context, views, games.get(position));
            views.setOnClickFillInIntent(R.id.detail_game_card, new Intent());
            return views;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return games.get(position).stableId();
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }

    static int rowCount(int gameCount) {
        return Math.max(0, gameCount);
    }
}
