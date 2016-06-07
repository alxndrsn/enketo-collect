package collect.enketo;

import static android.util.Log.d;
import static android.util.Log.i;
import static collect.enketo.BuildConfig.DEBUG;

/**
 * A simple logger.
 */
public final class Slogger {
	private static final String LOG_TAG = "EnketoCollect";

	private Slogger() {}

	public static void log(String message, Object... extras) {
		message = String.format(message, extras);
		i(LOG_TAG, message);
	}

	public static void trace(Object caller, String message, Object... extras) {
		if(!DEBUG) return;
		message = String.format(message, extras);
		d(LOG_TAG, caller.getClass().getName() + " :: " + message);
	}

	public static void logException(Exception ex, String message, Object... extras) {
		message = String.format(message, extras);
		i(LOG_TAG, message, ex);
	}
}
