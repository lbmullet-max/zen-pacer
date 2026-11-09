package com.zenpacer.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * Runs while a breathing session is under way (running or paused). Being a foreground
 * service tells Android this app is doing something the user cares about, so it isn't
 * frozen when the screen turns off and the breathing audio keeps playing.
 *
 * The notification has Pause/Resume and Stop buttons, which also show on the lock screen.
 * Those buttons come back here, and are passed on to the web page as events.
 */
public class SessionService extends Service {

    // Sent by the app to say whether the session is running or paused
    static final String ACTION_RUNNING = "com.zenpacer.app.RUNNING";
    static final String ACTION_PAUSED = "com.zenpacer.app.PAUSED";
    // Sent by the notification buttons
    static final String ACTION_TOGGLE = "com.zenpacer.app.TOGGLE";
    static final String ACTION_STOP = "com.zenpacer.app.STOP";

    private static final String CHANNEL_ID = "session";
    private static final int NOTIFICATION_ID = 1;
    // Safety net: sessions are at most 60 minutes, so never hold the CPU longer than this.
    private static final long MAX_WAKE_MS = 2L * 60 * 60 * 1000;

    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();

        // A button on the notification was pressed: tell the page (it pauses/resumes/resets,
        // then tells us the new state). If the page is gone there is nothing to control.
        if (ACTION_TOGGLE.equals(action) || ACTION_STOP.equals(action)) {
            boolean delivered = BackgroundSessionPlugin.emit(ACTION_TOGGLE.equals(action) ? "toggle" : "stop");
            if (!delivered) stopSelf();
            return START_NOT_STICKY;
        }

        boolean running = !ACTION_PAUSED.equals(action);
        showNotification(running);
        updateWakeLock(running);
        return START_NOT_STICKY;
    }

    private void showNotification(boolean running) {
        createChannel();

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_breath)
            .setContentTitle("Zen Pacer")
            .setContentText(running ? "Breathing session in progress" : "Session paused")
            .setContentIntent(tap)
            .setOngoing(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)   // buttons show on the lock screen
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(0, running ? "Pause" : "Resume", actionIntent(ACTION_TOGGLE, 1))
            .addAction(0, "Stop", actionIntent(ACTION_STOP, 2));
        Notification notification = builder.build();

        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, SessionService.class).setAction(action);
        return PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // Only keep the CPU awake while a session is actually running.
    private void updateWakeLock(boolean running) {
        if (running) {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zenpacer:session");
            }
            if (!wakeLock.isHeld()) wakeLock.acquire(MAX_WAKE_MS);
        } else if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Breathing session", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shown while a breathing session is running or paused");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
}
