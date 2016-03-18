package collect.enketo;

import android.telephony.*;

public class SmsSender {
	private final SmsManager smsManager;

	public SmsSender() {
		this.smsManager = SmsManager.getDefault();
	}

	public void send(String to, String message) {
		smsManager.sendTextMessage(to, null, message, null, null);
	}
}
