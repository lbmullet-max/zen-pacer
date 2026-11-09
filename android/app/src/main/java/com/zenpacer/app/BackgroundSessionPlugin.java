package com.zenpacer.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Connects the web page to the foreground service that keeps a session's audio going with
 * the screen off. The page calls start() / paused() / stop(); the notification's Pause/Resume
 * and Stop buttons come back to the page as "toggle" and "stop" events.
 */
@CapacitorPlugin(name = "BackgroundSession")
public class BackgroundSessionPlugin extends Plugin {

    private static BackgroundSessionPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    /** Called by the service when a notification button is pressed. Returns false if the page is gone. */
    static boolean emit(String event) {
        BackgroundSessionPlugin plugin = instance;
        if (plugin == null) return false;
        plugin.notifyListeners(event, new JSObject());
        return true;
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context context = getContext();
        // Android 13+ asks before an app may show notifications. The service runs either way,
        // but with permission the "session in progress" notification is visible.
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7001);
        }
        send(call, SessionService.ACTION_RUNNING);
    }

    /** Session paused: keep the service (and its notification, now with Resume) but let the CPU sleep. */
    @PluginMethod
    public void paused(PluginCall call) {
        send(call, SessionService.ACTION_PAUSED);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.stopService(new Intent(context, SessionService.class));
        call.resolve();
    }

    private void send(PluginCall call, String action) {
        Context context = getContext();
        try {
            ContextCompat.startForegroundService(context, new Intent(context, SessionService.class).setAction(action));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not start the background service: " + e.getMessage());
        }
    }
}
