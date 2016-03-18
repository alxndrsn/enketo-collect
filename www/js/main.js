var ENKETO_CONTAINER = '#enketo-form .pages';

require('angular');
require('lodash');
var PouchDB = require('pouchdb');
// set window.jQuery for enketo's sake
var $ = window.jQuery = require('jquery');
var Enketo = require('enketo-core');
require('angular-ui-router');

var db;

var app = angular.module('EnketoCollectApp', [
	'ui.router',
]);

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

var ADAPTERS = {
	openrosa: {
		translateForms2local: function(res) {
			var xml = $(res.data);
			return _.map(xml.find('xform'), function(xform) {
				xform = $(xform);
				return {
					title: xform.find('name').text(),
					url: xform.find('downloadUrl').text(),
					remote_id: xform.find('formID').text(),
				};
			});
		},
	},
	ona: {
		translateForms2local: function(res) {
			return _.map(res.data, function(ona) {
				var local = _.pick(ona, ['title', 'url']);
				local.url = local.url + '/form.xml';
				local.remote_id = ona.formid;
				return local;
			});
		},
	},
};

app.service('Config', [
	function() {
		var config = {};

		// OpenRosa test URL
		config.serverUrl = '/samples/or/forms.xml';
		config.protocol = 'openrosa';

		// ONA test URL
		config.serverUrl = '/samples/ona/api/v1/forms?owner=mr_alex';
		config.protocol = 'ona';

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
						$scope.logError(err);
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

app.service('EnketoTransform', [
	'$http', '$q',
	function($http, $q) {
		function getStylesheet(url) {
			return $http.get(url, { responseType:'document' })
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
	'$scope', '$q',
	function($scope, $q) {
		$scope.loading = true;

		$scope.errors = [];

		$scope.logError = function(err) {
			console.log(err);
			$scope.errors.unshift({ date:new Date(), err:err });
		};

		db = new PouchDB('ncollect');

		ddocs = _.map({
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
						$scope.logError(err);
						return;
					}
					db.put(doc)
						.catch($scope.logError);
				});
		});
		$q.all(ddocs)
			.then(function() {
				$scope.loading = false;
			})
			.catch($scope.logError);
	}
]);

app.controller('MainMenuController', [
	'$scope',
	function($scope) {
	}
]);

app.controller('ConfigController', [
	'$scope', 'Config',
	function($scope, Config) {
		$scope.config = Config;
		$scope.version = '___VERSION___';
		$scope.serverUrl = 'http://localhost:8080/';

		$scope.smsSupported = window.enketo_collect_wrapper && enketo_collect_wrapper.sendSms;
	}
]);

app.controller('FormManageController', [
	'$scope',
	function($scope) {
		$scope.refresh = function() {
			$scope.loading = true;
			delete $scope.forms;
			db.query('forms', { include_docs:true })
				.then(function(res) {
					$scope.loading = false;
					$scope.forms = _.map(res.rows, 'doc');
					$scope.$apply();
				})
				.catch($scope.logError);
		};

		$scope.delete = function(form) {
			$scope.loading = true;
			db.remove({ _id:form._id, _rev:form._rev })
				.then($scope.refresh)
				.catch($scope.logError);
		};

		$scope.refresh();
	}
]);

app.controller('RecordEditController', [
	'$scope', '$stateParams', 'EnketoDisplay',
	function($scope, $stateParams, EnketoDisplay) {
		var record;
		db.get($stateParams.id)
			.then(function(r) {
				record = r;
				return db.get(record.formId);
			})
			.then(function(formDoc) {
				return EnketoDisplay($scope, formDoc, record);
			})
			.catch(function(err) {
				$scope.loading = false;
				$scope.logError(err);
			});
	}
]);

app.controller('RecordEditIndexController', [
	'$scope',
	function($scope) {
		$scope.refresh = function() {
			$scope.loading = true;
			db.query('records_unfinalised', { include_docs:true })
				.then(function(res) {
					$scope.records = _.map(res.rows, 'doc');
					$scope.loading = false;
					$scope.$apply();
				})
				.catch(function(err) {
					$scope.loading = false;
					$scope.logError(err);
					$scope.$apply();
				});
		};

		$scope.delete = function(record) {
			db.remove(record)
				.then($scope.refresh)
				.catch($scope.logError);
		};

		$scope.refresh();
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
			.catch($scope.logError);
	}
]);

app.controller('FormNewController', [
	'$scope', '$stateParams', 'EnketoDisplay',
	function($scope, $stateParams, EnketoDisplay) {
		db.get($stateParams.id)
			.then(function(formDoc) {
				return EnketoDisplay($scope, formDoc);
			})
			.catch(function(err) {
				$scope.loading = false;
				$scope.logError(err);
			});
	}
]);

app.controller('RecordSubmitIndexController', [
	'$http', '$q', '$scope', 'Config',
	function($http, $q, $scope, Config) {
		$scope.smsEnabled = window.enketo_collect_wrapper && enketo_collect_wrapper.sendSms &&
				Config.serverPhoneNumber;

		$scope.refreshAvailable = function() {
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
					$scope.logError(err);
					$scope.$apply();
				});
		};

		$scope.toggleAll = function() {
			var select = true;
			if(_.every($scope.submit)) {
				select = false;
			}
			_.each($scope.submit, function(d, i) {
				$scope.submit[i] = select;
			});
		};

		$scope.submitSelected = function(protocol) {
			$scope.submitting = true;
			if(!protocol) protocol = 'web';

			var submissions = [];
			_.each($scope.submit, function(requested, i) {
				if(!requested) return;

				var record = $scope.finalisedRecords[i];

				submissions.push($q(function(resolve, reject) {
					if(protocol === 'web') {
						// Manually build the form submit ourself, as we need the Content-Type hader
						// set, and Chrome seems to omit Blob content when submitting mutipart data
						// with e.g. `FormData`.
						var BOUNDARY = '-----FormBoundary' + Math.random().toString().substring(2);
						var data = BOUNDARY + '\r\n' +
								'Content-Disposition: form-data; name="xml_submission_file"\r\n' +
								'Content-Type: text/xml\r\n' +
								'\r\n' +
								record.data +
								'\r\n' + BOUNDARY;
						$.ajax({
							type: 'POST',
							url: Config.serverUrl,
							headers: {
								'X-OpenRosa-Version': '1.0',
								'Content-Type': 'multipart/form-data; boundary=' + BOUNDARY,
							},
							data: data,
							processData: false,
							success: resolve,
							error: reject,
						});
					} else if(protocol === 'sms') {
						var $data = $(record.data);
						var $vals = $data.children(':not(formhub):not(meta):not(instanceid)').eq(0).children();
						var message = $data.eq(0).attr('id');
						message += Array.prototype.join.call($vals.map(function(i, e) {
							return e.tagName + '#' + e.textContent;
						}), '#');
						try {
							enketo_collect_wrapper.sendSms(Config.serverPhoneNumber, message);
							resolve();
						} catch(e) {
							reject(e);
						}
					} else throw new Error('submitSelected', 'Unrecognised protocol', protocol);
				}));
			});

			$q.all(submissions)
				.then(function() {
					$scope.submitting = false;
					$scope.refreshAvailable();
				})
				.catch(function(err) {
					$scope.logError(err);
					$scope.submitting = false;
					$scope.refreshAvailable();
				});
		};

		$scope.refreshAvailable();
	}
]);

app.controller('FormFetchController', [
	'$http', '$scope', 'Config',
	function($http, $scope, Config) {
		$scope.refreshAvailable = function() {
			$scope.loading = true;
			delete $scope.availableForms;

			$http.get(Config.serverUrl)
				.then(function(res) {
					$scope.loading = false;
					$scope.availableForms = ADAPTERS[Config.protocol].translateForms2local(res);
					$scope.download = [];
					_.each($scope.availableForms, function(f, i) {
						$scope.download[i] = false;
					});
				})
				.catch(function(err) {
					$scope.loading = false;
					$scope.logError(err);
				});
		};

		$scope.toggleAll = function() {
			var select = true;
			if(_.every($scope.download)) {
				select = false;
			}
			_.each($scope.download, function(d, i) {
				$scope.download[i] = select;
			});
		};

		$scope.fetchSelected = function() {
			_.each($scope.download, function(requested, i) {
				if(!requested) return;
				var form = $scope.availableForms[i];
				$http.get(form.url)
					.then(function(res) {
						var xml = res.data;
						return db.post({
							type: 'form',
							title: form.title,
							remote_id: form.remote_id,
							xml: xml,
						});
					})
					.catch($scope.logError);
			});
		};

		$scope.refreshAvailable();
	}
]);
