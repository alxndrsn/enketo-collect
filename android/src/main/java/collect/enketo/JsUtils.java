package collect.enketo;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.location.*;
import android.webkit.*;
import android.widget.*;

import java.net.*;
import java.text.*;
import java.util.*;

import org.json.*;

import static java.util.Calendar.*;
import static collect.enketo.BuildConfig.DEBUG;

public class JsUtils {
	private static final DateFormat DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd");

	private final BrowserActivity parent;

	private AssetService assetService;
	private HttpService httpService;
	private LocationManager locationManager;
	private SmsSender smsSender;

	public JsUtils(BrowserActivity parent) {
		this.parent = parent;
	}

	public void setAssetService(AssetService assetService) {
		this.assetService = assetService;
	}

	public void setHttpService(HttpService httpService) {
		this.httpService = httpService;
	}

	public void setLocationManager(LocationManager locationManager) {
		this.locationManager = locationManager;
	}

	public void setSmsSender(SmsSender smsSender) {
		this.smsSender = smsSender;
	}

	@JavascriptInterface
	public String getAppVersion() {
		try {
			return parent.getPackageManager()
					.getPackageInfo(parent.getPackageName(), 0)
					.versionName;
		} catch(Exception ex) {
			return jsonError("Error fetching app version: ", ex);
		}
	}

	@JavascriptInterface
	public String getLocation() {
		try {
			if(locationManager == null) return jsonError("LocationManager not set.  Cannot retrieve location.");

			String provider = locationManager.getBestProvider(new Criteria(), true);
			if(provider == null) return jsonError("No location provider available.");

			Location loc = locationManager.getLastKnownLocation(provider);

			if(loc == null) return jsonError("Provider '" + provider + "' did not provide a location.");

			return new JSONObject()
					.put("lat", loc.getLatitude())
					.put("long", loc.getLongitude())
					.toString();
		} catch(Exception ex) {
			return jsonError("Problem fetching location: ", ex);
		}
	}

	@JavascriptInterface
	public void datePicker(final String targetElement) {
		datePicker(targetElement, Calendar.getInstance());
	}

	@JavascriptInterface
	public void datePicker(final String targetElement, String initialDate) {
		try {
			Calendar c = Calendar.getInstance();
			c.setTime(DATE_FORMAT.parse(initialDate));
			datePicker(targetElement, c);
		} catch(ParseException ex) {
			datePicker(targetElement);
		}
	}

	@JavascriptInterface
	public void sendSms(final String to, final String message) {
		smsSender.send(to, message);
	}

	@JavascriptInterface
	public String http(final String options) {
		// TODO eventually this should be asynchronous
		try {
			JSONObject optionsJson = new JSONObject(options);
			final String url = optionsJson.getString("url");
			if(isRelative(url)) return assetService.request(optionsJson).toString();
			else return httpService.request(optionsJson).toString();
		} catch(Exception ex) {
			ex.printStackTrace();
			return jsonError("Problem in http request: ", ex);
		}
	}

	private void datePicker(String targetElement, Calendar initialDate) {
		// Remove single-quotes from the `targetElement` CSS selecter, as
		// we'll be using these to enclose the entire string in JS.  We
		// are not trying to properly escape these characters, just prevent
		// suprises from JS injection.
		final String safeTargetElement = targetElement.replace('\'', '_');

		DatePickerDialog.OnDateSetListener listener = new DatePickerDialog.OnDateSetListener() {
			public void onDateSet(DatePicker view, int year, int month, int day) {
				++month;
				String dateString = String.format("%04d-%02d-%02d", year, month, day);
				String setJs = String.format("$('%s').val('%s').trigger('change')",
						safeTargetElement, dateString);
				parent.evaluateJavascript(setJs);
			}
		};

		new DatePickerDialog(parent, listener, initialDate.get(YEAR), initialDate.get(MONTH), initialDate.get(DAY_OF_MONTH))
				.show();
	}

	private static String jsonError(String message, Exception ex) {
		return jsonError(message + ex.getClass() + ": " + ex.getMessage());
	}

	private static String jsonError(String message) {
		return "{ \"error\": true, \"message\":\"" +
				jsonEscape(message) +
				"\" }";
	}

	private static String jsonEscape(String s) {
		return s.replaceAll("\"", "'");
	}

	private boolean isRelative(String url) {
		try {
			new URL(url);
			return false;
		} catch(MalformedURLException ex) {
			return true;
		}
	}

	private void log(String message, Object...extras) {
		if(DEBUG) System.err.println("LOG | JsUtil::" +
				String.format(message, extras));
	}
}
