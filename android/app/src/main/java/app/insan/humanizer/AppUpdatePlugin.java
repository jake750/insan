package app.insan.humanizer;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app updates for the APK from GitHub Releases (not for Google Play installs: Play updates the app itself).
 * JS: AppUpdate.info() → can this copy update itself; download({url}) with "progress" events; install().
 * Only release assets of this app's own repository are downloaded, and Android refuses an APK signed with
 * a different key, so nothing but a genuine Insan release can be installed over this one.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String ALLOWED = "https://github.com/jake750/insan/releases/download/";
    private File apk;

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        String installer = null;
        try {
            String pkg = getContext().getPackageName();
            if (Build.VERSION.SDK_INT >= 30) {
                installer = getContext().getPackageManager().getInstallSourceInfo(pkg).getInstallingPackageName();
            } else {
                installer = getContext().getPackageManager().getInstallerPackageName(pkg);
            }
        } catch (Exception ignored) {}
        ret.put("fromStore", "com.android.vending".equals(installer));
        ret.put("canInstall", canInstall());
        call.resolve(ret);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith(ALLOWED) || !url.endsWith(".apk")) {
            call.reject("Not an Insan release");
            return;
        }
        call.setKeepAlive(false);
        new Thread(() -> {
            HttpURLConnection con = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("No space for the update");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File out = new File(dir, "Insan-update.apk");

                con = (HttpURLConnection) new URL(url).openConnection();
                con.setInstanceFollowRedirects(true);
                con.setConnectTimeout(20000);
                con.setReadTimeout(30000);
                int code = con.getResponseCode();
                if (code >= 400) throw new Exception("HTTP " + code);
                long total = con.getContentLengthLong();
                long done = 0;
                int lastPct = -1;
                try (InputStream in = con.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int pct = (int) (done * 100 / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                JSObject p = new JSObject();
                                p.put("percent", pct);
                                notifyListeners("progress", p);
                            }
                        }
                    }
                }
                if (total > 0 && done != total) throw new Exception("Download incomplete");
                apk = out;
                JSObject ret = new JSObject();
                ret.put("bytes", done);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage());
            } finally {
                if (con != null) con.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (apk == null || !apk.exists()) {
            call.reject("Download the update first");
            return;
        }
        JSObject ret = new JSObject();
        if (!canInstall()) {
            // Android 8+: the user allows "Install unknown apps" for Insan once, then taps Update again.
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        ret.put("needsPermission", false);
        call.resolve(ret);
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }
}
