package collect.enketo;

import android.content.*;

import java.io.*;

import org.json.*;

import static collect.enketo.BuildConfig.DEBUG;
import static collect.enketo.Slogger.log;

public class AssetService {
	private final Context ctx;
	private final String fileRoot;

	public AssetService(Context ctx, String fileRoot) {
		this.ctx = ctx;
		this.fileRoot = fileRoot;
	}

	public JSONObject request(JSONObject options) throws IOException, JSONException {
		InputStream inputStream = null;
		try {
			String path = fileRoot + options.getString("url");
			inputStream = ctx.getAssets().open(path);
			BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));

			StringBuilder bob = new StringBuilder();
			String line = null;
			while((line = reader.readLine()) != null) {
				bob.append(line + "\n");
			}
			String responseString = bob.toString();

			log("request() :: Retrieved: %s", responseString);
			return new JSONObject()
					.put("status", 200)
					.put("data", responseString)
					.put("headers", new JSONObject());
		} finally {
			if(inputStream != null) try {
				inputStream.close();
			} catch(Exception ex) {
				if(DEBUG) ex.printStackTrace();
			}
		}
	}
}
