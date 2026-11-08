package com.zenpacer.app;

import android.graphics.Color;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeepAwakePlugin.class);
        super.onCreate(savedInstanceState);
        // Let the window's light/dark background show until the page paints (no white flash in dark mode)
        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
    }
}
