var app = angular.module('EnketoCollectApp');

function urlEncode(params) {
	return _.map(params, function(value, key) {
		return key + '=' + encodeURIComponent(value);
	}).join('&');
}

function convertOpenRosaFormToLocal(form, res) {
	return {
		type: 'form',
		title: form.title,
		remote_id: form.remote_id,
		xml: res.data,
	};
}

function basicOpenRosaOptions() {
	return {
		headers: {
			'X-OpenRosa-Version': '1.0',
		},
	};
}

app.service('Adapter', [
	'Config', 'MedicAdapter', 'OnaAdapter',
	function(Config, MedicAdapter, OnaAdapter) {
		return function() {
			switch(Config.adapter) {
				case 'medic': return MedicAdapter;
				case 'ona': return OnaAdapter;
				default: throw new Error('No adapter for adapter: ' + Config.adapter);
			}
		};
	}
]);

app.service('MedicAdapter', [
	'Config', 'Http',
	function(Config, Http) {
		var api = {};

		api.smsEnabled = function() {
			return window.enketo_collect_wrapper &&
					enketo_collect_wrapper.sendSms &&
					Config.medic_serverPhoneNumber;
		};

		api.submit = function(protocol, record) {
			var $data = jQuery(record.data);
			var $vals = $data.children(':not(formhub):not(meta):not(instanceid)').eq(0).children();
			var message = $data.eq(0).attr('id');
			message += Array.prototype.join.call($vals.map(function(i, e) {
				return e.tagName + '#' + e.textContent;
			}), '#');

			if(protocol === 'web') {
				var url = Config.medic_serverUrl + '/api/v1/records';
				var data = urlEncode({
					from: Config.medic_localPhoneNumber,
					message: message,
				});
				var options = { headers: { 'Content-Type':'application/x-www-form-urlencoded' }, };
				return Http.post(url, data, options);
			} else if(protocol === 'sms') {
				return $q(function(resolve, reject) {
					try {
						enketo_collect_wrapper.sendSms(Config.medic_serverPhoneNumber, message);
						resolve();
					} catch(e) {
						reject(e);
					}
				});
			} else throw new Error('MedicAdapter.submit()', 'Unrecognised protocol', protocol);
		};

		api.fetchForm = function(form) {
			return Http.get(form.url)
				.then(function(res) {
					return convertOpenRosaFormToLocal(form, res);
				});
		};

		api.fetchForms = function() {
			return Http.get(Config.medic_serverUrl + '/api/v1/forms', basicOpenRosaOptions())
				.then(function(res) {
					return jQuery(res.data).find('xform').map(function() {
						var e = jQuery(this);
						return {
							title: e.find('name').text(),
							url: e.find('downloadUrl').text(),
							remote_id: e.find('formID').text(),
						};
					});
				});
		};

		return api;
	}
]);

app.service('OnaAdapter', [
	'Config', 'Http',
	function(Config, Http) {
		var ROOT_URL = 'https://api.ona.io/api/v1';

		var api = {
			smsEnabled: function() { return false; },
		};

		function standardOptions() {
			return withAuthHeader(basicOpenRosaOptions());
		}

		function withAuthHeader(options) {
			if(!options.headers) options.headers = {};
			options.headers.Authorization = Http.authHeader(Config.ona_username, Config.ona_password);
			return options;
		}

		api.fetchForm = function(form) {
			return Http.get(form.url, standardOptions())
				.then(function(res) {
					return convertOpenRosaFormToLocal(form, res);
				});
		};

		api.fetchForms = function() {
			return Http.get(ROOT_URL + '/forms', withAuthHeader({}))
				.then(function(res) {
					return _.map(res.data, function(ona) {
						var local = _.pick(ona, ['title', 'url']);
						local.url = local.url + '/form.xml';
						local.remote_id = ona.formid;
						return local;
					});
				});
		};

		api.submit = function(protocol, record) {
			var options = standardOptions();
			options.url = ROOT_URL + '/submissions';
			options.headers.Accept = '*/*';
			var files = [
				{ data:record.data, mime:'text/xml', name:'xml_submission_file', filename:record._id },
			];
			return Http.multipart(options, files);
		};

		return api;
	}
]);
