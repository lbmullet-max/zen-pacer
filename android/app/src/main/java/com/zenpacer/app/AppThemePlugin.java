package com.zenpacer.app;

import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Makes the area behind the status bar and navigation bar match the theme chosen
 * inside the app (light or dark), and picks light or dark status-bar icons to suit.
 * Called from the web page as Capacitor.Plugins.AppTheme.set({ dark: true }).
 */
@CapacitorPlugin(name = "AppTheme")
public class AppThemePlugin extends Plugin {

    private static final int LIGHT_BACKGROUND = 0xFFFFFFFF;
    private static final int DARK_BACKGROUND = 0xFF121212;

    @PluginMethod
    public void set(PluginCall call) {
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(dark ? DARK_BACKGROUND : LIGHT_BACKGROUND);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
        });
        call.resolve();
    }
}
