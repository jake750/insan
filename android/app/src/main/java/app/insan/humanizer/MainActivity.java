package app.insan.humanizer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareInPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(ProcessTextPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
