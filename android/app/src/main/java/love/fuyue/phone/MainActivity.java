package love.fuyue.phone;

import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private long lastExitGestureAt = 0L;
    private boolean nativeShellCleanupStarted = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FuyueNativeGatewayPlugin.class);
        registerPlugin(FuyueDevicePlugin.class);
        registerPlugin(FuyueVoicePlugin.class);
        super.onCreate(savedInstanceState);
        removeStaleNativeServiceWorker();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    finish();
                    return;
                }
                getBridge().getWebView().evaluateJavascript(
                    "Boolean(window.__fuyueHandleNativeBack && window.__fuyueHandleNativeBack())",
                    consumed -> runOnUiThread(() -> {
                        if ("true".equals(consumed)) return;
                        long now = SystemClock.elapsedRealtime();
                        if (now - lastExitGestureAt <= 2_000L) {
                            setEnabled(false);
                            finishAfterTransition();
                            return;
                        }
                        lastExitGestureAt = now;
                        Toast.makeText(MainActivity.this, "再滑一次回桌面", Toast.LENGTH_SHORT).show();
                    })
                );
            }
        });
    }

    private void removeStaleNativeServiceWorker() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            getWindow().getDecorView().postDelayed(this::removeStaleNativeServiceWorker, 500L);
            return;
        }
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                cleanNativeShell(webView);
            }
        });
        WebView webView = getBridge().getWebView();
        if (webView.getProgress() == 100) cleanNativeShell(webView);
    }

    private void cleanNativeShell(WebView webView) {
        if (nativeShellCleanupStarted) return;
        nativeShellCleanupStarted = true;
        webView.clearCache(true);
        webView.evaluateJavascript(
            "(async()=>{try{" +
                "const registrations='serviceWorker' in navigator?await navigator.serviceWorker.getRegistrations():[];" +
                "const keys='caches' in window?await caches.keys():[];" +
                "const shellKeys=keys.filter(key=>key.startsWith('fuyue-shell-'));" +
                "if(!registrations.length&&!shellKeys.length)return false;" +
                "await Promise.all(registrations.map(registration=>registration.unregister()));" +
                "await Promise.all(shellKeys.map(key=>caches.delete(key)));" +
                "location.reload();return true;" +
            "}catch(error){return false;}})()",
            ignored -> { }
        );
    }
}
