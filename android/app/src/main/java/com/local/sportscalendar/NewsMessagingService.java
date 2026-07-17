package com.local.sportscalendar;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class NewsMessagingService extends FirebaseMessagingService {
    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel(this);
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        TeamNewsPushManager.restoreSubscription(this);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        if (!TeamNewsPushManager.isEnabled(this)) return;

        String title = message.getNotification() == null ? "" : message.getNotification().getTitle();
        String body = message.getNotification() == null ? "" : message.getNotification().getBody();
        if (title == null || title.trim().isEmpty()) title = message.getData().get("title");
        if (body == null || body.trim().isEmpty()) body = message.getData().get("body");
        if (title == null || title.trim().isEmpty()) title = "多伦多蓝鸟新闻";
        if (body == null) body = "";

        String newsUrl = message.getData().get(TeamNewsPushManager.EXTRA_NEWS_URL);
        String newsId = message.getData().get(TeamNewsPushManager.EXTRA_NEWS_ID);
        if (!TeamNewsPushManager.rememberNotification(this, newsId)) return;
        showNewsNotification(this, title, body, newsUrl, newsId);
    }

    static void showNewsNotification(
        Context context,
        String title,
        String body,
        String newsUrl,
        String newsId
    ) {
        createNotificationChannel(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("OPEN_TEAM_NEWS");
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra(TeamNewsPushManager.EXTRA_NEWS_URL, newsUrl == null ? "" : newsUrl);
        intent.putExtra(TeamNewsPushManager.EXTRA_NEWS_ID, newsId == null ? "" : newsId);
        int requestCode = newsId == null ? 0 : newsId.hashCode();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, TeamNewsPushManager.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_news)
            .setColor(ContextCompat.getColor(context, R.color.team_news_accent))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL);

        try {
            NotificationManagerCompat.from(context).notify(requestCode, notification.build());
        } catch (SecurityException ignored) {
            // Android 13+ can revoke notification permission at any time.
        }
    }

    static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            TeamNewsPushManager.CHANNEL_ID,
            context.getString(R.string.team_news_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.team_news_channel_description));
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }
}
