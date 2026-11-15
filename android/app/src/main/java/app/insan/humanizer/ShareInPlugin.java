package app.insan.humanizer;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives text shared into the app (ACTION_SEND, text/plain).
 * JS: ShareIn.getSharedText() for a cold start, and the "shared" event while the app is open.
 * The text is handed over once and then cleared; nothing is stored.
 */
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {
    private String pending;

    @Override
    public void load() {
        pending = textOf(getActivity().getIntent());
    }

    @PluginMethod
    public void getSharedText(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("text", pending);
        pending = null;
        call.resolve(ret);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String text = textOf(intent);
        if (text == null) return;
        JSObject data = new JSObject();
        data.put("text", text);
        notifyListeners("shared", data, true);
    }

    private static String textOf(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        if (!"text/plain".equals(intent.getType())) return null;
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return null;
        return subject != null && !subject.trim().isEmpty() && !text.startsWith(subject) ? subject + "\n\n" + text : text;
    }
}
