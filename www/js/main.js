var ENKETO_CONTAINER = '#enketo-form .form-body';
var AJAX_PROXY_URL = 'http://localhost:8081';

require('lodash');
var PouchDB = require('pouchdb');
// set window.jQuery for enketo's sake
var $ = window.jQuery = require('jquery');
var Enketo = require('enketo-core');

require('bootstrap');

require('angular');
require('angular-ui-router');

var db = new PouchDB('ncollect');

var app = angular.module('EnketoCollectApp', [
	'ui.router',
]);

function logError(err) {
	console.log(err, err.message);
	if(window.enketo_collect_wrapper && enketo_collect_wrapper.logError) {
		enketo_collect_wrapper.logError(err);
	}
}

app.config([
	'$stateProvider', '$urlRouterProvider',
	function($stateProvider, $urlRouterProvider) {
		$urlRouterProvider.otherwise('/');
		$stateProvider
			.state('home', {
				url: '/',
				templateUrl: 'main_menu.html',
				controller: 'MainMenuController',
			})
			.state('config', {
				url: '/config',
				templateUrl: 'config.html',
				controller: 'ConfigController',
			})
			.state('forms', {
				url: '/forms',
				templateUrl: 'forms/index.html',
				controller: 'FormListController',
			})
			.state('forms-new', {
				url: '/forms/new/:id',
				templateUrl: 'forms/edit.html',
				controller: 'FormNewController',
			})
			.state('forms-fetch', {
				url: '/forms/fetch',
				templateUrl: 'forms/fetch.html',
				controller: 'FormFetchController',
			})
			.state('forms-manage', {
				url: '/forms/manage',
				templateUrl: 'forms/manage.html',
				controller: 'FormManageController',
			})
			.state('records-edit-index', {
				url: '/records/edit',
				templateUrl: 'records/edit_index.html',
				controller: 'RecordEditIndexController',
			})
			.state('records-edit', {
				url: '/records/edit/:id',
				templateUrl: 'forms/edit.html',
				controller: 'RecordEditController',
			})
			.state('records-submit-index', {
				url: '/records/submit',
				templateUrl: 'records/submit_index.html',
				controller: 'RecordSubmitIndexController',
			})
			;
	}
]);

app.service('Config', [
	'$q',
	function($q) {
		var config;
		var init = $q(function(resolve) {
			function complete(c) {
				_.defaults(config, c);
				resolve();
			}

			db.get('config')
				.then(complete)
				.catch(function() {
					// config not loaded from DB, revert to default
					var defaultConfig = {};

					// Medic defaults
					defaultConfig.medic_serverUrl = 'https://demo.app.medicmobile.org';
					if(window.enketo_collect_wrapper && enketo_collect_wrapper.getPhoneNumber) {
						try {
							var suppliedPhoneNumber = JSON.parse(enketo_collect_wrapper.getPhoneNumber());
							if(!suppliedPhoneNumber.error) defaultConfig.medic_localPhoneNumber = suppliedPhoneNumber;
						} catch(_) {}
					}

					// OpenRosa defaults
					defaultConfig.or_serverUrl = 'https://kc.kobotoolbox.org/<username>';

					// ONA defaults
					defaultConfig.ona_username = 'mr_alex';

					complete(defaultConfig);
				});
		});

		function save() {
			db.put(_.omit(config, ['$init', '$save']))
				.then(function(res) {
					if(!res.ok) throw new Error('Error saving config: ' + res);
					config._rev = res.rev;
				})
				.catch(logError);
		}

		config = {
			_id: 'config',
			$init: init,
			$save: save,
		};

		return config;
	}
]);

app.service('EnketoDisplay', [
	'$state', 'EnketoTransform',
	function($state, EnketoTransform) {
		return function($scope, formDoc, record) {
			$scope.loading = true;

			$scope.save = function() {
				$scope.saving = true;
				$scope.form.enketo.validate()
					.then(function(valid) {
						if(!valid) {
							$scope.saving = false;
							$scope.$apply();
							return;
						}
						var data = $scope.form.enketo.getDataStr();
						var doc = $scope.form.record || {
							type: 'record',
							formId: $scope.form.doc._id,
							formTitle: $scope.form.doc.title,
						};
						doc.data = data;
						doc.finalised = $scope.form.finalised;
						doc.lastEditDate = new Date();

						return db.post(doc);
					})
					.then(function() {
						$state.go('home');
					})
					.catch(function(err) {
						$scope.saving = false;
						$scope.$apply();
						logError(err);
					});
			};

			return EnketoTransform(jQuery.parseXML(formDoc.xml))
				.then(function(form) {
					$(ENKETO_CONTAINER).html(form.html);
					$scope.form = {
						doc: formDoc,
						enketo: new Enketo(ENKETO_CONTAINER, {
							modelStr: form.model,
							instanceStr: record && record.data,
						}),
						finalised: true,
						record: record,
					};
					var loadErrors = $scope.form.enketo.init();
					if(loadErrors && loadErrors.length) {
						throw new Error('Error loading form.  ' +
								JSON.stringify(loadErrors));
					}
					$scope.loading = false;
				});
		};
	}
]);

app.service('Http', [
	'$http', '$q',
	function($http, $q) {
		function mergeHeaders(target) {
			var i, defaults;

			function addFromDefaults(val, key) {
				if(!target.hasOwnProperty(key)) {
					target[key] = val;
				}
			}

			for(i=1; i<arguments.length; ++i) {
				defaults = arguments[i];
				_.forEach(defaults, addFromDefaults);
			}
		}

		function headersGetter(headers) {
			return function(key) {
				if(!arguments.length) return headers;
				key = key.toLowerCase();
				return _.reduce(headers, function(result, val, _key) {
					if(key === _key.toLowerCase()) return val;
					return result;
				});
			};
		}

		function multipartOptions(options, files) {
			// Manually build the form submit ourself, as we need the Content-Type hader
			// set, and Chrome seems to omit Blob content when submitting mutipart data
			// with e.g. `FormData`.  It's also convenient to re-use this approach on
			// Android so that we can continue to use `HttpURLConnection`.
			var BOUNDARY = '-----FormBoundary' + Math.random().toString().substring(2);

			options.method = 'POST';
			if(!options.headers) options.headers = {};
			options.headers['Content-Type'] = 'multipart/form-data; charset=utf-8; boundary=' + BOUNDARY;

			options.data = '';
			_.forEach(files, function(file) {
				options.data = '--' + BOUNDARY + '\r\n' +
						'Content-Disposition: form-data; name="' + file.name + '"; filename= " + file.filename + "\r\n' +
						'Content-Type: ' + file.mime + '\r\n' +
						'\r\n' +
						file.data +
						'\r\n';
			});
			options.data += '--' + BOUNDARY + '--' + '\r\n';
			options.headers['Content-Length'] = options.data.length;
		}

		function authHeader(username, password) {
			return 'Basic ' + window.btoa(username + ':' + (password || ''));
		}

		function convertAuthHeaders(options) {
			var match = /(http[s]?):\/\/(?:([^:]*):([^@]*)@(.*))/.exec(options.url);
			if(!match) return;

			options.url = match[1] + '://' + match[4];

			var username = match[2];
			var password = match[3];

			if(!options.headers) options.headers = {};
			options.headers.Authorization = authHeader(username, password);
		}

		function modifyOptionsForAjaxProxy(options) {
			if(!options.headers) options.headers = {};

			options.headers.__ajax_proxy_url = options.url;
			options.url = AJAX_PROXY_URL + '/?q=' + encodeURI(options.url);
		}

		var api = {
			authHeader: authHeader,
			get: function(url, options) {
				if(!options) options = {};
				options.method = 'GET';
				options.url = url;
				return api.request(options);
			},
			post: function(url, data, options) {
				if(!options) options = {};
				options.method = 'POST';
				options.url = url;
				options.data = data;
				return api.request(options);
			},
		};
		if(window.enketo_collect_wrapper && enketo_collect_wrapper.http) {
			api.request = function(options) {
				if(arguments.length !== 1) {
					throw new Error('Wrong number of args for HTTP request.');
				}

				// TODO check if we really need to do this manually
				convertAuthHeaders(options);

				var method = (options.method || 'GET').toLowerCase();
				if(!options.headers) options.headers = {};
				mergeHeaders(options.headers,
						$http.defaults.headers[method],
						$http.defaults.headers.common);

				return $q(function(resolve, reject) {
					try {
						var res = JSON.parse(enketo_collect_wrapper.http(JSON.stringify(options)));
						if(res.error) reject(new Error(res.message));
						else if(res.status >= 400) reject(res);
						else resolve(res);
					} catch(e) {
						reject(e);
					}
				}).then(function(res) {
					if(typeof $http.defaults.transformResponse === 'function') {
						res.data = $http.defaults.transformResponse(res.data, headersGetter(res.headers), res.status);
					} else if(angular.isArray($http.defaults.transformResponse)) {
						_.forEach($http.defaults.transformResponse, function(transformer) {
							res.data = transformer(res.data, headersGetter(res.headers), res.status);
						});
					}

					if(options.responseType === 'document') {
						res.data = $.parseXML(res.data);
					}

					return res;
				});
			};

			api.multipart = function(options, files) {
				return api.request(multipartOptions(options, files));
			};
		} else {
			api.request = function(options) {
				try { new URL(options.url); } catch(_) {
					if(!options.url) throw new Error('No URL provided.');
					// Handle relative URLs:
					else if(/^\//.test(options.url)) options.url = window.location.origin + options.url;
					else options.url = window.location.origin + window.location.pathname +
							(/\/$/.test(window.location.pathname) ? '' : '/') + options.url;
				}
				modifyOptionsForAjaxProxy(options);
				return $http(options);
			};
			api.multipart = function(options, files) {
				modifyOptionsForAjaxProxy(options);
				multipartOptions(options, files);
				return $q(function(resolve, reject) {
					options.processData = false;
					options.success = resolve;
					options.error = reject;
					$.ajax(options);
				});
			};
		}
		return api;
	}
]);

app.service('EnketoTransform', [
	'$q', 'Http',
	function($q, Http) {
		function getStylesheet(url) {
			return Http.get(url, { responseType:'document' })
				.then(function(res) {
					var p = new XSLTProcessor();
					p.importStylesheet(res.data);
					return p;
				});
		}

		function getStylesheets() {
			return $q.all([
				getStylesheet('enketo/openrosa2html5form.xsl'),
				getStylesheet('enketo/openrosa2xmlmodel.xsl')]);
		}

		function transform(processor, xml) {
			var transformed = processor.transformToDocument(xml);
			var root = transformed.documentElement.firstElementChild;
			return new XMLSerializer().serializeToString(root);
		}

		return function(xml) {
			return getStylesheets()
				.then(function(processors) {
					return $q.all([
						transform(processors[0], xml),
						transform(processors[1], xml)]);
				})
				.then(function(transformed) {
					return {
						html: transformed[0],
						model: transformed[1],
					};
				});
		};
	}
]);

app.controller('EnketoCollectController', [
	'$scope', '$state', '$q', 'Config',
	function($scope, $state, $q, Config) {
		$scope.starting = true;

		$scope.handleAndroidBack = function() {
			if($state.current.name !== 'home') {
				window.history.back();
				return true;
			}
		};

		var ddocs = _.map({
			forms: function(doc) { if(doc.type === 'form') emit(doc.title); },
			records_finalised: function(doc) {
				if(doc.type === 'record' && doc.finalised) emit(doc);
			},
			records_unfinalised: function(doc) {
				if(doc.type === 'record' && !doc.finalised) emit(doc);
			},
		}, function(map, name) {
			var doc = { _id:'_design/'+name, views:{} };
			doc.views[name] = { map:map.toString() };

			return db.get(doc._id)
				.then(function(old) {
					doc._rev = old._rev;
					return db.put(doc);
				})
				.catch(function(err) {
					if(err.status !== 404) {
						logError(err);
						return;
					}
					db.put(doc)
						.catch(logError);
				});
		});
		$q.all(ddocs)
			.then(function() {
				return Config.$init;
			})
			.then(function() {
				$scope.starting = false;
			})
			.catch(logError);
	}
]);

app.controller('MainMenuController', [
	function() {
	}
]);

app.controller('ConfigController', [
	'$scope', 'Config',
	function($scope, Config) {
		$scope.config = Config;
		$scope.version = (window.enketo_collect_wrapper && enketo_collect_wrapper.getAppVersion()) || '?';
		$scope.serverUrl = 'http://localhost:8080/';

		$scope.smsSupported = window.enketo_collect_wrapper && enketo_collect_wrapper.sendSms;

		$scope.$on('$destroy', function() {
			Config.$save();
		});
	}
]);

app.controller('FormManageController', [
	'$scope',
	function($scope) {
		function refresh() {
			$scope.loading = true;
			delete $scope.forms;
			db.query('forms', { include_docs:true })
				.then(function(res) {
					$scope.loading = false;
					$scope.forms = _.map(res.rows, 'doc');
					$scope.$apply();
				})
				.catch(logError);
		}

		$scope.delete = function(form) {
			$scope.loading = true;
			db.remove({ _id:form._id, _rev:form._rev })
				.then(refresh)
				.catch(logError);
		};

		refresh();
	}
]);

app.controller('RecordEditController', [
	'$scope', '$stateParams', 'EnketoDisplay',
	function($scope, $stateParams, EnketoDisplay) {
		var record;
		$scope.loading = true;
		db.get($stateParams.id)
			.then(function(r) {
				record = r;
				return db.get(record.formId);
			})
			.then(function(formDoc) {
				return EnketoDisplay($scope, formDoc, record);
			})
			.catch(function(err) {
				logError(err);
				$scope.loading = false;
				$scope.err = err;
			});
	}
]);

app.controller('RecordEditIndexController', [
	'$scope',
	function($scope) {
		function refresh() {
			$scope.loading = true;
			db.query('records_unfinalised', { include_docs:true })
				.then(function(res) {
					$scope.records = _.map(res.rows, 'doc');
					$scope.loading = false;
					$scope.$apply();
				})
				.catch(function(err) {
					$scope.loading = false;
					logError(err);
					$scope.$apply();
				});
		}

		$scope.delete = function(record) {
			db.remove(record)
				.then(refresh)
				.catch(logError);
		};

		refresh();
	}
]);

app.controller('FormListController', [
	'$scope',
	function($scope) {
		$scope.loading = true;
		db.query('forms', { include_docs:true })
			.then(function(res) {
				$scope.loading = false;
				$scope.forms = _.map(res.rows, 'doc');
				$scope.$apply();
			})
			.catch(logError);
	}
]);

app.controller('FormNewController', [
	'$scope', '$stateParams', 'EnketoDisplay',
	function($scope, $stateParams, EnketoDisplay) {
		$scope.loading = true;
		db.get($stateParams.id)
			.then(function(formDoc) {
				return EnketoDisplay($scope, formDoc);
			})
			.catch(function(err) {
				logError(err);
				$scope.loading = false;
				$scope.error = err;
			});
	}
]);

app.controller('RecordSubmitIndexController', [
	'$q', '$scope', 'Adapter',
	function($q, $scope, Adapter) {
		$scope.smsEnabled = Adapter().smsEnabled();

		function refreshAvailable() {
			$scope.loading = true;
			delete $scope.finalisedRecords;

			db.query('records_finalised', { include_docs:true })
				.then(function(res) {
					$scope.finalisedRecords = _.map(res.rows, 'doc');
					$scope.loading = false;
					$scope.submit = [];
					_.each($scope.finalisedRecords, function(f, i) {
						$scope.submit[i] = false;
					});
					$scope.$apply();
				})
				.catch(function(err) {
					$scope.loading = false;
					logError(err);
					$scope.$apply();
				});
		}

		$scope.toggle = function(event, i) {
			if(event.target.nodeName === 'INPUT' &&
					event.target.getAttribute('type') === 'checkbox') {
				// let native checkbox handler deal with the click
			} else {
				$scope.submit[i] = !$scope.submit[i];
			}
		};

		$scope.toggleAll = function() {
			var select = !_.every($scope.submit);

			_.each($scope.submit, function(d, i) {
				$scope.submit[i] = select;
			});
		};

		$scope.submitSelected = function(protocol) {
			$scope.submitting = true;
			if(!protocol) protocol = 'web';

			var submissions = [];
			_.each($scope.submit, function(requested, i) {
				var record;

				if(!requested) return;

				record = $scope.finalisedRecords[i];

				submissions.push(
					Adapter().submit(protocol, record)
						.then(function() {
							db.remove(record);
						})
				);
			});

			$q.all(submissions)
				.then(function() {
					$scope.submitting = false;
					refreshAvailable();
				})
				.catch(function(err) {
					logError(err);
					$scope.submitting = false;
					refreshAvailable();
				});
		};

		refreshAvailable();
	}
]);

app.controller('FormFetchController', [
	'$scope', '$timeout', 'Adapter',
	function($scope, $timeout, Adapter) {
		$scope.refreshAvailable = function() {
			$scope.loading = true;
			delete $scope.availableForms;

			Adapter().fetchForms()
				.then(function(forms) {
					$scope.loading = false;
					$scope.availableForms = forms;
					$scope.download = [];
					_.each($scope.availableForms, function(f, i) {
						$scope.download[i] = false;
					});
				})
				.catch(function(err) {
					$scope.loading = false;
					logError(err);
				});
		};

		$scope.toggleAll = function() {
			var select = !_.every($scope.download);

			_.each($scope.download, function(d, i) {
				$scope.download[i] = select;
			});
		};

		$scope.fetchSelected = function() {
			_.each($scope.download, function(requested, i) {
				if(!requested) return;
				var form = $scope.availableForms[i];
				Adapter().fetchForm(form)
					.then(db.post.bind(db))
					.catch(logError);
			});
		};

		$scope.refreshAvailable();
	}
]);

require('./adapters');
