package id.alr.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.RingtoneManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Aplikasi ALR untuk Android: membungkus situs ALR (GitHub Pages) di WebView,
 * jadi isi aplikasi selalu ikut versi web terbaru tanpa perlu install ulang.
 * Yang ditangani di sini: kamera (foto laporan), GPS, notifikasi, suara, tombol kembali,
 * link luar dibuka di browser/WA/Maps, dan layar "tidak ada sinyal".
 */
public class MainActivity extends Activity {

    static final String URL_APP = "https://ciptaprima108-oss.github.io/alr-peta/";
    static final String HOST = "ciptaprima108-oss.github.io";
    static final String PATH = "/alr-peta";
    static final String KANAL = "alr_pemberitahuan";

    static final int RQ_LOKASI = 1, RQ_KAMERA_PILIH = 2, RQ_NOTIF = 3, RQ_MEDIA_WEB = 4;
    static final int RQ_PILIH_FILE = 10;

    WebView web;
    ProgressBar muat;
    View layarOffline;
    SharedPreferences pref;

    // GPS
    String geoOrigin;
    GeolocationPermissions.Callback geoCb;
    // kamera / file
    ValueCallback<Uri[]> fileCb;
    WebChromeClient.FileChooserParams fileParams;
    Uri fotoUri;
    // getUserMedia
    PermissionRequest mediaReq;
    // notifikasi
    String notifCbId;
    int notifNo = 100;

    static final String SHIM =
        "(function(){if(window.__alrShim)return;window.__alrShim=1;var B=window.AndroidALR;if(!B)return;" +
        "window.__alrCb={};" +
        "function kirim(t,o){o=o||{};var u='';try{u=(o.data&&o.data.url)||''}catch(e){}" +
        "B.notify(String(t||'ALR'),String(o.body||''),String(o.tag||''),String(u));}" +
        "function N(t,o){kirim(t,o);this.title=t;this.body=(o||{}).body;this.close=function(){};this.onclick=null;this.onclose=null;this.onerror=null;this.onshow=null;}" +
        "Object.defineProperty(N,'permission',{get:function(){return B.izinNotif();}});" +
        "N.requestPermission=function(cb){return new Promise(function(res){var id='n'+Date.now()+Math.floor(Math.random()*1e6);" +
        "window.__alrCb[id]=function(h){try{cb&&cb(h)}catch(e){}res(h)};B.mintaNotif(id);});};" +
        "try{Object.defineProperty(window,'Notification',{value:N,writable:true,configurable:true});}catch(e){window.Notification=N;}" +
        "try{if(window.ServiceWorkerRegistration){ServiceWorkerRegistration.prototype.showNotification=function(t,o){kirim(t,o);return Promise.resolve();};}}catch(e){}" +
        "})();";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        pref = getSharedPreferences("alr", MODE_PRIVATE);
        buatKanal();

        FrameLayout akar = new FrameLayout(this);
        akar.setBackgroundColor(Color.WHITE);

        web = new WebView(this);
        akar.addView(web, new FrameLayout.LayoutParams(-1, -1));

        muat = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        muat.setMax(100);
        FrameLayout.LayoutParams lpMuat = new FrameLayout.LayoutParams(-1, dp(4));
        lpMuat.gravity = Gravity.TOP;
        akar.addView(muat, lpMuat);

        layarOffline = buatLayarOffline();
        layarOffline.setVisibility(View.GONE);
        akar.addView(layarOffline, new FrameLayout.LayoutParams(-1, -1));

        setContentView(akar);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " ALR-Android/" + versi());

        web.addJavascriptInterface(new Jembatan(), "AndroidALR");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, SHIM, Collections.singleton("https://" + HOST));
        }

        web.setWebViewClient(new Klien());
        web.setWebChromeClient(new Krom());
        web.setDownloadListener((url, ua, cd, mime, len) -> bukaLuar(Uri.parse(url)));

        String awal = URL_APP;
        Intent i = getIntent();
        if (i != null && i.getStringExtra("url") != null) awal = urlAman(i.getStringExtra("url"));
        if (b != null) web.restoreState(b);
        else web.loadUrl(awal);
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (i != null && i.getStringExtra("url") != null && web != null) web.loadUrl(urlAman(i.getStringExtra("url")));
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onPause() { web.onPause(); super.onPause(); }

    @Override
    public void onBackPressed() {
        if (layarOffline.getVisibility() == View.VISIBLE) { super.onBackPressed(); return; }
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // ---------- tampilan offline ----------
    View buatLayarOffline() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER);
        l.setBackgroundColor(Color.WHITE);
        l.setPadding(dp(32), dp(32), dp(32), dp(32));
        android.widget.ImageView logo = new android.widget.ImageView(this);
        logo.setImageResource(R.drawable.logo_splash);
        l.addView(logo, new LinearLayout.LayoutParams(dp(120), dp(120)));
        TextView judul = new TextView(this);
        judul.setText("Tidak ada sinyal");
        judul.setTextSize(24);
        judul.setTextColor(Color.parseColor("#23282A"));
        judul.setGravity(Gravity.CENTER);
        judul.setPadding(0, dp(16), 0, dp(8));
        l.addView(judul);
        TextView ket = new TextView(this);
        ket.setText("Aplikasi ALR butuh internet.\nCek data / WiFi, lalu tekan Coba lagi.");
        ket.setTextSize(17);
        ket.setTextColor(Color.parseColor("#55606A"));
        ket.setGravity(Gravity.CENTER);
        l.addView(ket);
        Button coba = new Button(this);
        coba.setText("Coba lagi");
        coba.setTextSize(18);
        coba.setAllCaps(false);
        coba.setTextColor(Color.WHITE);
        coba.setBackgroundColor(Color.parseColor("#1E9BD7"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(220), dp(56));
        lp.topMargin = dp(24);
        coba.setOnClickListener(v -> { layarOffline.setVisibility(View.GONE); web.reload(); });
        l.addView(coba, lp);
        return l;
    }

    boolean adaInternet() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo n = cm.getActiveNetworkInfo();
            return n != null && n.isConnected();
        } catch (Exception e) { return true; }
    }

    // ---------- WebViewClient ----------
    class Klien extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (diDalamApp(u)) return false;
            bukaLuar(u);
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, android.graphics.Bitmap f) {
            muat.setVisibility(View.VISIBLE);
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) v.evaluateJavascript(SHIM, null);
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            muat.setVisibility(View.GONE);
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) v.evaluateJavascript(SHIM, null);
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame()) layarOffline.setVisibility(View.VISIBLE);
        }
    }

    boolean diDalamApp(Uri u) {
        if (u == null) return false;
        String sk = u.getScheme();
        if (!"https".equals(sk)) return false;
        String path = u.getPath() == null ? "" : u.getPath();
        return HOST.equalsIgnoreCase(u.getHost()) && (path.equals(PATH) || path.startsWith(PATH + "/"));
    }

    String urlAman(String s) {
        try { Uri u = Uri.parse(s); if (diDalamApp(u)) return u.toString(); } catch (Exception ignored) {}
        return URL_APP;
    }

    void bukaLuar(Uri u) {
        try {
            Intent i;
            if ("intent".equals(u.getScheme())) {
                i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
            } else {
                i = new Intent(Intent.ACTION_VIEW, u);
            }
            startActivity(i);
        } catch (Exception e) {
            android.widget.Toast.makeText(this, "Tidak bisa membuka link ini", android.widget.Toast.LENGTH_SHORT).show();
        }
    }

    // ---------- WebChromeClient ----------
    class Krom extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView v, int p) {
            muat.setProgress(p);
            muat.setVisibility(p < 100 ? View.VISIBLE : View.GONE);
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            if (punya(Manifest.permission.ACCESS_FINE_LOCATION) || punya(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                cb.invoke(origin, true, false);
                return;
            }
            geoOrigin = origin;
            geoCb = cb;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, RQ_LOKASI);
        }

        @Override
        public void onPermissionRequest(PermissionRequest req) {
            runOnUiThread(() -> {
                List<String> perlu = new ArrayList<>();
                for (String r : req.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !punya(Manifest.permission.CAMERA)) perlu.add(Manifest.permission.CAMERA);
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !punya(Manifest.permission.RECORD_AUDIO)) perlu.add(Manifest.permission.RECORD_AUDIO);
                }
                if (perlu.isEmpty()) { req.grant(req.getResources()); return; }
                mediaReq = req;
                requestPermissions(perlu.toArray(new String[0]), RQ_MEDIA_WEB);
            });
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            fileParams = p;
            if (!punya(Manifest.permission.CAMERA)) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, RQ_KAMERA_PILIH);
            } else {
                bukaPemilih(true);
            }
            return true;
        }
    }

    void bukaPemilih(boolean bolehKamera) {
        String[] tipe = fileParams != null ? fileParams.getAcceptTypes() : new String[0];
        boolean video = false, gambar = false;
        for (String t : tipe) {
            if (t == null) continue;
            if (t.contains("video")) video = true;
            if (t.contains("image")) gambar = true;
        }
        if (!video && !gambar) gambar = true;

        Intent kamera = null;
        fotoUri = null;
        if (bolehKamera) {
            try {
                File dir = new File(getCacheDir(), "kamera");
                dir.mkdirs();
                if (gambar) {
                    File f = new File(dir, "foto_" + System.currentTimeMillis() + ".jpg");
                    fotoUri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
                    kamera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                } else {
                    File f = new File(dir, "video_" + System.currentTimeMillis() + ".mp4");
                    fotoUri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
                    kamera = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
                }
                kamera.putExtra(MediaStore.EXTRA_OUTPUT, fotoUri);
                kamera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception e) {
                kamera = null;
                fotoUri = null;
            }
        }

        boolean langsungKamera = fileParams != null && fileParams.isCaptureEnabled() && kamera != null;
        try {
            if (langsungKamera) {
                startActivityForResult(kamera, RQ_PILIH_FILE);
                return;
            }
            Intent ambil = new Intent(Intent.ACTION_GET_CONTENT);
            ambil.addCategory(Intent.CATEGORY_OPENABLE);
            ambil.setType(gambar && video ? "*/*" : (video ? "video/*" : "image/*"));
            if (fileParams != null && fileParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
                ambil.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            Intent pilih = Intent.createChooser(ambil, "Ambil foto");
            if (kamera != null) pilih.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{kamera});
            startActivityForResult(pilih, RQ_PILIH_FILE);
        } catch (ActivityNotFoundException e) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = null;
            android.widget.Toast.makeText(this, "Kamera / galeri tidak ditemukan", android.widget.Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int req, int hasil, Intent data) {
        super.onActivityResult(req, hasil, data);
        if (req != RQ_PILIH_FILE) return;
        Uri[] out = null;
        if (hasil == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                out = new Uri[]{data.getData()};
            } else if (fotoUri != null) {
                out = new Uri[]{fotoUri};
            }
        }
        if (fileCb != null) fileCb.onReceiveValue(out);
        fileCb = null;
        fileParams = null;
    }

    // ---------- izin ----------
    boolean punya(String p) { return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] hasil) {
        super.onRequestPermissionsResult(req, perms, hasil);
        boolean ok = hasil.length > 0;
        for (int h : hasil) if (h != PackageManager.PERMISSION_GRANTED) ok = false;
        if (req == RQ_LOKASI) {
            boolean adaSatu = false;
            for (int h : hasil) if (h == PackageManager.PERMISSION_GRANTED) adaSatu = true;
            if (geoCb != null) geoCb.invoke(geoOrigin, adaSatu, false);
            geoCb = null;
        } else if (req == RQ_KAMERA_PILIH) {
            bukaPemilih(ok);
        } else if (req == RQ_MEDIA_WEB) {
            if (mediaReq != null) { if (ok) mediaReq.grant(mediaReq.getResources()); else mediaReq.deny(); }
            mediaReq = null;
        } else if (req == RQ_NOTIF) {
            pref.edit().putBoolean("notif_ditanya", true).apply();
            balasNotif(statusNotif());
        }
    }

    // ---------- notifikasi ----------
    void buatKanal() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel k = new NotificationChannel(KANAL, "Pemberitahuan ALR", NotificationManager.IMPORTANCE_HIGH);
            k.setDescription("Jalan merah, laporan baru, dan info ALR");
            k.enableVibration(true);
            k.enableLights(true);
            k.setLightColor(Color.parseColor("#1E9BD7"));
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(k);
        }
    }

    String statusNotif() {
        boolean aktif = NotificationManagerCompat.from(this).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= 33) {
            if (punya(Manifest.permission.POST_NOTIFICATIONS) && aktif) return "granted";
            boolean ditanya = pref.getBoolean("notif_ditanya", false);
            if (ditanya && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) return "denied";
            return "default";
        }
        return aktif ? "granted" : "denied";
    }

    void balasNotif(String h) {
        if (notifCbId == null) return;
        String js = "try{window.__alrCb[" + JSONObject.quote(notifCbId) + "](" + JSONObject.quote(h) + ");delete window.__alrCb[" + JSONObject.quote(notifCbId) + "]}catch(e){}";
        notifCbId = null;
        web.evaluateJavascript(js, null);
    }

    void tampilNotif(String judul, String isi, String tag, String url) {
        if (!"granted".equals(statusNotif())) return;
        Intent buka = new Intent(this, MainActivity.class);
        buka.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (url != null && !url.isEmpty()) {
            try { buka.putExtra("url", urlAman(new java.net.URI(URL_APP).resolve(url).toString())); } catch (Exception ignored) {}
        }
        int id = tag != null && !tag.isEmpty() ? tag.hashCode() : notifNo++;
        PendingIntent pi = PendingIntent.getActivity(this, id, buka, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder nb = new NotificationCompat.Builder(this, KANAL)
            .setSmallIcon(R.drawable.ic_notif)
            .setColor(Color.parseColor("#1E9BD7"))
            .setContentTitle(judul)
            .setContentText(isi)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(isi))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setAutoCancel(true)
            .setContentIntent(pi);
        try { NotificationManagerCompat.from(this).notify(id, nb.build()); } catch (SecurityException ignored) {}
    }

    class Jembatan {
        @JavascriptInterface public String izinNotif() { return statusNotif(); }

        @JavascriptInterface public void mintaNotif(String id) {
            runOnUiThread(() -> {
                notifCbId = id;
                String s = statusNotif();
                if (Build.VERSION.SDK_INT >= 33 && "default".equals(s)) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, RQ_NOTIF);
                } else if ("denied".equals(s)) {
                    try {
                        Intent i = new Intent("android.settings.APP_NOTIFICATION_SETTINGS");
                        i.putExtra("android.provider.extra.APP_PACKAGE", getPackageName());
                        startActivity(i);
                    } catch (Exception ignored) {}
                    balasNotif(s);
                } else {
                    balasNotif(s);
                }
            });
        }

        @JavascriptInterface public void notify(String judul, String isi, String tag, String url) {
            runOnUiThread(() -> tampilNotif(judul, isi, tag, url));
        }

        @JavascriptInterface public String versi() { return MainActivity.this.versi(); }
    }

    String versi() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "1"; }
    }

    int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
