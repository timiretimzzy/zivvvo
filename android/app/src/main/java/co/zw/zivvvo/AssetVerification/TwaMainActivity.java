package co.zw.zivvvo.AssetVerification;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Main entry point for the Zivvvo Trusted Web Activity.
 * Launches the web app in a standalone Chrome Custom Tab / TWA.
 */
public class TwaMainActivity extends Activity {
    private static final String LAUNCH_URL = "https://www.zivvvo.co.zw";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(LAUNCH_URL));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
}
