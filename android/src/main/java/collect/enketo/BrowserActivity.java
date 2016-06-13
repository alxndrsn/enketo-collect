package collect.enketo;

import android.app.*;
import android.annotation.SuppressLint;
import android.content.*;
import android.graphics.*;
import android.location.*;
import android.net.*;
import android.os.*;
import android.util.*;
import android.view.*;
import android.view.inputmethod.*;
import android.webkit.*;

import java.io.File;

import static collect.enketo.BuildConfig.DEBUG;
import static collect.enketo.Slogger.log;
import static collect.enketo.Slogger.trace;

public class BrowserActivity extends Activity {
	private static final ValueCallback<String> IGNORE_RESULT = new ValueCallback<String>() {
		public void onReceiveValue(String result) { /* do nothing */ }
	};

	private final ValueCallback<String> backButtonHandler = new ValueCallback<String>() {
		public void onReceiveValue(String result) {
			if(!"true".equals(result)) {
				BrowserActivity.this.moveTaskToBack(false);
			}
		}
	};

	private WebView container;

	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		this.requestWindowFeature(Window.FEATURE_NO_TITLE);
		setContentView(R.layout.main);

		container = (WebView) findViewById(R.id.WebViewContainer);

		if(DEBUG) enableWebviewLoggingAndDebugging(container);
		enableJavascript(container);
		enableStorage(container);

		enableSmsAndCallHandling(container);

		browseToRoot();
	}

	public void onBackPressed() {
		if(container == null) {
			super.onBackPressed();
		} else {
			container.evaluateJavascript(
					"angular.element(document.body).scope().handleAndroidBack()",
					backButtonHandler);
		}
	}

	@SuppressWarnings("PMD.UnconditionalIfStatement")
	public void evaluateJavascript(final String js) {
		container.post(new Runnable() {
			public void run() {
				// `WebView.loadUrl()` seems to be significantly faster than
				// `WebView.evaluateJavascript()` on Tecno Y4.  We may find
				// confusing behaviour on Android 4.4+ when using `loadUrl()`
				// to run JS, in which case we should switch to the second
				// block.
				if(true) {
					container.loadUrl("javascript:" + js);
				} else {
					container.evaluateJavascript(js, IGNORE_RESULT);
				}
			}
		});
	}

	private void browseToRoot() {
		String url = "file:///android_asset/www/index.html";
		log("BrowserActivity :: Pointing browser to %s", url);
		container.loadUrl(url);
	}

	private void enableWebviewLoggingAndDebugging(WebView container) {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
			container.setWebContentsDebuggingEnabled(true);
		}

		container.setWebChromeClient(new WebChromeClient() {
			public boolean onConsoleMessage(ConsoleMessage cm) {
				trace(this, "%s -- From line %d of %s",
						cm.message(), cm.lineNumber(), cm.sourceId());
				return true;
			}

			public void onGeolocationPermissionsShowPrompt(
					String origin,
					GeolocationPermissions.Callback callback) {
				// allow all location requests TODO should we really do this?
				log("BrowserActivity :: onGeolocationPermissionsShowPrompt() :: origin=%s, callback=%s",
						origin, callback);
				callback.invoke(origin, true, true);
			}
		});
	}

	@SuppressLint("SetJavaScriptEnabled")
	private void enableJavascript(WebView container) {
		container.getSettings().setJavaScriptEnabled(true);

		JsUtils j = new JsUtils(this);

		j.setAssetService(new AssetService(this, "www/"));
		j.setHttpService(new HttpService());
		j.setSmsSender(new SmsSender());
		j.setLocationManager((LocationManager) this.getSystemService(Context.LOCATION_SERVICE));

		container.addJavascriptInterface(j, "enketo_collect_wrapper");
	}

	private void enableStorage(WebView container) {
		WebSettings webSettings = container.getSettings();
		webSettings.setDatabaseEnabled(true);
		webSettings.setDomStorageEnabled(true);
		File dir = getCacheDir();
		if (!dir.exists()) {
			boolean created = dir.mkdirs();
			if(!created) throw new RuntimeException("Failed to create AppCache dir at: " + dir.getAbsolutePath());
		}
		webSettings.setAppCachePath(dir.getPath());
		webSettings.setAppCacheEnabled(true);
	}

	private void enableSmsAndCallHandling(WebView container) {
		container.setWebViewClient(new WebViewClient() {
			public boolean shouldOverrideUrlLoading(WebView view, String url) {
				if(url.startsWith("tel:") || url.startsWith("sms:")) {
					Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
					view.getContext().startActivity(i);
					return true;
				}
				return false;
			}
		});
	}
}
