package com.local.sportscalendar;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class SportsWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new GameWindowFactory(getApplicationContext());
    }

    private static class GameWindowFactory implements RemoteViewsFactory {
        private final Context context;
        private List<MlbTodayWidgetProvider.Game> games = new ArrayList<>();

        GameWindowFactory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {
        }

        @Override
        public void onDataSetChanged() {
            games = MlbTodayWidgetProvider.getDisplayGames(context);
        }

        @Override
        public void onDestroy() {
            games.clear();
        }

        @Override
        public int getCount() {
            return games.isEmpty() ? 1 : games.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_game_item);
            if (games.isEmpty()) {
                MlbTodayWidgetProvider.renderEmpty(views);
            } else {
                MlbTodayWidgetProvider.renderGame(context, views, games.get(position));
            }
            views.setOnClickFillInIntent(R.id.game_row, new Intent());
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
            return games.isEmpty() ? 0L : games.get(position).stableId();
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }
}
