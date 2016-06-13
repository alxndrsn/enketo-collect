package collect.enketo;

import android.os.*;

import java.io.*;
import java.net.*;
import java.util.*;

import org.json.*;

import static collect.enketo.Slogger.logException;
import static collect.enketo.Slogger.trace;

public class HttpService {
	private static final long HTTP_CACHE_SIZE = 10 * 1024 * 1024; // 10 MB;

	static {
		// Disable HTTP connection reuse in versions it was buggy
		if(Build.VERSION.SDK_INT < Build.VERSION_CODES.FROYO) {
			System.setProperty("http.keepAlive", "false");
		}

		// Enable HTTP caching if available
		try {
			File httpCacheDir = new File("http-cache");
			Class.forName("android.net.http.HttpResponseCache")
					.getMethod("install", File.class, long.class)
					.invoke(null, httpCacheDir, HTTP_CACHE_SIZE);
		} catch(ReflectiveOperationException ex) {
			logException(ex, "Could not enable HttpResponseCache");
		}
	}

	public JSONObject request(JSONObject options) throws IOException, JSONException {
		trace(this, "request :: ENTRY");

		// TODO handle basic auth headers if requested via URL

		HttpURLConnection conn = null;
		InputStream inputStream = null;
		BufferedReader reader = null;
		OutputStream outputStream = null;
		try {
			URL url = new URL(options.getString("url"));
			conn = (HttpURLConnection) url.openConnection();

			if(options.has("method")) {
				conn.setRequestMethod(options.getString("method"));
			}

			JSONObject headers = options.getJSONObject("headers");
			Iterator<String> keys = headers.keys();
			while(keys.hasNext()) {
				String key = keys.next();
				conn.setRequestProperty(key, headers.optString(key));
			}

			if(options.has("data")) {
				byte[] data = options.getString("data").getBytes("UTF-8");
				conn.setFixedLengthStreamingMode(data.length);
				outputStream = new BufferedOutputStream(conn.getOutputStream());
				outputStream.write(data, 0, data.length);
				outputStream.flush();
			}

			if(conn.getResponseCode() < 400) {
				inputStream = conn.getInputStream();
			} else {
				inputStream = conn.getErrorStream();
			}
			reader = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));
			StringBuilder bob = new StringBuilder();

			String line = null;
			while((line = reader.readLine()) != null) {
				bob.append(line).append('\n');
			}
			String responseString = bob.toString();
			trace(this, "request() Retrieved: %s", responseString);
			return new JSONObject()
					.put("status", conn.getResponseCode())
					.put("data", responseString)
					.put("headers", getHeaders(conn));
		} catch(IOException | JSONException ex) {
			throw ex;
		} finally {
			closeSafely(outputStream);
			closeSafely(reader);
			closeSafely(inputStream);
			closeSafely(conn);
		}
	}

	private JSONObject getHeaders(URLConnection conn) throws JSONException {
		JSONObject headers = new JSONObject();
		for(Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
			String key = e.getKey();
			if(key == null) continue;
			List<String> vals = e.getValue();
			if(vals.isEmpty()) headers.put(key, null);
			else if(vals.size() == 1) headers.put(key, vals.get(0));
			else headers.put(key, new JSONArray(vals));
		}
		return headers;
	}

	private void closeSafely(Closeable c) {
		if(c != null) try {
			c.close();
		} catch(Exception ex) {
			logException(ex, "HttpService caught exception while closing %s", c);
		}
	}

	private void closeSafely(HttpURLConnection conn) {
		if(conn != null) try {
			conn.disconnect();
		} catch(Exception ex) {
			logException(ex, "HttpService caught exception while disconnecting %s", conn);
		}
	}
}
