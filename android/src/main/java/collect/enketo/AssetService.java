package collect.enketo;

import android.content.*;

import java.io.*;

import org.json.*;

import static collect.enketo.Slogger.log;
import static collect.enketo.Slogger.logException;

public class AssetService {
	private final Context ctx;
	private final String fileRoot;

	public AssetService(Context ctx, String fileRoot) {
		this.ctx = ctx;
		this.fileRoot = fileRoot;
	}

	public JSONObject request(JSONObject options) throws IOException, JSONException {
		InputStream inputStream = null;
		BufferedReader reader = null;
		try {
			String path = fileRoot + options.getString("url");
			inputStream = ctx.getAssets().open(path);
			reader = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));

			StringBuilder bob = new StringBuilder();
			String line = null;
			while((line = reader.readLine()) != null) {
				bob.append(line).append('\n');
			}
			String responseString = bob.toString();

			log("request", "Retrieved: %s", responseString);
			return new JSONObject()
					.put("status", 200)
					.put("data", responseString)
					.put("headers", new JSONObject());
		} finally {
			if(reader != null) try {
				reader.close();
			} catch(Exception ex) {
				logException(ex, "Exception caught while closing reader.");
			}
			if(inputStream != null) try {
				inputStream.close();
			} catch(Exception ex) {
				logException(ex, "Exception caught while closing inputStream.");
			}
		}
	}
}
