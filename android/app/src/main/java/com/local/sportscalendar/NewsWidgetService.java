package com.local.sportscalendar;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class NewsWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new NewsWidgetFactory(getApplicationContext());
    }

    private static final class NewsWidgetFactory implements RemoteViewsFactory {
        private final Context context;
        private List<TeamNewsWidgetData.Item> items = new ArrayList<>();

        NewsWidgetFactory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {
            onDataSetChanged();
        }

        @Override
        public void onDataSetChanged() {
            items = TeamNewsWidgetData.load(context);
        }

        @Override
        public void onDestroy() {
            items = new ArrayList<>();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= items.size()) return null;
            TeamNewsWidgetData.Item item = items.get(position);
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_news_item);
            Bitmap image = TeamNewsWidgetData.loadImage(context, item);
            if (image != null) views.setImageViewBitmap(R.id.news_widget_image, image);
            views.setTextViewText(R.id.news_widget_title, item.title);

            Intent fillInIntent = new Intent();
            fillInIntent.setAction("OPEN_TEAM_NEWS");
            fillInIntent.putExtra(TeamNewsPushManager.EXTRA_NEWS_URL, item.url);
            fillInIntent.putExtra(TeamNewsPushManager.EXTRA_NEWS_ID, item.id);
            views.setOnClickFillInIntent(R.id.news_widget_item_root, fillInIntent);
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
            return position >= 0 && position < items.size() ? items.get(position).id.hashCode() : position;
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }
}
