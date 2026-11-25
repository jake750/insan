package app.insan.humanizer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Opened from another app's text-selection menu. It runs in that app's task (so the result goes back
 * to it) and loads Insan in a compact "rewrite this selection" mode; see ProcessTextPlugin.
 * MainActivity is singleTask and so cannot return a result, which is why this is its own activity.
 */
public class ProcessTextActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ProcessTextPlugin.class);
        registerPlugin(ShareInPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
