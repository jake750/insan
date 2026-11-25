package app.insan.humanizer;

import android.app.Activity;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * "Humanize with Insan" in any app's text-selection menu (ACTION_PROCESS_TEXT).
 * JS: ProcessText.get() returns the selected text (null outside that flow) and whether the other app
 * lets us replace it; ProcessText.finish({ text }) hands the rewrite back in place and closes Insan.
 * finish() without text closes it and leaves the selection unchanged.
 */
@CapacitorPlugin(name = "ProcessText")
public class ProcessTextPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        Intent intent = getActivity().getIntent();
        JSObject ret = new JSObject();
        if (intent != null && Intent.ACTION_PROCESS_TEXT.equals(intent.getAction())) {
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
            ret.put("text", text == null ? null : text.toString());
            ret.put("readOnly", intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false));
        } else {
            ret.put("text", null);
            ret.put("readOnly", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void finish(PluginCall call) {
        Activity activity = getActivity();
        Intent intent = activity.getIntent();
        if (intent == null || !Intent.ACTION_PROCESS_TEXT.equals(intent.getAction())) {
            call.resolve();
            return;
        }
        String text = call.getString("text");
        boolean readOnly = intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false);
        if (text != null && !readOnly) {
            activity.setResult(Activity.RESULT_OK, new Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, text));
        } else {
            activity.setResult(Activity.RESULT_CANCELED);
        }
        call.resolve();
        activity.runOnUiThread(activity::finish);
    }
}
