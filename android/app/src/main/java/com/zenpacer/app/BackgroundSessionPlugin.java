package com.zenpacer.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Starts and stops the foreground service that keeps a session's audio going with the
 * screen off. Called from the web page as Capacitor.Plugins.BackgroundSession.start().
 */
@CapacitorPlugin(name = "BackgroundSession")
public class BackgroundSessionPlugin extends Plugin {

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
        try {
            ContextCompat.startForegroundService(context, new Intent(context, SessionService.class));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not start the background service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.stopService(new Intent(context, SessionService.class));
        call.resolve();
    }
}
