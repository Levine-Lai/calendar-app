package com.local.sportscalendar;

import android.content.Context;
import android.content.Intent;
import android.appwidget.AppWidgetManager;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class SportsWidgetService extends RemoteViewsService {
    private static final int MIN_WIDGET_ROWS = 3;

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int appWidgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        );
        return new GameWindowFactory(getApplicationContext(), appWidgetId);
    }

    private static class GameWindowFactory implements RemoteViewsFactory {
        private final Context context;
        private final int appWidgetId;
        private List<MlbTodayWidgetProvider.Game> games = new ArrayList<>();

        GameWindowFactory(Context context, int appWidgetId) {
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
            if (isBlankPosition(position)) {
                RemoteViews blankViews = new RemoteViews(context.getPackageName(), R.layout.widget_blank_game_item);
                blankViews.setOnClickFillInIntent(R.id.game_row, new Intent());
                return blankViews;
            }

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_game_item);
            MlbTodayWidgetProvider.renderGame(context, views, games.get(position));
            views.setOnClickFillInIntent(R.id.game_row, new Intent());
            return views;
        }

        private boolean isBlankPosition(int position) {
            return position >= games.size();
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 2;
        }

        @Override
        public long getItemId(int position) {
            if (position < games.size()) {
                return games.get(position).stableId();
            }
            return -1L - position;
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }

    static int rowCount(int gameCount) {
        return gameCount <= 0 ? 0 : Math.max(MIN_WIDGET_ROWS, gameCount);
    }
}
