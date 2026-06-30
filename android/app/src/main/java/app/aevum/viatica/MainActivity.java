package app.aevum.viatica;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the self-update bridge before the Capacitor WebView starts.
        // JavaScript calls ApkDownloader.download(...) and ApkInstaller.install(...)
        // from the Settings update checker, matching Ultreia's APK flow.
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(ApkDownloaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
